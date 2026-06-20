const jwt = require('jsonwebtoken');
const path = require('path');
const { query } = require('../config/database');
const { requireRole } = require('./auth');

const STAFF_ROLES = ['admin', 'accountant', 'booking', 'cms', 'viewer'];
const PUBLIC_UPLOAD_BUCKETS = new Set(['company-assets', 'hotel-images']);
const SENSITIVE_UPLOAD_BUCKETS = new Set(['booking-documents', 'payment-receipts']);

const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_UPLOAD_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf']);

const sanitizeStoragePath = (input = '') =>
  String(input)
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/');

const requireStaffRole = requireRole(...STAFF_ROLES);

async function getUserRoles(userId) {
  const roleResult = await query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return roleResult.rows.map((r) => r.role);
}

function isStaffRole(roles = []) {
  return STAFF_ROLES.some((role) => roles.includes(role));
}

function resolveUploadPath(uploadsRoot, bucket, filePath) {
  const safeBucket = sanitizeStoragePath(bucket);
  const safePath = sanitizeStoragePath(filePath);
  if (!safeBucket || !safePath) throw new Error('Invalid path');

  const absolute = path.resolve(uploadsRoot, safeBucket, safePath);
  const bucketRoot = path.resolve(uploadsRoot, safeBucket);
  if (absolute !== bucketRoot && !absolute.startsWith(`${bucketRoot}${path.sep}`)) {
    throw new Error('Invalid path');
  }

  return {
    absolute,
    relative: `${safeBucket}/${safePath}`.replace(/\\/g, '/'),
  };
}

function parseStoredFilePath(storedPath = '') {
  const normalized = String(storedPath).replace(/^\/uploads\//, '').replace(/^\//, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return { bucket: parts[0], path: parts.slice(1).join('/') };
}

function signFileAccessToken(payload, expiresIn = '15m') {
  return jwt.sign(
    { ...payload, type: 'file_access' },
    process.env.JWT_SECRET,
    { expiresIn, algorithms: ['HS256'] }
  );
}

function verifyFileAccessToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (decoded.type !== 'file_access') throw new Error('Invalid token type');
  return decoded;
}

function isAllowedUpload(file) {
  if (!file) return false;
  const ext = String(file.originalname || '').split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) return false;
  if (file.mimetype && !ALLOWED_UPLOAD_MIMES.has(file.mimetype)) return false;
  return true;
}

async function canAccessUploadFile(userId, roles, bucket, filePath) {
  const safeBucket = sanitizeStoragePath(bucket);
  const safePath = sanitizeStoragePath(filePath);
  if (!safeBucket || !safePath) return false;

  if (isStaffRole(roles)) return true;

  if (safeBucket !== 'booking-documents') return false;

  const likePath = `%${safePath}`;
  const docResult = await query(
    `SELECT bd.id
     FROM booking_documents bd
     LEFT JOIN bookings b ON b.id = bd.booking_id
     WHERE (
       bd.file_path = $1
       OR bd.file_path = $2
       OR bd.file_path LIKE $3
       OR bd.file_path LIKE $4
     )
       AND (bd.user_id = $5 OR b.user_id = $5)
     LIMIT 1`,
    [
      safePath,
      `${safeBucket}/${safePath}`,
      `%/${safePath}`,
      likePath,
      userId,
    ]
  );
  return Boolean(docResult.rows[0]);
}

function redactPaymentMethods(value) {
  if (!Array.isArray(value)) return value;
  return value.map((method) => {
    if (!method || typeof method !== 'object') return method;
    const { api_key, api_secret, store_password, ...safe } = method;
    return safe;
  });
}

function redactCompanySettingRow(row) {
  if (!row || row.setting_key !== 'payment_methods') return row;
  const copy = { ...row };
  if (copy.setting_value) {
    copy.setting_value = redactPaymentMethods(copy.setting_value);
  }
  return copy;
}

function redactRows(tableName, rows) {
  if (tableName !== 'company_settings') return rows;
  return rows.map(redactCompanySettingRow);
}

module.exports = {
  STAFF_ROLES,
  PUBLIC_UPLOAD_BUCKETS,
  SENSITIVE_UPLOAD_BUCKETS,
  ALLOWED_UPLOAD_MIMES,
  sanitizeStoragePath,
  requireStaffRole,
  getUserRoles,
  isStaffRole,
  resolveUploadPath,
  parseStoredFilePath,
  signFileAccessToken,
  verifyFileAccessToken,
  isAllowedUpload,
  canAccessUploadFile,
  redactCompanySettingRow,
  redactRows,
};
