const API_URL = import.meta.env.VITE_API_URL || '/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('rk_access_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

export type InvoiceStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'finalized'
  | 'partially_paid'
  | 'paid'
  | 'cancelled';

export type InvoiceServiceType = 'hajj' | 'umrah' | 'air_ticket' | 'hotel' | 'visa' | 'tour' | 'other';

export interface FlightDetails {
  passenger_name?: string | null;
  passport_number?: string | null;
  pnr_number?: string | null;
  airline_name?: string | null;
  ticket_number?: string | null;
  flight_number?: string | null;
  route?: string | null;
  departure_date?: string | null;
  departure_time?: string | null;
  arrival_date?: string | null;
  arrival_time?: string | null;
  return_date?: string | null;
  journey_type?: string | null;
  travel_class?: string | null;
}

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  booking_id?: string | null;
  hotel_booking_id?: string | null;
  customer_id?: string | null;
  service_type: InvoiceServiceType;
  status: InvoiceStatus;
  invoice_date: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  passport_number?: string | null;
  nid_number?: string | null;
  nationality?: string | null;
  booking_reference?: string | null;
  package_id?: string | null;
  package_name?: string | null;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  flight_details?: FlightDetails | string;
  notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  finalized_by?: string | null;
  finalized_at?: string | null;
  packages?: { name?: string; type?: string } | null;
  bookings?: { tracking_id?: string; status?: string } | null;
}

export interface InvoiceFilters {
  invoice_number?: string;
  customer?: string;
  passport?: string;
  pnr?: string;
  package_id?: string;
  service_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const INVOICE_SERVICE_TYPES: { value: InvoiceServiceType; label: string }[] = [
  { value: 'hajj', label: 'Hajj' },
  { value: 'umrah', label: 'Umrah' },
  { value: 'air_ticket', label: 'Air Ticket' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'visa', label: 'Visa' },
  { value: 'tour', label: 'Tour' },
  { value: 'other', label: 'Other' },
];

export function parseFlightDetails(raw: InvoiceRecord['flight_details']): FlightDetails {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case 'paid': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'partially_paid': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'finalized': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'approved': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
    case 'pending_approval': return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
    case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

export async function fetchInvoices(filters: InvoiceFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
  const qs = params.toString();
  return apiRequest(`/invoices${qs ? `?${qs}` : ''}`) as Promise<InvoiceRecord[]>;
}

export async function fetchInvoiceStats() {
  return apiRequest('/invoices/stats') as Promise<{
    draft_count: string; pending_count: string; finalized_count: string;
    paid_count: string; outstanding_count: string;
    total_revenue: string; total_collected: string; total_due: string;
  }>;
}

export async function fetchInvoiceById(id: string) {
  return apiRequest(`/invoices/${id}`) as Promise<InvoiceRecord>;
}

export async function updateInvoiceRecord(id: string, data: Partial<InvoiceRecord> & { flight_details?: FlightDetails }) {
  return apiRequest(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }) as Promise<InvoiceRecord>;
}

export async function invoiceAction(id: string, action: 'submit' | 'approve' | 'reject' | 'finalize' | 'cancel', payload?: { reason?: string; notes?: string }) {
  return apiRequest(`/invoices/${id}/action/${action}`, { method: 'POST', body: JSON.stringify(payload || {}) }) as Promise<InvoiceRecord>;
}

export async function syncInvoiceFromBooking(bookingId: string) {
  return apiRequest(`/invoices/sync/booking/${bookingId}`, { method: 'POST', body: '{}' }) as Promise<InvoiceRecord>;
}

export async function syncInvoiceFromHotelBooking(hotelBookingId: string) {
  return apiRequest(`/invoices/sync/hotel-booking/${hotelBookingId}`, { method: 'POST', body: '{}' }) as Promise<InvoiceRecord>;
}

export function serviceTypeLabel(type: string) {
  return INVOICE_SERVICE_TYPES.find((s) => s.value === type)?.label || type.replace(/_/g, ' ');
}

export function statusLabel(status: string) {
  return INVOICE_STATUSES.find((s) => s.value === status)?.label || status.replace(/_/g, ' ');
}
