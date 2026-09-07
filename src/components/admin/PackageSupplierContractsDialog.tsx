import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { unpaidPaxFor } from "@/lib/packageSupplierSummary";

const inputClass =
  "w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

const formatBDT = (n: number) => `৳${Number(n || 0).toLocaleString("en-IN")}`;

interface Props {
  packageId: string | null;
  packageName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  readOnly?: boolean;
}

const EMPTY = { supplier_agent_id: "", contract_amount: "", contracted_pax: "", notes: "" };

/**
 * Per-package supplier contracts: the agreed amount a supplier is owed for one
 * package, so payments can be settled package-wise instead of per pilgrim.
 */
export default function PackageSupplierContractsDialog({
  packageId, packageName, open, onOpenChange, onSaved, readOnly = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!packageId) return;
    setLoading(true);
    try {
      const [supRes, conRes, payRes] = await Promise.all([
        supabase.from("supplier_agents").select("id, agent_name, company_name, status"),
        supabase.from("package_supplier_contracts").select("*").eq("package_id", packageId),
        supabase.from("supplier_agent_payments").select("id, supplier_agent_id, amount, package_id").eq("package_id", packageId),
      ]);
      setSuppliers((supRes.data as any[]) || []);
      setContracts((conRes.data as any[]) || []);
      setPayments((payRes.data as any[]) || []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load supplier contracts");
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => { if (open && packageId) load(); }, [open, packageId, load]);

  useEffect(() => { if (!open) { setForm({ ...EMPTY }); setEditingId(null); } }, [open]);

  const paidBySupplier = useMemo(() => {
    const map: Record<string, number> = {};
    payments.forEach((p) => {
      map[p.supplier_agent_id] = (map[p.supplier_agent_id] || 0) + Number(p.amount || 0);
    });
    return map;
  }, [payments]);

  const supplierName = (id: string) => {
    const s = suppliers.find((x) => x.id === id);
    if (!s) return "Unknown supplier";
    return s.company_name ? `${s.agent_name} (${s.company_name})` : s.agent_name;
  };

  const rows = useMemo(() => contracts.map((c) => {
    const contractAmount = Number(c.contract_amount || 0);
    const contractedPax = Number(c.contracted_pax || 0);
    const paid = paidBySupplier[c.supplier_agent_id] || 0;
    const due = contractAmount - paid;
    return { ...c, contractAmount, contractedPax, paid, due, unpaidPax: unpaidPaxFor(contractAmount, contractedPax, due) };
  }).sort((a, b) => b.contractAmount - a.contractAmount), [contracts, paidBySupplier]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    contract: acc.contract + r.contractAmount,
    paid: acc.paid + r.paid,
    due: acc.due + r.due,
    pax: acc.pax + r.contractedPax,
    unpaidPax: acc.unpaidPax + r.unpaidPax,
  }), { contract: 0, paid: 0, due: 0, pax: 0, unpaidPax: 0 }), [rows]);

  // A supplier can hold only one contract per package, so hide the ones already used.
  const availableSuppliers = useMemo(() => {
    const used = new Set(contracts.filter((c) => c.id !== editingId).map((c) => c.supplier_agent_id));
    return suppliers.filter((s) => !used.has(s.id));
  }, [suppliers, contracts, editingId]);

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setForm({
      supplier_agent_id: row.supplier_agent_id,
      contract_amount: String(row.contract_amount ?? ""),
      contracted_pax: String(row.contracted_pax ?? ""),
      notes: row.notes || "",
    });
  };

  const save = async () => {
    if (!packageId) return;
    if (!form.supplier_agent_id) { toast.error("Please select a supplier"); return; }
    const amount = Number(form.contract_amount);
    if (!Number.isFinite(amount) || amount < 0) { toast.error("Enter a valid contract amount"); return; }
    const pax = form.contracted_pax === "" ? 0 : Number(form.contracted_pax);
    if (!Number.isFinite(pax) || pax < 0) { toast.error("Enter a valid pilgrim count"); return; }

    // Paying more than the contract is a data-entry mistake worth catching here.
    const alreadyPaid = paidBySupplier[form.supplier_agent_id] || 0;
    if (amount > 0 && alreadyPaid > amount) {
      toast.error(`Already paid ${formatBDT(alreadyPaid)} to this supplier for this package — the contract cannot be lower than that.`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        package_id: packageId,
        supplier_agent_id: form.supplier_agent_id,
        contract_amount: amount,
        contracted_pax: pax,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("package_supplier_contracts")
          .update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingId);
        if (error) throw error;
        toast.success("Contract updated");
      } else {
        const { error } = await supabase.from("package_supplier_contracts").insert(payload);
        if (error) throw error;
        toast.success("Contract added");
      }
      setForm({ ...EMPTY });
      setEditingId(null);
      await load();
      onSaved?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save the contract");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    if (row.paid > 0) {
      toast.error(`${formatBDT(row.paid)} has already been paid on this contract — clear those payments first.`);
      return;
    }
    try {
      const { error } = await supabase.from("package_supplier_contracts").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Contract removed");
      await load();
      onSaved?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove the contract");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Supplier Contracts</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          {packageName ? <span className="font-medium text-foreground">{packageName}</span> : null}
          {packageName ? " — " : ""}
          what each supplier is owed for this package. Payments are then made package-wise, not per pilgrim.
        </p>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <div className="bg-secondary/50 rounded-lg p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Contract</p>
                <p className="font-bold text-sm">{formatBDT(totals.contract)}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Paid</p>
                <p className="font-bold text-sm text-emerald-600">{formatBDT(totals.paid)}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Supplier Due</p>
                <p className={`font-bold text-sm ${totals.due > 0 ? "text-destructive" : "text-emerald-600"}`}>{formatBDT(totals.due)}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">Unpaid Pilgrims</p>
                <p className="font-bold text-sm">{totals.unpaidPax}{totals.pax > 0 ? ` / ${totals.pax}` : ""}</p>
              </div>
            </div>

            <div className="mt-3 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Supplier</th>
                    <th className="p-2 font-medium text-right">Pilgrims</th>
                    <th className="p-2 font-medium text-right">Contract</th>
                    <th className="p-2 font-medium text-right">Paid</th>
                    <th className="p-2 font-medium text-right">Due</th>
                    <th className="p-2 font-medium text-right">Unpaid Pax</th>
                    {!readOnly && <th className="p-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={readOnly ? 6 : 7} className="p-4 text-center text-muted-foreground text-xs">
                      No supplier contract yet for this package.
                    </td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2">
                        <span className="font-medium">{supplierName(r.supplier_agent_id)}</span>
                        {r.notes ? <span className="block text-[11px] text-muted-foreground">{r.notes}</span> : null}
                      </td>
                      <td className="p-2 text-right">{r.contractedPax || "—"}</td>
                      <td className="p-2 text-right font-medium">{formatBDT(r.contractAmount)}</td>
                      <td className="p-2 text-right text-emerald-600">{formatBDT(r.paid)}</td>
                      <td className={`p-2 text-right font-semibold ${r.due > 0 ? "text-destructive" : "text-emerald-600"}`}>{formatBDT(r.due)}</td>
                      <td className="p-2 text-right">{r.unpaidPax}</td>
                      {!readOnly && (
                        <td className="p-2 text-right whitespace-nowrap">
                          <button onClick={() => startEdit(r)} className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/70">Edit</button>
                          <button onClick={() => remove(r)} title="Remove" className="ml-1 p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!readOnly && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium mb-2">{editingId ? "Edit contract" : "Add a supplier contract"}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Supplier *</label>
                    <select className={inputClass} value={form.supplier_agent_id}
                      onChange={(e) => setForm({ ...form, supplier_agent_id: e.target.value })}>
                      <option value="">-- Select Supplier --</option>
                      {editingId && !availableSuppliers.some((s) => s.id === form.supplier_agent_id) && (
                        <option value={form.supplier_agent_id}>{supplierName(form.supplier_agent_id)}</option>
                      )}
                      {availableSuppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.company_name ? `${s.agent_name} (${s.company_name})` : s.agent_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Contract Amount (BDT) *</label>
                    <input className={inputClass} type="number" min={0} placeholder="0" value={form.contract_amount}
                      onChange={(e) => setForm({ ...form, contract_amount: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Contracted Pilgrims</label>
                    <input className={inputClass} type="number" min={0} placeholder="0" value={form.contracted_pax}
                      onChange={(e) => setForm({ ...form, contracted_pax: e.target.value })} />
                    <p className="text-[10px] text-muted-foreground mt-1">Used to work out how many pilgrims are still unpaid.</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                    <input className={inputClass} placeholder="Optional" value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  {editingId && (
                    <button onClick={() => { setEditingId(null); setForm({ ...EMPTY }); }}
                      className="text-sm px-3 py-2 rounded-md bg-secondary inline-flex items-center gap-1">
                      <X className="h-4 w-4" />Cancel
                    </button>
                  )}
                  <button onClick={save} disabled={saving}
                    className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground inline-flex items-center gap-1 disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editingId ? "Update" : "Add"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
