const express = require('express');
const { query } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const invoiceService = require('../services/invoiceService');

const router = express.Router();
const staffRoles = ['admin', 'accountant', 'viewer', 'booking'];

router.get('/stats', authenticate, requireRole(...staffRoles), async (req, res) => {
  try {
    const stats = await invoiceService.getInvoiceStats();
    res.json(stats);
  } catch (err) {
    console.error('GET /api/invoices/stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticate, requireRole(...staffRoles), async (req, res) => {
  try {
    const rows = await invoiceService.listInvoices(req.query || {});
    res.json(rows);
  } catch (err) {
    console.error('GET /api/invoices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, requireRole(...staffRoles), async (req, res) => {
  try {
    const row = await invoiceService.getInvoiceById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Invoice not found' });
    res.json(row);
  } catch (err) {
    console.error('GET /api/invoices/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/audit', authenticate, requireRole(...staffRoles), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM invoice_audit_log WHERE invoice_id = $1 ORDER BY performed_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', authenticate, requireRole('admin', 'accountant'), async (req, res) => {
  try {
    const row = await invoiceService.updateInvoice(req.params.id, req.body || {}, req.user?.id);
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/action/:action', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { action } = req.params;
    const row = await invoiceService.transitionInvoice(req.params.id, action, req.user?.id, req.body || {});
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sync/booking/:bookingId', authenticate, requireRole(...staffRoles), async (req, res) => {
  try {
    const row = await invoiceService.syncInvoiceFromBooking(req.params.bookingId, req.user?.id);
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sync/hotel-booking/:hotelBookingId', authenticate, requireRole(...staffRoles), async (req, res) => {
  try {
    const row = await invoiceService.syncInvoiceFromHotelBooking(req.params.hotelBookingId, req.user?.id);
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
