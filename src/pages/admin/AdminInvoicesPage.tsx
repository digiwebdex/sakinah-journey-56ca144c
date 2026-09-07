import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  FileText, Search, Filter, Eye, CheckCircle, XCircle, Printer, FileDown,
  Mail, Pencil, RefreshCw, Trash2,
} from "lucide-react";
import { supabase } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCanModifyFinancials, useAdminRole } from "@/components/admin/AdminLayout";
import AdminActionMenu from "@/components/admin/AdminActionMenu";
import { formatBDT, cn } from "@/lib/utils";
import { exportPDF, exportExcel } from "@/lib/reportExport";
import { generateInvoiceFromRecord } from "@/lib/invoiceGenerator";
import {
  fetchInvoices, fetchInvoiceById, invoiceAction, updateInvoiceRecord, deleteInvoiceRecord,
  INVOICE_STATUSES, INVOICE_SERVICE_TYPES, parseFlightDetails,
  statusBadgeClass, serviceTypeLabel, statusLabel, type InvoiceRecord, type FlightDetails,
} from "@/lib/invoiceRecords";

const inputClass = "w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm";

export default function AdminInvoicesPage() {
  const role = useAdminRole();
  const canModify = useCanModifyFinancials();
  const canApprove = role === "admin";
  const [rows, setRows] = useState<InvoiceRecord[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceRecord | null>(null);
  const [editFlight, setEditFlight] = useState<FlightDetails>({});
  const [deleteRow, setDeleteRow] = useState<InvoiceRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filters, setFilters] = useState({
    invoice_number: "", customer: "", passport: "", pnr: "",
    package_id: "all", service_type: "all", status: "all",
    date_from: "", date_to: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const payload = {
        ...filters,
        package_id: filters.package_id === "all" ? undefined : filters.package_id,
        service_type: filters.service_type === "all" ? undefined : filters.service_type,
        status: filters.status === "all" ? undefined : filters.status,
      };
      const data = await fetchInvoices(payload);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const message = err.message || "Failed to load invoices";
      setLoadError(message);
      setRows([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    supabase.from("packages").select("id, name, type").order("name").then(({ data }) => setPackages(data || []));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row: InvoiceRecord) => {
    try {
      const full = await fetchInvoiceById(row.id);
      setDetail(full);
      setEditFlight(parseFlightDetails(full.flight_details));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const runAction = async (id: string, action: "submit" | "approve" | "reject" | "finalize" | "cancel") => {
    try {
      const updated = await invoiceAction(id, action);
      toast.success(`Invoice ${statusLabel(updated.status)}`);
      await load();
      if (detail?.id === id) setDetail(updated);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await deleteInvoiceRecord(deleteRow.id);
      toast.success(`Invoice ${deleteRow.invoice_number} deleted`);
      setDeleteRow(null);
      load();
    } catch (err: any) {
      // The server refuses paid or finalised invoices; show its reason as-is.
      toast.error(err?.message || 'Could not delete this invoice');
    } finally {
      setDeleting(false);
    }
  };

  const saveFlightDetails = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = await updateInvoiceRecord(detail.id, { flight_details: editFlight });
      setDetail(updated);
      toast.success("Flight details saved");
      await load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async (row: InvoiceRecord) => {
    try {
      await generateInvoiceFromRecord(row);
    } catch (err: any) {
      toast.error(err.message || "PDF generation failed");
    }
  };

  const exportList = (type: "pdf" | "excel") => {
    const data = {
      title: "Central Invoice Register",
      columns: ["Invoice #", "Date", "Customer", "Service", "Booking Ref", "Package", "Total", "Paid", "Due", "Status"],
      rows: rows.map((r) => [
        r.invoice_number,
        r.invoice_date,
        r.customer_name || "—",
        serviceTypeLabel(r.service_type),
        r.booking_reference || "—",
        r.package_name || r.packages?.name || "—",
        Number(r.total_amount),
        Number(r.paid_amount),
        Number(r.due_amount),
        statusLabel(r.status),
      ]),
    };
    if (type === "pdf") exportPDF(data);
    else exportExcel(data);
  };

  const summary = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    return {
      total: list.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      paid: list.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
      due: list.reduce((s, r) => s + Number(r.due_amount || 0), 0),
    };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Invoices
          </h2>
          <p className="text-sm text-muted-foreground">Central invoice register — single source of truth for all billing</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportList("pdf")}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
          <Button size="sm" variant="outline" onClick={() => exportList("excel")}><FileDown className="h-4 w-4 mr-1" />Excel</Button>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Listed Total</p><p className="font-bold">{formatBDT(summary.total)}</p></CardContent></Card>
        <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Collected</p><p className="font-bold text-primary">{formatBDT(summary.paid)}</p></CardContent></Card>
        <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-bold text-destructive">{formatBDT(summary.due)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-xl p-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Invoice #" className="w-[120px] h-9" value={filters.invoice_number} onChange={(e) => setFilters({ ...filters, invoice_number: e.target.value })} />
        <Input placeholder="Customer" className="w-[140px] h-9" value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} />
        <Input placeholder="Passport" className="w-[120px] h-9" value={filters.passport} onChange={(e) => setFilters({ ...filters, passport: e.target.value })} />
        <Input placeholder="PNR" className="w-[100px] h-9" value={filters.pnr} onChange={(e) => setFilters({ ...filters, pnr: e.target.value })} />
        <Select value={filters.service_type} onValueChange={(v) => setFilters({ ...filters, service_type: v })}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Service" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {INVOICE_SERVICE_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.package_id} onValueChange={(v) => setFilters({ ...filters, package_id: v })}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Package" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Packages</SelectItem>
            {packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {INVOICE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-[130px] h-9" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        <Input type="date" className="w-[130px] h-9" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
        <Button size="sm" onClick={load}><Search className="h-4 w-4 mr-1" />Search</Button>
      </div>

      <Card className="border overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Booking Ref</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>}
                {!loading && loadError && <TableRow><TableCell colSpan={11} className="text-center py-8 text-destructive">{loadError}</TableCell></TableRow>}
                {!loading && !loadError && rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No invoices found</TableCell></TableRow>}
                {!loading && !loadError && rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-bold text-primary">{r.invoice_number}</TableCell>
                    <TableCell className="text-xs">{r.invoice_date ? format(parseISO(String(r.invoice_date)), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell><div className="text-sm font-medium">{r.customer_name || "—"}</div><div className="text-[10px] text-muted-foreground">{r.customer_phone || ""}</div></TableCell>
                    <TableCell className="text-xs capitalize">{serviceTypeLabel(r.service_type)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.booking_reference || r.bookings?.tracking_id || "—"}</TableCell>
                    <TableCell className="text-xs">{r.package_name || r.packages?.name || "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatBDT(Number(r.total_amount))}</TableCell>
                    <TableCell className="text-right text-sm text-primary">{formatBDT(Number(r.paid_amount))}</TableCell>
                    <TableCell className="text-right text-sm text-destructive">{formatBDT(Number(r.due_amount))}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("text-[10px] capitalize", statusBadgeClass(r.status))}>{statusLabel(r.status)}</Badge></TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <AdminActionMenu
                          primary={["View", "Edit", "Delete"]}
                          actions={[
                            { label: "View", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openDetail(r) },
                            // The detail dialog is also the editor — flight details are saved from it.
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openDetail(r), variant: "warning", hidden: !canApprove },
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteRow(r), variant: "destructive", hidden: !canApprove },
                            { label: "PDF", icon: <FileDown className="h-3.5 w-3.5" />, onClick: () => downloadPdf(r), separator: true },
                            { label: "Approve", icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => runAction(r.id, "approve"), variant: "success", hidden: !canApprove || r.status !== "draft" },
                            { label: "Finalize", icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => runAction(r.id, "finalize"), variant: "success", hidden: !canApprove || !["approved", "partially_paid"].includes(r.status) },
                            { label: "Cancel Invoice", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => runAction(r.id, "cancel"), variant: "warning", hidden: !canApprove || ["cancelled", "paid"].includes(r.status) },
                          ]}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  {detail.invoice_number}
                  <Badge variant="outline" className={cn("text-[10px]", statusBadgeClass(detail.status))}>{statusLabel(detail.status)}</Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground block">Customer</span>{detail.customer_name || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Phone</span>{detail.customer_phone || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Email</span>{detail.customer_email || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Passport</span>{detail.passport_number || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">NID</span>{detail.nid_number || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Nationality</span>{detail.nationality || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Service</span>{serviceTypeLabel(detail.service_type)}</div>
                <div><span className="text-xs text-muted-foreground block">Booking Ref</span>{detail.booking_reference || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Package</span>{detail.package_name || "—"}</div>
                <div><span className="text-xs text-muted-foreground block">Invoice Date</span>{detail.invoice_date || "—"}</div>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-primary/5 rounded-lg p-3 text-sm">
                <div><span className="text-xs text-muted-foreground">Total</span><p className="font-bold">{formatBDT(Number(detail.total_amount))}</p></div>
                <div><span className="text-xs text-muted-foreground">Paid</span><p className="font-bold text-primary">{formatBDT(Number(detail.paid_amount))}</p></div>
                <div><span className="text-xs text-muted-foreground">Due</span><p className="font-bold text-destructive">{formatBDT(Number(detail.due_amount))}</p></div>
              </div>

              {detail.service_type === "air_ticket" && canModify && (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Air Ticket Details</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["passenger_name", "Passenger Name"], ["passport_number", "Passport"], ["pnr_number", "PNR Number"],
                      ["airline_name", "Airline"], ["ticket_number", "Ticket Number"], ["flight_number", "Flight No"],
                      ["route", "Route"], ["departure_date", "Departure Date"], ["departure_time", "Departure Time"],
                      ["arrival_date", "Arrival Date"], ["return_date", "Return Date"], ["journey_type", "Journey Type"], ["travel_class", "Travel Class"],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="text-[10px] text-muted-foreground">{label}</label>
                        <input className={inputClass} value={(editFlight as any)[key] || ""} onChange={(e) => setEditFlight({ ...editFlight, [key]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={saveFlightDetails} disabled={saving}>{saving ? "Saving..." : "Save Flight Details"}</Button>
                </div>
              )}

              {detail.service_type === "air_ticket" && !canModify && (
                <div className="border rounded-lg p-3 text-xs grid grid-cols-2 gap-2">
                  {Object.entries(parseFlightDetails(detail.flight_details)).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span> {String(v)}</div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" onClick={() => downloadPdf(detail)}><FileDown className="h-4 w-4 mr-1" />Download PDF</Button>
                <Button size="sm" variant="outline" onClick={() => downloadPdf(detail)}><Printer className="h-4 w-4 mr-1" />Print</Button>
                {detail.customer_email && (
                  <Button size="sm" variant="outline" onClick={() => { window.location.href = `mailto:${detail.customer_email}?subject=Invoice ${detail.invoice_number}`; }}>
                    <Mail className="h-4 w-4 mr-1" />Send Email
                  </Button>
                )}
                {canApprove && detail.status === "draft" && <Button size="sm" onClick={() => runAction(detail.id, "approve")}><CheckCircle className="h-4 w-4 mr-1" />Approve</Button>}
                {canApprove && detail.status === "pending_approval" && (
                  <>
                    <Button size="sm" onClick={() => runAction(detail.id, "approve")}><CheckCircle className="h-4 w-4 mr-1" />Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => runAction(detail.id, "reject")}><XCircle className="h-4 w-4 mr-1" />Reject</Button>
                  </>
                )}
                {canApprove && ["approved", "partially_paid", "paid"].includes(detail.status) && (
                  <Button size="sm" onClick={() => runAction(detail.id, "finalize")}>Finalize</Button>
                )}
                {canApprove && detail.status !== "cancelled" && detail.status !== "paid" && (
                  <Button size="sm" variant="destructive" onClick={() => runAction(detail.id, "cancel")}>Cancel</Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — the server still refuses paid or finalised invoices */}
      <Dialog open={!!deleteRow} onOpenChange={(o) => { if (!o) setDeleteRow(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Delete invoice?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Invoice <span className="font-medium text-foreground">{deleteRow?.invoice_number}</span> will be
            removed permanently, along with its audit trail. This cannot be undone.
          </p>
          <p className="text-xs text-muted-foreground">
            An invoice that already has payments against it, or one that has been finalised, cannot be deleted —
            cancel it instead so the numbering and the ledger keep their history.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteRow(null)}>Keep it</Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
