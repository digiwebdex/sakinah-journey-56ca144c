import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/api";
import { toast } from "sonner";
import { useIsViewer, useCanModifyFinancials } from "@/components/admin/AdminLayout";
import AdminActionMenu from "@/components/admin/AdminActionMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  RefreshCw, Plus, Search, RotateCcw, CheckCircle, XCircle,
  AlertTriangle, DollarSign, TrendingDown, FileText, Eye, Edit2, Trash2
} from "lucide-react";
import { format } from "date-fns";
import { formatBDT } from "@/lib/utils";

const inputClass = "w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

const REFUND_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "bank", label: "Bank Transfer" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  processed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

export default function AdminRefundsPage() {
  const isViewer = useIsViewer();
  const canModify = useCanModifyFinancials();
  const [refunds, setRefunds] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [walletAccounts, setWalletAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modals
  const [showAddRefund, setShowAddRefund] = useState(false);
  const [viewRefund, setViewRefund] = useState<any>(null);
  const [editingRefundId, setEditingRefundId] = useState<string | null>(null);
  const [deleteRefund, setDeleteRefund] = useState<any>(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [refundForm, setRefundForm] = useState({
    refund_amount: 0,
    deduction_amount: 0,
    original_amount: 0,
    refund_method: "cash",
    wallet_account_id: "",
    reason: "",
  });

  // Policy form
  const [policyForm, setPolicyForm] = useState({
    name: "", description: "", refund_type: "percentage", refund_value: 0,
    min_days_before_departure: 0, is_default: false,
  });

  const fetchAll = async () => {
    setLoading(true);
    const [refRes, polRes, bkRes, walRes] = await Promise.all([
      supabase.from("refunds").select("*, bookings(tracking_id, guest_name, total_amount, paid_amount, status, packages(name)), cancellation_policies(name)").order("created_at", { ascending: false }),
      supabase.from("cancellation_policies").select("*").eq("is_active", true).order("name", { ascending: true }),
      supabase.from("bookings").select("id, tracking_id, guest_name, total_amount, paid_amount, status, packages(name)").order("created_at", { ascending: false }),
      supabase.from("accounts").select("*").eq("type", "asset").order("name", { ascending: true }),
    ]);
    setRefunds(refRes.data || []);
    setPolicies(polRes.data || []);
    setBookings((bkRes.data || []).filter((b: any) => b.status !== "cancelled"));
    setWalletAccounts(walRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // When booking changes, update original amount
  useEffect(() => {
    if (!selectedBookingId) return;
    const bk = bookings.find((b: any) => b.id === selectedBookingId);
    if (bk) {
      const paid = Number(bk.paid_amount || 0);
      setRefundForm(prev => ({ ...prev, original_amount: paid, refund_amount: paid, deduction_amount: 0 }));
    }
  }, [selectedBookingId, bookings]);

  // When policy changes, recalculate
  useEffect(() => {
    if (!selectedPolicyId || !refundForm.original_amount) return;
    const pol = policies.find((p: any) => p.id === selectedPolicyId);
    if (pol) {
      const orig = refundForm.original_amount;
      let deduction = pol.refund_type === "percentage"
        ? orig * (1 - Number(pol.refund_value) / 100)
        : Number(pol.refund_value);
      deduction = Math.min(deduction, orig);
      setRefundForm(prev => ({
        ...prev,
        deduction_amount: Math.round(deduction),
        refund_amount: Math.round(orig - deduction),
      }));
    }
  }, [selectedPolicyId, policies, refundForm.original_amount]);

  const handleCreateRefund = async () => {
    if (!selectedBookingId) { toast.error("বুকিং নির্বাচন করুন"); return; }
    if (refundForm.refund_amount <= 0) { toast.error("রিফান্ড পরিমাণ ০ এর বেশি হতে হবে"); return; }

    const payload = {
      booking_id: selectedBookingId,
      policy_id: selectedPolicyId || null,
      original_amount: refundForm.original_amount,
      refund_amount: refundForm.refund_amount,
      deduction_amount: refundForm.deduction_amount,
      refund_method: refundForm.refund_method,
      wallet_account_id: refundForm.wallet_account_id || null,
      reason: refundForm.reason,
    };

    const { error } = editingRefundId
      ? await supabase.from("refunds").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingRefundId)
      : await supabase.from("refunds").insert({ ...payload, status: "pending" });

    if (error) { toast.error(error.message); return; }
    toast.success(editingRefundId ? "রিফান্ড আপডেট হয়েছে" : "রিফান্ড রিকুয়েস্ট তৈরি হয়েছে");
    setShowAddRefund(false);
    setEditingRefundId(null);
    resetForm();
    fetchAll();
  };

  // A processed refund has already left the wallet, so it is read-only from here.
  const startEditRefund = (r: any) => {
    if (r.status === "processed") { toast.error("প্রসেস হয়ে যাওয়া রিফান্ড সম্পাদনা করা যাবে না"); return; }
    setEditingRefundId(r.id);
    setSelectedBookingId(r.booking_id || "");
    setSelectedPolicyId(r.policy_id || "");
    setRefundForm({
      refund_amount: Number(r.refund_amount || 0),
      deduction_amount: Number(r.deduction_amount || 0),
      original_amount: Number(r.original_amount || 0),
      refund_method: r.refund_method || "cash",
      wallet_account_id: r.wallet_account_id || "",
      reason: r.reason || "",
    });
    setShowAddRefund(true);
  };

  const confirmDeleteRefund = async () => {
    if (!deleteRefund) return;
    if (deleteRefund.status === "processed") {
      toast.error("প্রসেস হয়ে যাওয়া রিফান্ড মুছে ফেলা যাবে না");
      setDeleteRefund(null);
      return;
    }
    const { error } = await supabase.from("refunds").delete().eq("id", deleteRefund.id);
    if (error) { toast.error(error.message); return; }
    toast.success("রিফান্ড মুছে ফেলা হয়েছে");
    setDeleteRefund(null);
    fetchAll();
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from("refunds").update({
      status: newStatus,
      ...(newStatus === "processed" ? { processed_at: new Date().toISOString() } : {}),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`রিফান্ড ${newStatus === "processed" ? "প্রসেস" : newStatus === "approved" ? "অনুমোদিত" : "বাতিল"} হয়েছে`);
    fetchAll();
  };

  const handleSavePolicy = async () => {
    if (!policyForm.name) { toast.error("নাম দিন"); return; }
    const { error } = await supabase.from("cancellation_policies").insert(policyForm);
    if (error) { toast.error(error.message); return; }
    toast.success("পলিসি তৈরি হয়েছে");
    setPolicyForm({ name: "", description: "", refund_type: "percentage", refund_value: 0, min_days_before_departure: 0, is_default: false });
    fetchAll();
  };

  const resetForm = () => {
    setSelectedBookingId("");
    setSelectedPolicyId("");
    setRefundForm({ refund_amount: 0, deduction_amount: 0, original_amount: 0, refund_method: "cash", wallet_account_id: "", reason: "" });
  };

  const filteredRefunds = useMemo(() => {
    let list = refunds;
    if (filterStatus !== "all") list = list.filter((r: any) => r.status === filterStatus);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r: any) =>
        r.bookings?.tracking_id?.toLowerCase().includes(q) ||
        r.bookings?.guest_name?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [refunds, filterStatus, searchQuery]);

  const stats = useMemo(() => ({
    total: refunds.length,
    pending: refunds.filter((r: any) => r.status === "pending").length,
    processed: refunds.filter((r: any) => r.status === "processed").length,
    totalRefunded: refunds.filter((r: any) => r.status === "processed").reduce((s: number, r: any) => s + Number(r.refund_amount), 0),
  }), [refunds]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">রিফান্ড ও ক্যান্সেলেশন</h1>
          <p className="text-sm text-muted-foreground">বুকিং ক্যান্সেল ও রিফান্ড ম্যানেজমেন্ট</p>
        </div>
        {!isViewer && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPolicyModal(true)}>
              <FileText className="h-4 w-4 mr-1" /> পলিসি ম্যানেজ
            </Button>
            <Button size="sm" onClick={() => { resetForm(); setShowAddRefund(true); }}>
              <Plus className="h-4 w-4 mr-1" /> নতুন রিফান্ড
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">মোট রিফান্ড</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">পেন্ডিং</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">প্রসেসড</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.processed}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">মোট রিফান্ডকৃত</p>
          <p className="text-2xl font-bold text-destructive">{formatBDT(stats.totalRefunded)}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input className={inputClass + " pl-9"} placeholder="ট্র্যাকিং আইডি, নাম দিয়ে খুঁজুন..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <select className={inputClass + " w-auto"} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">সকল স্ট্যাটাস</option>
          <option value="pending">পেন্ডিং</option>
          <option value="approved">অনুমোদিত</option>
          <option value="processed">প্রসেসড</option>
          <option value="rejected">বাতিল</option>
        </select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">ট্র্যাকিং</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">কাস্টমার</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">মূল পরিমাণ</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">কর্তন</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">রিফান্ড</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">মাধ্যম</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">স্ট্যাটাস</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">তারিখ</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">অ্যাকশন</th>
            </tr>
          </thead>
          <tbody>
            {filteredRefunds.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">কোনো রিফান্ড পাওয়া যায়নি</td></tr>
            ) : filteredRefunds.map((r: any) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{r.bookings?.tracking_id || "—"}</td>
                <td className="px-4 py-3">{r.bookings?.guest_name || "—"}</td>
                <td className="px-4 py-3 text-right">{formatBDT(r.original_amount)}</td>
                <td className="px-4 py-3 text-right text-destructive">{formatBDT(r.deduction_amount)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatBDT(r.refund_amount)}</td>
                <td className="px-4 py-3 text-center capitalize">{r.refund_method}</td>
                <td className="px-4 py-3 text-center">
                  <Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge>
                </td>
                <td className="px-4 py-3 text-xs">{format(new Date(r.created_at), "dd/MM/yyyy")}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center">
                    <AdminActionMenu
                      primary={["View", "Edit", "Delete"]}
                      actions={[
                        { label: "View", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => setViewRefund(r) },
                        { label: "Edit", icon: <Edit2 className="h-3.5 w-3.5" />, onClick: () => startEditRefund(r), variant: "warning", hidden: isViewer || !canModify, disabled: r.status === "processed" },
                        { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteRefund(r), variant: "destructive", hidden: isViewer || !canModify, disabled: r.status === "processed" },
                        { label: "অনুমোদন", icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => handleUpdateStatus(r.id, "approved"), variant: "success", hidden: isViewer || !canModify || r.status !== "pending", separator: true },
                        { label: "বাতিল", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => handleUpdateStatus(r.id, "rejected"), variant: "destructive", hidden: isViewer || !canModify || r.status !== "pending" },
                        { label: "প্রসেস", icon: <DollarSign className="h-3.5 w-3.5" />, onClick: () => handleUpdateStatus(r.id, "processed"), variant: "success", hidden: isViewer || !canModify || r.status !== "approved" },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Refund Modal */}
      <Dialog open={showAddRefund} onOpenChange={(o) => { setShowAddRefund(o); if (!o) { setEditingRefundId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingRefundId ? "রিফান্ড সম্পাদনা" : "নতুন রিফান্ড রিকুয়েস্ট"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">বুকিং নির্বাচন করুন *</label>
              <select className={inputClass} value={selectedBookingId} onChange={e => setSelectedBookingId(e.target.value)}>
                <option value="">-- বুকিং নির্বাচন --</option>
                {bookings.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.tracking_id} — {b.guest_name} ({formatBDT(b.paid_amount)} paid)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ক্যান্সেলেশন পলিসি</label>
              <select className={inputClass} value={selectedPolicyId} onChange={e => setSelectedPolicyId(e.target.value)}>
                <option value="">-- কাস্টম রিফান্ড --</option>
                {policies.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.refund_type === "percentage" ? `${p.refund_value}%` : formatBDT(p.refund_value)})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">মূল পরিমাণ</label>
                <input className={inputClass} type="number" value={refundForm.original_amount} onChange={e => {
                  const v = Number(e.target.value);
                  setRefundForm(prev => ({ ...prev, original_amount: v, refund_amount: v - prev.deduction_amount }));
                }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">কর্তন</label>
                <input className={inputClass} type="number" value={refundForm.deduction_amount} onChange={e => {
                  const v = Number(e.target.value);
                  setRefundForm(prev => ({ ...prev, deduction_amount: v, refund_amount: prev.original_amount - v }));
                }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">রিফান্ড পরিমাণ</label>
                <input className={inputClass + " font-bold"} type="number" value={refundForm.refund_amount} readOnly />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">রিফান্ড মাধ্যম</label>
                <select className={inputClass} value={refundForm.refund_method} onChange={e => setRefundForm(prev => ({ ...prev, refund_method: e.target.value }))}>
                  {REFUND_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ওয়ালেট একাউন্ট</label>
                <select className={inputClass} value={refundForm.wallet_account_id} onChange={e => setRefundForm(prev => ({ ...prev, wallet_account_id: e.target.value }))}>
                  <option value="">-- নির্বাচন করুন --</option>
                  {walletAccounts.map((w: any) => <option key={w.id} value={w.id}>{w.name} ({formatBDT(w.balance)})</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">কারণ</label>
              <textarea className={inputClass} rows={2} value={refundForm.reason} onChange={e => setRefundForm(prev => ({ ...prev, reason: e.target.value }))} placeholder="ক্যান্সেলেশনের কারণ লিখুন..." />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowAddRefund(false); setEditingRefundId(null); resetForm(); }}>বাতিল</Button>
              <Button onClick={handleCreateRefund}><RotateCcw className="h-4 w-4 mr-1" /> {editingRefundId ? "আপডেট করুন" : "রিফান্ড তৈরি"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={!!viewRefund} onOpenChange={(o) => { if (!o) setViewRefund(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>রিফান্ড বিবরণ</DialogTitle></DialogHeader>
          {viewRefund && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-xs text-muted-foreground block">ট্র্যাকিং</span><span className="font-mono">{viewRefund.bookings?.tracking_id || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">কাস্টমার</span><span className="font-medium">{viewRefund.bookings?.guest_name || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">প্যাকেজ</span><span>{viewRefund.bookings?.packages?.name || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">নীতিমালা</span><span>{viewRefund.cancellation_policies?.name || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">মূল পরিমাণ</span><span>{formatBDT(viewRefund.original_amount)}</span></div>
                <div><span className="text-xs text-muted-foreground block">কর্তন</span><span className="text-destructive">{formatBDT(viewRefund.deduction_amount)}</span></div>
                <div><span className="text-xs text-muted-foreground block">রিফান্ড</span><span className="font-bold">{formatBDT(viewRefund.refund_amount)}</span></div>
                <div><span className="text-xs text-muted-foreground block">মাধ্যম</span><span className="capitalize">{viewRefund.refund_method || "—"}</span></div>
                <div><span className="text-xs text-muted-foreground block">স্ট্যাটাস</span><Badge className={STATUS_COLORS[viewRefund.status] || ""}>{viewRefund.status}</Badge></div>
                <div><span className="text-xs text-muted-foreground block">তৈরি</span><span>{viewRefund.created_at ? format(new Date(viewRefund.created_at), "dd/MM/yyyy") : "—"}</span></div>
                {viewRefund.processed_at && (
                  <div><span className="text-xs text-muted-foreground block">প্রসেস</span><span>{format(new Date(viewRefund.processed_at), "dd/MM/yyyy")}</span></div>
                )}
              </div>
              {viewRefund.reason && (
                <div className="pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground block mb-1">কারণ</span>
                  <p className="text-sm">{viewRefund.reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteRefund} onOpenChange={(o) => { if (!o) setDeleteRefund(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>রিফান্ড মুছে ফেলবেন?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{deleteRefund?.bookings?.guest_name || "এই"}</span>-এর
            {" "}{formatBDT(deleteRefund?.refund_amount || 0)} টাকার রিফান্ড রিকুয়েস্টটি স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যাবে না।
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteRefund(null)}>থাক</Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteRefund}>মুছে ফেলুন</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Policy Modal */}
      <Dialog open={showPolicyModal} onOpenChange={setShowPolicyModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>ক্যান্সেলেশন পলিসি</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Existing policies */}
            {policies.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {policies.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.refund_type === "percentage" ? `${p.refund_value}% রিফান্ড` : `${formatBDT(p.refund_value)} ফ্ল্যাট কর্তন`}
                        {p.min_days_before_departure > 0 && ` • ন্যূনতম ${p.min_days_before_departure} দিন আগে`}
                      </p>
                    </div>
                    {p.is_default && <Badge variant="secondary">ডিফল্ট</Badge>}
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold">নতুন পলিসি যোগ করুন</p>
              <input className={inputClass} placeholder="পলিসির নাম" value={policyForm.name} onChange={e => setPolicyForm(prev => ({ ...prev, name: e.target.value }))} />
              <input className={inputClass} placeholder="বিবরণ (ঐচ্ছিক)" value={policyForm.description} onChange={e => setPolicyForm(prev => ({ ...prev, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <select className={inputClass} value={policyForm.refund_type} onChange={e => setPolicyForm(prev => ({ ...prev, refund_type: e.target.value }))}>
                  <option value="percentage">শতাংশ (%)</option>
                  <option value="flat">ফ্ল্যাট পরিমাণ</option>
                </select>
                <input className={inputClass} type="number" placeholder={policyForm.refund_type === "percentage" ? "রিফান্ড %" : "কর্তন পরিমাণ"} value={policyForm.refund_value} onChange={e => setPolicyForm(prev => ({ ...prev, refund_value: Number(e.target.value) }))} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSavePolicy}><Plus className="h-4 w-4 mr-1" /> পলিসি সেভ</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
