const { query } = require('../config/database');

const SERVICE_TYPES = ['hajj', 'umrah', 'air_ticket', 'hotel', 'visa', 'tour', 'other'];
const WORKFLOW_STATUSES = ['draft', 'pending_approval', 'approved', 'finalized', 'partially_paid', 'paid', 'cancelled'];

function normalizeServiceType(raw) {
  const t = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (!t) return 'other';
  if (t.includes('hajj')) return 'hajj';
  if (t.includes('umrah')) return 'umrah';
  if (t === 'ticket' || t === 'air_ticket' || t.includes('air') || t.includes('flight')) return 'air_ticket';
  if (t.includes('hotel')) return 'hotel';
  if (t.includes('visa')) return 'visa';
  if (t.includes('tour')) return 'tour';
  if (SERVICE_TYPES.includes(t)) return t;
  return 'other';
}

function derivePaymentStatus(total, paid, due, currentStatus) {
  if (currentStatus === 'cancelled') return 'cancelled';
  const t = Number(total || 0);
  const p = Number(paid || 0);
  const d = Number(due ?? Math.max(0, t - p));
  if (t <= 0) return currentStatus === 'draft' ? 'draft' : currentStatus;
  if (p <= 0) return currentStatus;
  if (d <= 0 || p >= t) return 'paid';
  return 'partially_paid';
}

async function logAudit(invoiceId, action, performedBy, oldStatus, newStatus, notes) {
  await query(
    `INSERT INTO invoice_audit_log (invoice_id, action, performed_by, old_status, new_status, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [invoiceId, action, performedBy || null, oldStatus || null, newStatus || null, notes || null]
  );
}

async function getInvoiceById(id) {
  const result = await query(
    `SELECT i.*,
      CASE WHEN p.id IS NOT NULL THEN json_build_object('name', p.name, 'type', p.type) ELSE NULL END AS packages,
      CASE WHEN b.id IS NOT NULL THEN json_build_object('tracking_id', b.tracking_id, 'status', b.status, 'booking_type', b.booking_type) ELSE NULL END AS bookings
     FROM invoices i
     LEFT JOIN packages p ON i.package_id = p.id
     LEFT JOIN bookings b ON i.booking_id = b.id
     WHERE i.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function syncInvoiceFromBooking(bookingId, performedBy) {
  const bookingRes = await query(
    `SELECT b.*,
      pkg.name AS package_name,
      pkg.type AS package_type,
      prof.full_name AS profile_name,
      prof.phone AS profile_phone,
      prof.email AS profile_email,
      prof.address AS profile_address,
      prof.passport_number AS profile_passport,
      prof.nid_number AS profile_nid
     FROM bookings b
     LEFT JOIN packages pkg ON b.package_id = pkg.id
     LEFT JOIN profiles prof ON prof.user_id = b.user_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = bookingRes.rows[0];
  if (!booking) throw new Error('Booking not found');

  const serviceType = normalizeServiceType(booking.package_type);
  const total = Number(booking.total_amount || 0);
  const paid = Number(booking.paid_amount || 0);
  const due = Number(booking.due_amount ?? Math.max(0, total - paid));

  const flightDetails = serviceType === 'air_ticket' ? {
    passenger_name: booking.guest_name || booking.profile_name || null,
    passport_number: booking.guest_passport || booking.profile_passport || null,
    pnr_number: null,
    airline_name: null,
    ticket_number: null,
    flight_number: null,
    route: null,
    departure_date: null,
    departure_time: null,
    arrival_date: null,
    arrival_time: null,
    return_date: null,
    journey_type: null,
    travel_class: null,
  } : {};

  const existingRes = await query(
    `SELECT * FROM invoices WHERE booking_id = $1 AND status <> 'cancelled' ORDER BY created_at ASC LIMIT 1`,
    [bookingId]
  );
  const existing = existingRes.rows[0];

  if (existing) {
    const nextStatus = derivePaymentStatus(total, paid, due, existing.status);
    const updated = await query(
      `UPDATE invoices SET
        customer_id = $2,
        service_type = $3,
        customer_name = $4,
        customer_phone = $5,
        customer_email = $6,
        customer_address = $7,
        passport_number = $8,
        nid_number = $9,
        booking_reference = $10,
        package_id = $11,
        package_name = $12,
        total_amount = $13,
        paid_amount = $14,
        due_amount = $15,
        status = $16,
        flight_details = CASE WHEN $3 = 'air_ticket' THEN COALESCE(flight_details, '{}'::jsonb) || $17::jsonb ELSE flight_details END,
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        existing.id,
        booking.user_id,
        serviceType,
        booking.guest_name || booking.profile_name,
        booking.guest_phone || booking.profile_phone,
        booking.guest_email || booking.profile_email,
        booking.guest_address || booking.profile_address,
        booking.guest_passport || booking.profile_passport,
        booking.profile_nid,
        booking.tracking_id,
        booking.package_id,
        booking.package_name,
        total,
        paid,
        due,
        nextStatus,
        JSON.stringify(flightDetails),
      ]
    );
    if (existing.status !== nextStatus) {
      await logAudit(existing.id, 'sync_payment', performedBy, existing.status, nextStatus, 'Updated from booking payment totals');
    }
    return updated.rows[0];
  }

  const numberRes = await query('SELECT next_invoice_number() AS invoice_number');
  const invoiceNumber = numberRes.rows[0].invoice_number;

  const inserted = await query(
    `INSERT INTO invoices (
      invoice_number, booking_id, customer_id, service_type, status, invoice_date,
      customer_name, customer_phone, customer_email, customer_address,
      passport_number, nid_number, booking_reference, package_id, package_name,
      total_amount, paid_amount, due_amount, flight_details, notes
    ) VALUES (
      $1, $2, $3, $4, 'draft', CURRENT_DATE,
      $5, $6, $7, $8,
      $9, $10, $11, $12, $13,
      $14, $15, $16, $17::jsonb, $18
    ) RETURNING *`,
    [
      invoiceNumber,
      bookingId,
      booking.user_id,
      serviceType,
      booking.guest_name || booking.profile_name,
      booking.guest_phone || booking.profile_phone,
      booking.guest_email || booking.profile_email,
      booking.guest_address || booking.profile_address,
      booking.guest_passport || booking.profile_passport,
      booking.profile_nid,
      booking.tracking_id,
      booking.package_id,
      booking.package_name,
      total,
      paid,
      due,
      JSON.stringify(flightDetails),
      booking.notes,
    ]
  );
  const invoice = inserted.rows[0];
  await logAudit(invoice.id, 'create', performedBy, null, 'draft', 'Auto-generated from booking');
  return invoice;
}

async function syncInvoiceFromHotelBooking(hotelBookingId, performedBy) {
  const res = await query(
    `SELECT hb.*, h.name AS hotel_name, prof.full_name, prof.phone, prof.email, prof.address, prof.passport_number, prof.nid_number
     FROM hotel_bookings hb
     LEFT JOIN hotels h ON hb.hotel_id = h.id
     LEFT JOIN profiles prof ON prof.user_id = hb.user_id
     WHERE hb.id = $1`,
    [hotelBookingId]
  );
  const hb = res.rows[0];
  if (!hb) throw new Error('Hotel booking not found');

  const existingRes = await query(
    `SELECT * FROM invoices WHERE hotel_booking_id = $1 AND status <> 'cancelled' LIMIT 1`,
    [hotelBookingId]
  );
  if (existingRes.rows[0]) return existingRes.rows[0];

  const numberRes = await query('SELECT next_invoice_number() AS invoice_number');
  const total = Number(hb.total_price || 0);
  const inserted = await query(
    `INSERT INTO invoices (
      invoice_number, hotel_booking_id, customer_id, service_type, status, invoice_date,
      customer_name, customer_phone, customer_email, customer_address, passport_number, nid_number,
      package_name, total_amount, paid_amount, due_amount, notes
    ) VALUES ($1, $2, $3, 'hotel', 'draft', CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10, $11, 0, $11, $12)
    RETURNING *`,
    [
      numberRes.rows[0].invoice_number,
      hotelBookingId,
      hb.user_id,
      hb.full_name,
      hb.phone,
      hb.email,
      hb.address,
      hb.passport_number,
      hb.nid_number,
      hb.hotel_name,
      total,
      hb.notes,
    ]
  );
  const invoice = inserted.rows[0];
  await logAudit(invoice.id, 'create', performedBy, null, 'draft', 'Auto-generated from hotel booking');
  return invoice;
}

async function transitionInvoice(id, action, userId, payload = {}) {
  const invoice = await getInvoiceById(id);
  if (!invoice) throw new Error('Invoice not found');

  const oldStatus = invoice.status;
  let newStatus = oldStatus;
  const fields = [];
  const params = [id];
  let idx = 2;

  const setField = (col, val) => {
    fields.push(`${col} = $${idx}`);
    params.push(val);
    idx += 1;
  };

  switch (action) {
    case 'submit':
      if (!['draft'].includes(oldStatus)) throw new Error('Only draft invoices can be submitted');
      newStatus = 'pending_approval';
      break;
    case 'approve':
      if (!['draft', 'pending_approval'].includes(oldStatus)) throw new Error('Invoice cannot be approved in current status');
      newStatus = 'approved';
      setField('approved_by', userId);
      setField('approved_at', new Date().toISOString());
      break;
    case 'reject':
      if (!['pending_approval', 'approved'].includes(oldStatus)) throw new Error('Invoice cannot be rejected in current status');
      newStatus = 'draft';
      setField('rejected_by', userId);
      setField('rejected_at', new Date().toISOString());
      setField('rejection_reason', payload.reason || null);
      break;
    case 'finalize':
      if (!['approved', 'partially_paid', 'paid', 'draft', 'pending_approval'].includes(oldStatus)) {
        throw new Error('Invoice cannot be finalized in current status');
      }
      if (['draft', 'pending_approval'].includes(oldStatus)) {
        setField('approved_by', userId);
        setField('approved_at', new Date().toISOString());
      }
      newStatus = derivePaymentStatus(invoice.total_amount, invoice.paid_amount, invoice.due_amount, 'finalized');
      if (!['partially_paid', 'paid'].includes(newStatus)) newStatus = 'finalized';
      setField('finalized_by', userId);
      setField('finalized_at', new Date().toISOString());
      break;
    case 'cancel':
      if (oldStatus === 'cancelled') throw new Error('Invoice is already cancelled');
      newStatus = 'cancelled';
      setField('cancelled_by', userId);
      setField('cancelled_at', new Date().toISOString());
      break;
    default:
      throw new Error('Unknown action');
  }

  setField('status', newStatus);
  fields.push('updated_at = now()');

  const result = await query(
    `UPDATE invoices SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  await logAudit(id, action, userId, oldStatus, newStatus, payload.notes || null);
  return result.rows[0];
}

async function updateInvoice(id, data, userId) {
  const allowed = [
    'customer_name', 'customer_phone', 'customer_email', 'customer_address',
    'passport_number', 'nid_number', 'nationality', 'service_type', 'notes',
    'total_amount', 'paid_amount', 'due_amount', 'flight_details', 'line_items', 'invoice_date',
  ];
  const sets = [];
  const params = [id];
  let idx = 2;
  allowed.forEach((key) => {
    if (data[key] !== undefined) {
      sets.push(`${key} = $${idx}${key === 'flight_details' || key === 'line_items' ? '::jsonb' : ''}`);
      params.push(key === 'flight_details' || key === 'line_items' ? JSON.stringify(data[key]) : data[key]);
      idx += 1;
    }
  });
  if (sets.length === 0) throw new Error('No valid fields to update');
  sets.push('updated_at = now()');
  const result = await query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  if (!result.rows[0]) throw new Error('Invoice not found');
  await logAudit(id, 'update', userId, result.rows[0].status, result.rows[0].status, 'Invoice updated');
  return result.rows[0];
}

async function listInvoices(filters = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  const add = (sql, val) => {
    conditions.push(sql.replace('?', `$${idx}`));
    params.push(val);
    idx += 1;
  };

  if (filters.status && filters.status !== 'all') add('i.status = ?', filters.status);
  if (filters.service_type && filters.service_type !== 'all') add('i.service_type = ?', filters.service_type);
  if (filters.customer_id) add('i.customer_id = ?', filters.customer_id);
  if (filters.package_id) add('i.package_id = ?', filters.package_id);
  if (filters.invoice_number) add('i.invoice_number ILIKE ?', `%${filters.invoice_number}%`);
  if (filters.customer) {
    conditions.push(`(i.customer_name ILIKE $${idx} OR i.customer_phone ILIKE $${idx})`);
    params.push(`%${filters.customer}%`);
    idx += 1;
  }
  if (filters.passport) add('i.passport_number ILIKE ?', `%${filters.passport}%`);
  if (filters.pnr) add(`i.flight_details->>'pnr_number' ILIKE ?`, `%${filters.pnr}%`);
  if (filters.date_from) add('i.invoice_date >= ?', filters.date_from);
  if (filters.date_to) add('i.invoice_date <= ?', filters.date_to);

  let sql = `SELECT i.*,
    CASE WHEN p.id IS NOT NULL THEN json_build_object('name', p.name, 'type', p.type) ELSE NULL END AS packages,
    CASE WHEN b.id IS NOT NULL THEN json_build_object('tracking_id', b.tracking_id, 'status', b.status) ELSE NULL END AS bookings
    FROM invoices i
    LEFT JOIN packages p ON i.package_id = p.id
    LEFT JOIN bookings b ON i.booking_id = b.id`;
  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ` ORDER BY i.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(Number(filters.limit) || 500, Number(filters.offset) || 0);

  const result = await query(sql, params);
  return result.rows;
}

async function getInvoiceStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
      COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending_count,
      COUNT(*) FILTER (WHERE status = 'finalized') AS finalized_count,
      COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE status IN ('partially_paid', 'approved', 'finalized') AND due_amount > 0) AS outstanding_count,
      COALESCE(SUM(total_amount), 0) AS total_revenue,
      COALESCE(SUM(paid_amount), 0) AS total_collected,
      COALESCE(SUM(due_amount), 0) AS total_due
    FROM invoices
    WHERE status <> 'cancelled'
  `);
  return result.rows[0];
}

module.exports = {
  SERVICE_TYPES,
  WORKFLOW_STATUSES,
  normalizeServiceType,
  getInvoiceById,
  listInvoices,
  getInvoiceStats,
  syncInvoiceFromBooking,
  syncInvoiceFromHotelBooking,
  transitionInvoice,
  updateInvoice,
  logAudit,
};
