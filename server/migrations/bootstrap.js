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

  await backfillInvoicesFromBookings();
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
