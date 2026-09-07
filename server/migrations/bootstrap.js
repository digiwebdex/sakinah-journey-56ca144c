const { query } = require('../config/database');

/** Idempotent schema patches for columns/tables added after initial deploy. */
async function runBootMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS invoice_sequences (
      year INTEGER PRIMARY KEY,
      last_number INTEGER NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number TEXT NOT NULL UNIQUE,
      booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
      hotel_booking_id UUID REFERENCES hotel_bookings(id) ON DELETE SET NULL,
      payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
      customer_id UUID,
      service_type TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'draft',
      invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      customer_address TEXT,
      passport_number TEXT,
      nid_number TEXT,
      nationality TEXT,
      booking_reference TEXT,
      package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
      package_name TEXT,
      total_amount NUMERIC NOT NULL DEFAULT 0,
      paid_amount NUMERIC NOT NULL DEFAULT 0,
      due_amount NUMERIC NOT NULL DEFAULT 0,
      flight_details JSONB NOT NULL DEFAULT '{}',
      line_items JSONB NOT NULL DEFAULT '[]',
      notes TEXT,
      approved_by UUID,
      approved_at TIMESTAMPTZ,
      finalized_by UUID,
      finalized_at TIMESTAMPTZ,
      cancelled_by UUID,
      cancelled_at TIMESTAMPTZ,
      rejected_by UUID,
      rejected_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_booking
      ON invoices (booking_id)
      WHERE booking_id IS NOT NULL AND status <> 'cancelled'
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status)');
  await query('CREATE INDEX IF NOT EXISTS idx_invoices_service_type ON invoices (service_type)');
  await query('CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices (invoice_date)');

  await query(`
    CREATE TABLE IF NOT EXISTS invoice_audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      performed_by UUID,
      performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      old_status TEXT,
      new_status TEXT,
      notes TEXT
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_invoice_audit_invoice_id ON invoice_audit_log (invoice_id)');

  await query(`
    CREATE OR REPLACE FUNCTION next_invoice_number()
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      yr INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
      seq INTEGER;
    BEGIN
      INSERT INTO invoice_sequences (year, last_number) VALUES (yr, 0)
      ON CONFLICT (year) DO NOTHING;
      UPDATE invoice_sequences SET last_number = last_number + 1 WHERE year = yr
      RETURNING last_number INTO seq;
      RETURN 'INV-' || yr || '-' || LPAD(seq::TEXT, 6, '0');
    END;
    $$
  `);

  // Per-package supplier contracts: what a supplier is owed for one package,
  // agreed up front, independent of individual pilgrim bookings.
  await query(`
    CREATE TABLE IF NOT EXISTS package_supplier_contracts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      supplier_agent_id UUID NOT NULL REFERENCES supplier_agents(id) ON DELETE CASCADE,
      contract_amount NUMERIC NOT NULL DEFAULT 0,
      contracted_pax INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (package_id, supplier_agent_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_psc_package ON package_supplier_contracts(package_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_psc_supplier ON package_supplier_contracts(supplier_agent_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sap_package ON supplier_agent_payments(package_id)`);

  await applyPaymentLedgerFixes();
  await applyFinanceUpdateLedgerFixes();

  await backfillInvoicesFromBookings();
}

/**
 * Fix UPDATE-desync in the moallem / supplier / commission ledger triggers.
 *
 * These triggers fire on INSERT OR UPDATE OR DELETE, but their function bodies
 * only ever had INSERT and DELETE branches — TG_OP = 'UPDATE' was a no-op. The
 * admin profile pages allow editing a payment's amount/wallet (.update().eq), so
 * an edit silently left the transactions ledger row, the wallet balance, and
 * (because the summary is derived from the ledger) financial_summary all stale.
 *
 * Each function is rewritten so the old row is reversed on UPDATE/DELETE and the
 * new row is applied on INSERT/UPDATE — mirroring the corrected payment trigger.
 * The moallem wallet trigger additionally needs to start firing on UPDATE.
 */
async function applyFinanceUpdateLedgerFixes() {
  // Supplier agent payments (expense side: subtract from wallet, expense ledger row).
  await query(`
    CREATE OR REPLACE FUNCTION public.on_supplier_payment_changed()
    RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE
      v_agent_name TEXT;
      v_wallet_balance NUMERIC;
      v_total_income NUMERIC;
      v_total_expense NUMERIC;
      v_expense_total NUMERIC;
    BEGIN
      -- Reverse old wallet/ledger state on UPDATE or DELETE.
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.wallet_account_id IS NOT NULL THEN
          UPDATE accounts SET balance = balance + OLD.amount, updated_at = now() WHERE id = OLD.wallet_account_id;
        END IF;
        DELETE FROM transactions WHERE reference = OLD.id::text AND type = 'expense' AND category = 'supplier_payment';
      END IF;

      -- Apply new wallet/ledger state on INSERT or UPDATE.
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.wallet_account_id IS NOT NULL THEN
          SELECT balance INTO v_wallet_balance FROM accounts WHERE id = NEW.wallet_account_id;
          IF COALESCE(v_wallet_balance, 0) < NEW.amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
          UPDATE accounts SET balance = balance - NEW.amount, updated_at = now() WHERE id = NEW.wallet_account_id;
        END IF;
        SELECT agent_name INTO v_agent_name FROM supplier_agents WHERE id = NEW.supplier_agent_id;
        INSERT INTO transactions (type, category, amount, debit, credit, source_type, source_id, user_id, date, note, payment_method, reference)
        VALUES ('expense', 'supplier_payment', NEW.amount, 0, NEW.amount, 'supplier', NEW.supplier_agent_id,
          COALESCE(NEW.recorded_by, '00000000-0000-0000-0000-000000000000'::uuid),
          NEW.date, 'Supplier payment to ' || COALESCE(v_agent_name, 'Unknown'), NEW.payment_method, NEW.id::text);
      END IF;

      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO v_total_income, v_total_expense FROM transactions;
      SELECT COALESCE(SUM(amount), 0) INTO v_expense_total FROM expenses;
      v_total_expense := v_total_expense + v_expense_total;
      IF EXISTS (SELECT 1 FROM financial_summary LIMIT 1) THEN
        UPDATE financial_summary SET total_income = v_total_income, total_expense = v_total_expense, net_profit = v_total_income - v_total_expense, updated_at = now();
      ELSE
        INSERT INTO financial_summary (total_income, total_expense, net_profit) VALUES (v_total_income, v_total_expense, v_total_income - v_total_expense);
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $function$
  `);

  // Moallem commission payments (expense side).
  await query(`
    CREATE OR REPLACE FUNCTION public.on_commission_payment_changed()
    RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE
      v_moallem_name TEXT;
      v_wallet_balance NUMERIC;
      v_total_income NUMERIC;
      v_total_expense NUMERIC;
      v_expense_total NUMERIC;
    BEGIN
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.wallet_account_id IS NOT NULL THEN
          UPDATE accounts SET balance = balance + OLD.amount, updated_at = now() WHERE id = OLD.wallet_account_id;
        END IF;
        DELETE FROM transactions WHERE reference = OLD.id::text AND type = 'expense' AND category = 'commission_payment';
      END IF;

      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.wallet_account_id IS NOT NULL THEN
          SELECT balance INTO v_wallet_balance FROM accounts WHERE id = NEW.wallet_account_id;
          IF COALESCE(v_wallet_balance, 0) < NEW.amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
          UPDATE accounts SET balance = balance - NEW.amount, updated_at = now() WHERE id = NEW.wallet_account_id;
        END IF;
        SELECT name INTO v_moallem_name FROM moallems WHERE id = NEW.moallem_id;
        INSERT INTO transactions (type, category, amount, debit, credit, source_type, source_id, user_id, date, note, payment_method, reference)
        VALUES ('expense', 'commission_payment', NEW.amount, 0, NEW.amount, 'commission', NEW.moallem_id,
          COALESCE(NEW.recorded_by, '00000000-0000-0000-0000-000000000000'::uuid),
          NEW.date, 'Commission payment to ' || COALESCE(v_moallem_name, 'Unknown'), NEW.payment_method, NEW.id::text);
      END IF;

      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO v_total_income, v_total_expense FROM transactions;
      SELECT COALESCE(SUM(amount), 0) INTO v_expense_total FROM expenses;
      v_total_expense := v_total_expense + v_expense_total;
      IF EXISTS (SELECT 1 FROM financial_summary LIMIT 1) THEN
        UPDATE financial_summary SET total_income = v_total_income, total_expense = v_total_expense, net_profit = v_total_income - v_total_expense, updated_at = now();
      ELSE
        INSERT INTO financial_summary (total_income, total_expense, net_profit) VALUES (v_total_income, v_total_expense, v_total_income - v_total_expense);
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $function$
  `);

  // Moallem payments — income side (add to Revenue + income ledger row).
  await query(`
    CREATE OR REPLACE FUNCTION public.on_moallem_payment_income()
    RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE
      v_moallem_name TEXT;
      v_total_income NUMERIC;
      v_total_expense NUMERIC;
      v_expense_total NUMERIC;
    BEGIN
      SELECT name INTO v_moallem_name FROM moallems WHERE id = COALESCE(NEW.moallem_id, OLD.moallem_id);

      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        DELETE FROM transactions WHERE reference = OLD.id::text AND type = 'income' AND category = 'moallem_payment';
        UPDATE accounts SET balance = GREATEST(0, balance - OLD.amount), updated_at = now() WHERE type = 'income' AND name = 'Revenue';
      END IF;

      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO transactions (type, category, amount, debit, credit, source_type, source_id, user_id, date, note, payment_method, reference, booking_id)
        VALUES ('income', 'moallem_payment', NEW.amount, NEW.amount, 0, 'moallem', NEW.moallem_id,
          COALESCE(NEW.recorded_by, '00000000-0000-0000-0000-000000000000'::uuid),
          NEW.date, 'Moallem payment from ' || COALESCE(v_moallem_name, 'Unknown'), NEW.payment_method, NEW.id::text, NEW.booking_id);
        UPDATE accounts SET balance = balance + NEW.amount, updated_at = now() WHERE type = 'income' AND name = 'Revenue';
        IF NOT FOUND THEN INSERT INTO accounts (name, type, balance) VALUES ('Revenue', 'income', NEW.amount); END IF;
      END IF;

      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO v_total_income, v_total_expense FROM transactions;
      SELECT COALESCE(SUM(amount), 0) INTO v_expense_total FROM expenses;
      v_total_expense := v_total_expense + v_expense_total;
      IF EXISTS (SELECT 1 FROM financial_summary LIMIT 1) THEN
        UPDATE financial_summary SET total_income = v_total_income, total_expense = v_total_expense, net_profit = v_total_income - v_total_expense, updated_at = now();
      ELSE
        INSERT INTO financial_summary (total_income, total_expense, net_profit) VALUES (v_total_income, v_total_expense, v_total_income - v_total_expense);
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $function$
  `);

  // Moallem payments — wallet side (deposit into wallet). Reverse on UPDATE/DELETE,
  // apply on INSERT/UPDATE. The trigger must also start firing on UPDATE.
  await query(`
    CREATE OR REPLACE FUNCTION public.on_moallem_payment_wallet()
    RETURNS trigger LANGUAGE plpgsql AS $function$
    BEGIN
      IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.wallet_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = GREATEST(0, balance - OLD.amount), updated_at = now() WHERE id = OLD.wallet_account_id;
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.wallet_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + NEW.amount, updated_at = now() WHERE id = NEW.wallet_account_id;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END;
    $function$
  `);
  await query('DROP TRIGGER IF EXISTS trg_on_moallem_payment_wallet ON moallem_payments');
  await query(`
    CREATE TRIGGER trg_on_moallem_payment_wallet
    AFTER INSERT OR UPDATE OR DELETE ON moallem_payments
    FOR EACH ROW EXECUTE FUNCTION on_moallem_payment_wallet()
  `);

  // Reconcile financial_summary from the (now-consistent) ledger.
  await query(`
    UPDATE financial_summary SET
      total_income = sub.income,
      total_expense = sub.expense,
      net_profit = sub.income - sub.expense,
      updated_at = now()
    FROM (
      SELECT
        (SELECT COALESCE(SUM(debit), 0) FROM transactions) AS income,
        (SELECT COALESCE(SUM(credit), 0) FROM transactions)
          + (SELECT COALESCE(SUM(amount), 0) FROM expenses) AS expense
    ) sub
  `);
}

/**
 * Fix the customer-payment financial ledger.
 *
 * The original on_payment_completed() trigger only fired on INSERT/UPDATE and
 * only acted when a payment *became* completed. That left two desync bugs,
 * unlike every sibling finance trigger (moallem/supplier/expense) which all
 * handle INSERT OR DELETE OR UPDATE:
 *   1. Deleting a completed payment left an orphan income transaction plus an
 *      inflated Revenue/wallet balance and financial_summary.
 *   2. Editing the amount (or wallet) of an already-completed payment never
 *      resynced the ledger, because OLD.status was already 'completed'.
 *
 * This rewrites the function to reverse the old state and apply the new state
 * on every operation, and recreates the trigger to also fire on DELETE.
 */
async function applyPaymentLedgerFixes() {
  await query(`
    CREATE OR REPLACE FUNCTION public.on_payment_completed()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      v_booking RECORD;
      v_total_income NUMERIC;
      v_total_expense NUMERIC;
      v_expense_total NUMERIC;
    BEGIN
      -- Reverse the previously-recorded completed state (DELETE, or UPDATE that
      -- changes amount/wallet/status away from completed).
      IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.status = 'completed' THEN
        DELETE FROM transactions
          WHERE reference = OLD.id::text AND type = 'income' AND category = 'payment';
        UPDATE accounts SET balance = GREATEST(0, balance - OLD.amount), updated_at = now()
          WHERE type = 'income' AND name = 'Revenue';
        IF OLD.wallet_account_id IS NOT NULL THEN
          UPDATE accounts SET balance = GREATEST(0, balance - OLD.amount), updated_at = now()
            WHERE id = OLD.wallet_account_id;
        END IF;
      END IF;

      -- Apply the new completed state (INSERT, or UPDATE into/within completed).
      IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.status = 'completed' THEN
        SELECT id, tracking_id, package_id, user_id INTO v_booking FROM bookings WHERE id = NEW.booking_id;
        INSERT INTO transactions (type, category, amount, debit, credit, source_type, source_id, booking_id, user_id, date, note, payment_method, customer_id, reference)
        VALUES ('income', 'payment', NEW.amount, NEW.amount, 0, 'customer', NEW.customer_id, NEW.booking_id,
          COALESCE(NEW.user_id, v_booking.user_id, '00000000-0000-0000-0000-000000000000'::uuid),
          CURRENT_DATE, 'Payment #' || COALESCE(NEW.installment_number::text, 'N/A') || ' for ' || COALESCE(v_booking.tracking_id, ''),
          NEW.payment_method, NEW.customer_id, NEW.id::text);

        UPDATE accounts SET balance = balance + NEW.amount, updated_at = now() WHERE type = 'income' AND name = 'Revenue';
        IF NOT FOUND THEN INSERT INTO accounts (name, type, balance) VALUES ('Revenue', 'income', NEW.amount); END IF;

        IF NEW.wallet_account_id IS NOT NULL THEN
          UPDATE accounts SET balance = balance + NEW.amount, updated_at = now() WHERE id = NEW.wallet_account_id;
        END IF;
      END IF;

      -- Recompute the financial summary from the ledger.
      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO v_total_income, v_total_expense FROM transactions;
      SELECT COALESCE(SUM(amount), 0) INTO v_expense_total FROM expenses;
      v_total_expense := v_total_expense + v_expense_total;
      IF EXISTS (SELECT 1 FROM financial_summary LIMIT 1) THEN
        UPDATE financial_summary SET total_income = v_total_income, total_expense = v_total_expense, net_profit = v_total_income - v_total_expense, updated_at = now();
      ELSE
        INSERT INTO financial_summary (total_income, total_expense, net_profit) VALUES (v_total_income, v_total_expense, v_total_income - v_total_expense);
      END IF;

      RETURN COALESCE(NEW, OLD);
    END;
    $function$
  `);

  // Recreate the trigger so it also fires on DELETE (event list cannot be
  // changed via CREATE OR REPLACE on older Postgres).
  await query('DROP TRIGGER IF EXISTS trg_on_payment_completed ON payments');
  await query(`
    CREATE TRIGGER trg_on_payment_completed
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION on_payment_completed()
  `);

  // One-time reconciliation of state left behind by the old trigger.
  // 1. Drop orphan customer-payment income transactions (payment deleted or no longer completed).
  await query(`
    DELETE FROM transactions t
    WHERE t.type = 'income' AND t.category = 'payment'
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.id::text = t.reference AND p.status = 'completed'
      )
  `);

  // 2. Collapse duplicate financial_summary rows into a single canonical row.
  await query(`
    DELETE FROM financial_summary
    WHERE id NOT IN (SELECT id FROM financial_summary ORDER BY updated_at DESC NULLS LAST LIMIT 1)
  `);

  // 3. Resync the single summary row from the reconciled ledger.
  await query(`
    UPDATE financial_summary SET
      total_income = sub.income,
      total_expense = sub.expense,
      net_profit = sub.income - sub.expense,
      updated_at = now()
    FROM (
      SELECT
        (SELECT COALESCE(SUM(debit), 0) FROM transactions) AS income,
        (SELECT COALESCE(SUM(credit), 0) FROM transactions)
          + (SELECT COALESCE(SUM(amount), 0) FROM expenses) AS expense
    ) sub
  `);
}

async function backfillInvoicesFromBookings() {
  const invoiceService = require('../services/invoiceService');
  const missing = await query(`
    SELECT b.id
    FROM bookings b
    WHERE b.status <> 'cancelled'
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.booking_id = b.id AND i.status <> 'cancelled'
      )
    ORDER BY b.created_at ASC
  `);

  for (const row of missing.rows) {
    try {
      await invoiceService.syncInvoiceFromBooking(row.id, null);
    } catch (err) {
      console.error(`Invoice backfill skipped for booking ${row.id}:`, err.message);
    }
  }

  if (missing.rows.length > 0) {
    console.log(`Invoice backfill: synced ${missing.rows.length} booking(s)`);
  }
}

module.exports = { runBootMigrations };
