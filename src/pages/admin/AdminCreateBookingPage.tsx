import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Save, User, Upload, X, CheckCircle, File, Plus, Trash2,
  ChevronDown, ChevronUp, Crown, FileText,
} from "lucide-react";
import CustomerSearchSelect, { type CustomerProfile } from "@/components/admin/CustomerSearchSelect";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

interface CustomerDocument {
  document_type: string;
  file_name: string;
  file_path: string;
}

interface FamilyMember {
  id: string;
  customer_id: string | null;
  is_primary: boolean;
  relationship: string;
  full_name: string;
  phone: string;
  passport_number: string;
  nid_number: string;
  date_of_birth: string;
  email: string;
  address: string;
  package_id: string;
  selling_price: string;
  discount: string;
  documents: CustomerDocument[];
}

const RELATIONSHIP_OPTIONS = [
  "Head of Family",
  "Spouse",
  "Son",
  "Daughter",
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Other",
];

const num = (v: string | number): number => {
  if (v === "" || v === undefined || v === null) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : Math.max(0, n);
};

const DOC_TYPES = [
  { key: "passport", label: "Passport Copy" },
  { key: "nid", label: "NID Copy" },
  { key: "photo", label: "Photo" },
];

async function fetchCustomerDocuments(userId: string): Promise<CustomerDocument[]> {
  const { data } = await supabase
    .from("booking_documents")
    .select("document_type, file_name, file_path")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const seen = new Set<string>();
  return (data || []).filter((d: CustomerDocument) => {
    if (seen.has(d.document_type)) return false;
    seen.add(d.document_type);
    return true;
  }) as CustomerDocument[];
}

function buildMemberFromCustomer(
  customer: CustomerProfile,
  opts: { is_primary?: boolean; relationship?: string; package_id?: string; selling_price?: string; documents?: CustomerDocument[] }
): FamilyMember {
  return {
    id: crypto.randomUUID(),
    customer_id: customer.user_id,
    is_primary: opts.is_primary ?? false,
    relationship: opts.relationship ?? (opts.is_primary ? "Head of Family" : "Member"),
    full_name: customer.full_name || "",
    phone: customer.phone || "",
    passport_number: customer.passport_number || "",
    nid_number: customer.nid_number || "",
    date_of_birth: customer.date_of_birth || "",
    email: customer.email || "",
    address: customer.address || "",
    package_id: opts.package_id || "",
    selling_price: opts.selling_price || "",
    discount: "",
    documents: opts.documents || [],
  };
}

export default function AdminCreateBookingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [moallems, setMoallems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [bookingType, setBookingType] = useState<"individual" | "family">("individual");
  const [walletAccounts, setWalletAccounts] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [defaultFamilyPackageId, setDefaultFamilyPackageId] = useState("");

  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});
  const [docUploading, setDocUploading] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [form, setForm] = useState({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    guest_address: "",
    guest_passport: "",
    package_id: "",
    selling_price_per_person: "",
    cost_price_per_person: "",
    commission_per_person: "",
    discount: "",
    paid_amount: "",
    payment_method: "cash",
    wallet_account_id: "",
    status: "pending",
    notes: "",
    moallem_id: "",
    supplier_agent_id: "",
  });

  const [members, setMembers] = useState<FamilyMember[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("packages").select("id, name, type, price, duration_days").eq("is_active", true).order("name"),
      supabase.from("moallems").select("id, name, phone, status").eq("status", "active").order("name"),
      supabase.from("accounts" as any).select("*").eq("type", "asset"),
      supabase.from("supplier_agents").select("id, agent_name, company_name, phone, status").eq("status", "active").order("agent_name"),
    ]).then(([pkgRes, moaRes, walletRes, supRes]) => {
      setPackages(pkgRes.data || []);
      const moallemsList = moaRes.data || [];
      setMoallems(moallemsList);
      const wallets = (walletRes.data as any[]) || [];
      setWalletAccounts(wallets);
      setSuppliers(supRes.data || []);
      const defaultMoallem = moallemsList.find((m: any) => m.name === "Manasik Travel Hub");
      const defaultWallet = wallets.find((w: any) => w.name === "Cash");
      setForm((prev) => ({
        ...prev,
        moallem_id: defaultMoallem?.id || prev.moallem_id,
        wallet_account_id: defaultWallet?.id || prev.wallet_account_id,
      }));
    });
  }, []);

  const memberCustomerIds = members.map((m) => m.customer_id).filter(Boolean) as string[];

  const syncPrimaryMember = useCallback(async (customer: CustomerProfile) => {
    const docs = await fetchCustomerDocuments(customer.user_id);
    const pkgId = defaultFamilyPackageId || form.package_id;
    const pkg = packages.find((p) => p.id === pkgId);
    const sellingPrice = pkg ? String(pkg.price) : form.selling_price_per_person || "";

    setMembers((prev) => {
      const others = prev.filter((m) => !m.is_primary);
      const primary = buildMemberFromCustomer(customer, {
        is_primary: true,
        relationship: "Head of Family",
        package_id: pkgId,
        selling_price: sellingPrice,
        documents: docs,
      });
      return [primary, ...others];
    });
  }, [defaultFamilyPackageId, form.package_id, form.selling_price_per_person, packages]);

  const handleCustomerSelect = async (customer: CustomerProfile | null) => {
    if (customer) {
      setSelectedCustomerId(customer.user_id);
      setForm((prev) => ({
        ...prev,
        guest_name: customer.full_name || "",
        guest_phone: customer.phone || "",
        guest_email: customer.email || "",
        guest_address: customer.address || "",
        guest_passport: customer.passport_number || "",
      }));
      if (bookingType === "family") {
        await syncPrimaryMember(customer);
      }
    } else {
      setSelectedCustomerId(null);
      setForm((prev) => ({ ...prev, guest_name: "", guest_phone: "", guest_email: "", guest_address: "", guest_passport: "" }));
      setMembers((prev) => prev.filter((m) => !m.is_primary));
    }
  };

  const handleBookingTypeChange = async (type: "individual" | "family") => {
    setBookingType(type);
    if (type === "individual") {
      setMembers([]);
      setShowAddMember(false);
    } else if (selectedCustomerId) {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, email, passport_number, address, nid_number, date_of_birth")
        .eq("user_id", selectedCustomerId)
        .maybeSingle();
      if (data) await syncPrimaryMember(data as CustomerProfile);
    }
  };

  const handleDuplicateMemberAttempt = (customer: CustomerProfile) => {
    if (customer.user_id === selectedCustomerId) {
      toast.warning("Primary customer is already added as Head of Family.");
      return;
    }
    toast.warning(`${customer.full_name || "This customer"} is already in this family booking.`);
  };

  const handleAddMemberSelect = async (customer: CustomerProfile | null) => {
    if (!customer) return;
    if (customer.user_id === selectedCustomerId) {
      toast.warning("Primary customer is already added as Head of Family.");
      return;
    }
    if (memberCustomerIds.includes(customer.user_id)) {
      toast.warning(`${customer.full_name || "This customer"} is already in this family booking.`);
      return;
    }

    const docs = await fetchCustomerDocuments(customer.user_id);
    const pkgId = defaultFamilyPackageId || form.package_id;
    const pkg = packages.find((p) => p.id === pkgId);
    const sellingPrice = pkg ? String(pkg.price) : form.selling_price_per_person || "";

    setMembers((prev) => [
      ...prev,
      buildMemberFromCustomer(customer, {
        relationship: "Member",
        package_id: pkgId,
        selling_price: sellingPrice,
        documents: docs,
      }),
    ]);
    setShowAddMember(false);
    toast.success(`${customer.full_name || "Customer"} added as family member.`);
  };

  const handlePackageChange = (packageId: string) => {
    const pkg = packages.find((p) => p.id === packageId);
    setForm((prev) => ({
      ...prev,
      package_id: packageId,
      selling_price_per_person: pkg ? String(pkg.price) : prev.selling_price_per_person,
    }));
  };

  const handleDefaultFamilyPackageChange = (packageId: string) => {
    setDefaultFamilyPackageId(packageId);
    const pkg = packages.find((p) => p.id === packageId);
    setMembers((prev) => prev.map((m) => ({
      ...m,
      package_id: m.package_id || packageId,
      selling_price: m.selling_price || (pkg ? String(pkg.price) : m.selling_price),
    })));
  };

  const updateMember = (id: string, field: keyof FamilyMember, value: string) => {
    setMembers((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      const updated = { ...m, [field]: value };
      if (field === "package_id") {
        const pkg = packages.find((p) => p.id === value);
        if (pkg) updated.selling_price = String(pkg.price);
      }
      if (field === "relationship" && m.is_primary) {
        updated.relationship = "Head of Family";
      }
      return updated;
    }));
  };

  const removeMember = (id: string) => {
    const member = members.find((m) => m.id === id);
    if (member?.is_primary) {
      toast.warning("The primary customer cannot be removed. Change the main customer instead.");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const sellingPrice = num(form.selling_price_per_person);
  const costPrice = num(form.cost_price_per_person);
  const commissionPP = num(form.commission_per_person);
  const discountVal = num(form.discount);
  const paidAmount = num(form.paid_amount);
  const individualFinalPrice = Math.max(0, sellingPrice - discountVal);
  const familyTotal = members.reduce((s, m) => s + Math.max(0, num(m.selling_price) - num(m.discount)), 0);
  const totalSellingPrice = bookingType === "family" ? familyTotal : individualFinalPrice;
  const numTravelers = bookingType === "family" ? members.length : 1;
  const totalCost = costPrice * numTravelers;
  const totalCommission = commissionPP * numTravelers;
  const estimatedProfit = totalSellingPrice - totalCost - totalCommission;
  const dueAmount = Math.max(0, totalSellingPrice - paidAmount);

  const handleDocSelect = (docType: string, file: File | null) => {
    if (file && file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }
    setDocFiles((prev) => ({ ...prev, [docType]: file }));
  };

  const uploadDocuments = async (bookingId: string, userId: string) => {
    const filesToUpload = Object.entries(docFiles).filter(([_, file]) => file !== null);
    if (filesToUpload.length === 0) return;

    const API_URL = import.meta.env.VITE_API_URL || "/api";
    const token = localStorage.getItem("rk_access_token");

    for (const [docType, file] of filesToUpload) {
      if (!file) continue;
      setDocUploading(docType);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", "booking-documents");
        formData.append("path", `${bookingId}/${docType}_${Date.now()}.${file.name.split(".").pop() || "pdf"}`);

        const uploadRes = await fetch(`${API_URL}/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || "Upload failed");
        }
        const uploadData = await uploadRes.json();

        await supabase.from("booking_documents").insert({
          booking_id: bookingId,
          user_id: userId,
          document_type: docType,
          file_name: file.name,
          file_path: uploadData.file_path,
          file_size: file.size,
        });

        setUploadedDocs((prev) => ({ ...prev, [docType]: file.name }));
      } catch (err: any) {
        toast.error(`Failed to upload ${docType}: ${err.message}`);
      }
    }
    setDocUploading(null);
  };

  const handleSubmit = async () => {
    if (!selectedCustomerId) { toast.error("Please select a customer"); return; }
    if (bookingType === "individual" && !form.package_id) { toast.error("Please select a package"); return; }
    if (bookingType === "family" && members.length === 0) { toast.error("Please add family members"); return; }
    if (bookingType === "family") {
      const primary = members.find((m) => m.is_primary);
      if (!primary) { toast.error("Primary family member is missing. Select the main customer again."); return; }
      for (let i = 0; i < members.length; i++) {
        if (!members[i].full_name.trim()) { toast.error(`Member ${i + 1}: Name is required`); return; }
        if (!members[i].passport_number.trim()) { toast.error(`${members[i].full_name || `Member ${i + 1}`}: Passport number is required`); return; }
        if (!members[i].package_id) { toast.error(`${members[i].full_name || `Member ${i + 1}`}: Package is required`); return; }
      }
      const ids = members.map((m) => m.customer_id).filter(Boolean);
      if (new Set(ids).size !== ids.length) {
        toast.error("Duplicate customers detected in family members.");
        return;
      }
    }
    if (totalSellingPrice <= 0) { toast.error("Total selling price must be greater than 0"); return; }
    if (paidAmount > totalSellingPrice) { toast.error("Paid amount cannot exceed total price"); return; }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Not authenticated"); return; }

      const guestName = bookingType === "family" && members.length > 0
        ? members.map((m) => m.full_name.trim()).filter(Boolean).join(", ") || form.guest_name.trim()
        : form.guest_name.trim();
      const guestPassport = bookingType === "family" && members.length > 0
        ? members.map((m) => m.passport_number.trim()).filter(Boolean).join(", ") || form.guest_passport.trim() || null
        : form.guest_passport.trim() || null;

      const bookingData: Record<string, any> = {
        booking_type: bookingType,
        guest_name: guestName,
        guest_phone: form.guest_phone.trim(),
        package_id: bookingType === "individual" ? form.package_id : (members[0]?.package_id || defaultFamilyPackageId || form.package_id || packages[0]?.id),
        num_travelers: numTravelers,
        total_amount: totalSellingPrice,
        status: form.status,
        user_id: selectedCustomerId,
      };

      if (form.guest_email.trim()) bookingData.guest_email = form.guest_email.trim();
      if (form.guest_address?.trim()) bookingData.guest_address = form.guest_address.trim();
      if (guestPassport) bookingData.guest_passport = guestPassport;
      if (form.notes.trim()) bookingData.notes = form.notes.trim();
      if (form.moallem_id) bookingData.moallem_id = form.moallem_id;
      if (form.supplier_agent_id) bookingData.supplier_agent_id = form.supplier_agent_id;

      bookingData.selling_price_per_person = sellingPrice;
      bookingData.cost_price_per_person = costPrice;
      bookingData.commission_per_person = commissionPP;
      bookingData.total_cost = totalCost;
      bookingData.total_commission = totalCommission;
      bookingData.profit_amount = estimatedProfit;
      bookingData.paid_amount = paidAmount;
      bookingData.due_amount = dueAmount;
      if (bookingType === "individual" && discountVal > 0) bookingData.discount = discountVal;

      const { data: booking, error } = await supabase.from("bookings").insert(bookingData as any).select("id, tracking_id").single();
      if (error) throw error;

      if (bookingType === "family" && members.length > 0 && booking) {
        const memberRows = members.map((m) => ({
          booking_id: booking.id,
          full_name: m.full_name.trim(),
          passport_number: m.passport_number.trim() || null,
          package_id: m.package_id || null,
          selling_price: num(m.selling_price),
          discount: num(m.discount),
          final_price: Math.max(0, num(m.selling_price) - num(m.discount)),
        }));

        const { error: membersError } = await supabase.from("booking_members" as any).insert(memberRows);
        if (membersError) {
          await supabase.from("bookings").delete().eq("id", booking.id);
          throw new Error(membersError.message || "Failed to save traveler details");
        }
      }

      if (paidAmount > 0 && booking) {
        await supabase.from("payments").insert({
          booking_id: booking.id,
          user_id: selectedCustomerId || session.user.id,
          customer_id: selectedCustomerId,
          amount: paidAmount,
          status: "completed",
          payment_method: form.payment_method || "cash",
          installment_number: 1,
          paid_at: new Date().toISOString(),
          wallet_account_id: form.wallet_account_id || null,
          notes: "Initial payment (admin booking)",
        });
      }

      if (booking) {
        await uploadDocuments(booking.id, selectedCustomerId || session.user.id);
      }

      toast.success(`Booking created! Tracking ID: ${booking?.tracking_id}`);
      navigate("/admin/bookings");
    } catch (err: any) {
      toast.error(err.message || "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate("/admin/bookings")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-heading text-xl font-bold">Create New Booking</h2>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <label className="text-xs text-muted-foreground block mb-2">Booking Type</label>
        <div className="flex gap-2">
          {(["individual", "family"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleBookingTypeChange(type)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${bookingType === type ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-muted"}`}
            >
              {type === "individual" ? "Individual" : "Family"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
          <User className="h-4 w-4 text-primary" /> Select Customer *
        </h3>
        <p className="text-xs text-muted-foreground">
          {bookingType === "family"
            ? "Select the main customer (Head of Family). They will be added automatically to Family Members."
            : "Create the customer in the Customers module first, then select here."}
        </p>
        <CustomerSearchSelect onSelect={handleCustomerSelect} selectedId={selectedCustomerId} />

        {selectedCustomerId && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-secondary/50 rounded-lg p-3">
            <div><span className="text-muted-foreground text-xs">Name:</span> <span className="font-medium">{form.guest_name}</span></div>
            <div><span className="text-muted-foreground text-xs">Phone:</span> <span className="font-medium">{form.guest_phone}</span></div>
            {form.guest_email && <div><span className="text-muted-foreground text-xs">Email:</span> <span>{form.guest_email}</span></div>}
            {form.guest_passport && <div><span className="text-muted-foreground text-xs">Passport:</span> <span>{form.guest_passport}</span></div>}
          </div>
        )}
      </div>

      {bookingType === "individual" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Package & Pricing
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Package *</label>
              <select className={inputClass} value={form.package_id} onChange={(e) => handlePackageChange(e.target.value)}>
                <option value="">-- Select Package --</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type}) — BDT {Number(p.price).toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Selling Price (BDT)</label>
              <input className={inputClass} type="number" min={0} value={form.selling_price_per_person} placeholder="0" onChange={(e) => setForm((f) => ({ ...f, selling_price_per_person: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Discount (BDT)</label>
              <input className={inputClass} type="number" min={0} value={form.discount} placeholder="0" onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Final Price (BDT)</label>
              <div className={`${inputClass} bg-muted/50 font-bold text-foreground`}>BDT {individualFinalPrice.toLocaleString("en-IN")}</div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Cost Price / Person (BDT)</label>
              <input className={inputClass} type="number" min={0} value={form.cost_price_per_person} placeholder="0" onChange={(e) => setForm((f) => ({ ...f, cost_price_per_person: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Commission / Person (BDT)</label>
              <input className={inputClass} type="number" min={0} value={form.commission_per_person} placeholder="0" onChange={(e) => setForm((f) => ({ ...f, commission_per_person: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      {bookingType === "family" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Family Members ({members.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowAddMember((v) => !v)}
              disabled={!selectedCustomerId}
              className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> Add Member
            </button>
          </div>

          {!selectedCustomerId && (
            <p className="text-sm text-muted-foreground bg-secondary/40 rounded-lg p-3">Select the main customer first. They will appear here as Head of Family.</p>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Default Package (applies to new members)</label>
            <select className={inputClass} value={defaultFamilyPackageId} onChange={(e) => handleDefaultFamilyPackageChange(e.target.value)}>
              <option value="">-- Select Package --</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — BDT {Number(p.price).toLocaleString("en-IN")}</option>
              ))}
            </select>
          </div>

          {showAddMember && (
            <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-foreground">Select an existing customer to add as a family member</p>
              <CustomerSearchSelect
                onSelect={handleAddMemberSelect}
                selectedId={null}
                excludeUserIds={memberCustomerIds}
                onDuplicateAttempt={handleDuplicateMemberAttempt}
                showSelectedCard={false}
                clearAfterSelect
                placeholder="Search customer by name, phone, or passport..."
              />
              <button type="button" onClick={() => setShowAddMember(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}

          {members.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No members yet. Select the main customer to add them as Head of Family.</p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Passport No</TableHead>
                    <TableHead>Relationship</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <Fragment key={m.id}>
                      <TableRow className={m.is_primary ? "bg-primary/5" : undefined}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {m.is_primary && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                            <span className="font-medium text-sm">{m.full_name || "—"}</span>
                            {m.is_primary && <Badge variant="outline" className="text-[10px]">Main Applicant</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{m.passport_number || "—"}</TableCell>
                        <TableCell>
                          {m.is_primary ? (
                            <span className="text-sm">Head of Family</span>
                          ) : (
                            <select
                              className="bg-secondary border border-border rounded px-2 py-1 text-xs"
                              value={m.relationship}
                              onChange={(e) => updateMember(m.id, "relationship", e.target.value)}
                            >
                              {RELATIONSHIP_OPTIONS.filter((r) => r !== "Head of Family").map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{m.phone || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setExpandedMemberId(expandedMemberId === m.id ? null : m.id)}
                              className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                              title="Details & pricing"
                            >
                              {expandedMemberId === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            {!m.is_primary && (
                              <button type="button" onClick={() => removeMember(m.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedMemberId === m.id && (
                        <TableRow className="bg-secondary/20">
                          <TableCell colSpan={5} className="py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                              <div><span className="text-xs text-muted-foreground block">NID Number</span>{m.nid_number || "—"}</div>
                              <div><span className="text-xs text-muted-foreground block">Date of Birth</span>{m.date_of_birth || "—"}</div>
                              <div><span className="text-xs text-muted-foreground block">Email</span>{m.email || "—"}</div>
                              <div className="sm:col-span-2 lg:col-span-3"><span className="text-xs text-muted-foreground block">Address</span>{m.address || "—"}</div>
                            </div>
                            {m.documents.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs text-muted-foreground mb-1">Customer Documents</p>
                                <div className="flex flex-wrap gap-2">
                                  {m.documents.map((d) => (
                                    <Badge key={d.document_type} variant="secondary" className="text-[10px] capitalize">{d.document_type}: {d.file_name}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Package *</label>
                                <select className={inputClass} value={m.package_id} onChange={(e) => updateMember(m.id, "package_id", e.target.value)}>
                                  <option value="">-- Package --</option>
                                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — BDT {Number(p.price).toLocaleString("en-IN")}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Selling Price (BDT)</label>
                                <input className={inputClass} type="number" min={0} value={m.selling_price} onChange={(e) => updateMember(m.id, "selling_price", e.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Discount (BDT)</label>
                                <input className={inputClass} type="number" min={0} value={m.discount} onChange={(e) => updateMember(m.id, "discount", e.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Final Price</label>
                                <div className={`${inputClass} bg-muted/30 font-bold`}>BDT {Math.max(0, num(m.selling_price) - num(m.discount)).toLocaleString("en-IN")}</div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {members.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">Total Selling:</span>{" "}
              <span className="font-bold text-foreground">BDT {familyTotal.toLocaleString("en-IN")}</span>
              <span className="text-muted-foreground ml-3">({members.length} members)</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Cost Price / Person (BDT)</label>
              <input className={inputClass} type="number" min={0} value={form.cost_price_per_person} placeholder="0" onChange={(e) => setForm((f) => ({ ...f, cost_price_per_person: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Commission / Person (BDT)</label>
              <input className={inputClass} type="number" min={0} value={form.commission_per_person} placeholder="0" onChange={(e) => setForm((f) => ({ ...f, commission_per_person: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Upload Documents (Optional)
        </h3>
        <p className="text-xs text-muted-foreground">Upload passport, NID, and photo. Max 5MB per file. Supported: PDF, JPG, PNG.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {DOC_TYPES.map((doc) => (
            <div key={doc.key} className="border border-dashed border-border rounded-lg p-4 text-center space-y-2">
              <File className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-xs font-medium text-foreground">{doc.label}</p>
              {docFiles[doc.key] ? (
                <div className="space-y-1">
                  <p className="text-xs text-primary truncate">{docFiles[doc.key]!.name}</p>
                  <button type="button" onClick={() => setDocFiles((prev) => ({ ...prev, [doc.key]: null }))} className="text-xs text-destructive hover:underline flex items-center gap-1 mx-auto">
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>
              ) : uploadedDocs[doc.key] ? (
                <div className="flex items-center gap-1 justify-center text-xs text-primary">
                  <CheckCircle className="h-3 w-3" /> Uploaded
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRefs.current[doc.key]?.click()} className="text-xs bg-secondary hover:bg-muted text-foreground px-3 py-1.5 rounded-md transition-colors">
                  Choose File
                </button>
              )}
              <input
                ref={(el) => { fileInputRefs.current[doc.key] = el; }}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => handleDocSelect(doc.key, e.target.files?.[0] || null)}
              />
              {docUploading === doc.key && <p className="text-xs text-primary animate-pulse">Uploading...</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-heading font-semibold text-sm">Additional Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Supplier Agent (Optional)</label>
            <select className={inputClass} value={form.supplier_agent_id} onChange={(e) => setForm({ ...form, supplier_agent_id: e.target.value })}>
              <option value="">-- Select Supplier --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.agent_name} {s.company_name ? `(${s.company_name})` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Moallem (Optional)</label>
            <select className={inputClass} value={form.moallem_id} onChange={(e) => setForm({ ...form, moallem_id: e.target.value })}>
              <option value="">-- Select Moallem --</option>
              {moallems.map((m) => (
                <option key={m.id} value={m.id}>{m.name} {m.phone ? `(${m.phone})` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Paid Amount (BDT)</label>
            <input className={inputClass} type="number" min={0} max={totalSellingPrice} value={form.paid_amount} placeholder="0" onChange={(e) => setForm((f) => ({ ...f, paid_amount: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Payment Method</label>
            <select
              className={inputClass}
              value={form.payment_method}
              onChange={(e) => {
                const method = e.target.value;
                const walletMap: Record<string, string> = { cash: "Cash", manual: "Cash", bank: "Bank", bank_transfer: "Bank", bkash: "bKash", nagad: "Nagad" };
                const matchedWallet = walletAccounts.find((w: any) => w.name === walletMap[method]);
                setForm({ ...form, payment_method: method, wallet_account_id: matchedWallet?.id || "" });
              }}
            >
              <option value="cash">Cash</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Wallet Account</label>
            <select className={inputClass} value={form.wallet_account_id} onChange={(e) => setForm({ ...form, wallet_account_id: e.target.value })}>
              <option value="">-- Select Wallet * --</option>
              {walletAccounts.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name} — BDT {Number(w.balance || 0).toLocaleString("en-IN")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Status</label>
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {["pending", "confirmed", "visa_processing", "ticket_issued", "completed", "cancelled"].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notes</label>
            <input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional info..." maxLength={500} />
          </div>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
        <h3 className="font-heading font-semibold text-sm mb-3">Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="font-medium">{form.guest_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Type</p>
            <p className="font-medium">{bookingType === "individual" ? "Individual" : `Family (${members.length} members)`}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Selling</p>
            <p className="font-heading font-bold text-foreground">BDT {totalSellingPrice.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due</p>
            <p className={cn("font-heading font-bold", dueAmount > 0 ? "text-destructive" : "text-foreground")}>BDT {dueAmount.toLocaleString("en-IN")}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate("/admin/bookings")} className="px-5 py-2.5 text-sm rounded-md bg-secondary text-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={loading} className="px-5 py-2.5 text-sm rounded-md bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-gold disabled:opacity-50 flex items-center gap-2">
          <Save className="h-4 w-4" />
          {loading ? "Creating..." : "Create Booking"}
        </button>
      </div>
    </div>
  );
}
