import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/api";
import { Search, User, X, UserPlus } from "lucide-react";

export interface CustomerProfile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  passport_number: string | null;
  address: string | null;
  nid_number?: string | null;
  date_of_birth?: string | null;
}

interface Props {
  onSelect: (customer: CustomerProfile | null) => void;
  selectedId: string | null;
  excludeUserIds?: string[];
  onDuplicateAttempt?: (customer: CustomerProfile) => void;
  showSelectedCard?: boolean;
  placeholder?: string;
  clearAfterSelect?: boolean;
}

export default function CustomerSearchSelect({
  onSelect,
  selectedId,
  excludeUserIds = [],
  onDuplicateAttempt,
  showSelectedCard = true,
  placeholder = "Search by name, phone, email or passport...",
  clearAfterSelect = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CustomerProfile | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, email, passport_number, address, nid_number, date_of_birth")
        .order("full_name")
        .limit(200);
      const term = q.trim().toLowerCase();
      const exclude = new Set(excludeUserIds);
      const filtered = (data || [])
        .filter((c: CustomerProfile) => !exclude.has(c.user_id))
        .filter((c: CustomerProfile) => {
          const name = (c.full_name || "").toLowerCase();
          const phone = (c.phone || "").toLowerCase();
          const passport = (c.passport_number || "").toLowerCase();
          const email = (c.email || "").toLowerCase();
          const nid = (c.nid_number || "").toLowerCase();
          return name.includes(term) || phone.includes(term) || passport.includes(term) || email.includes(term) || nid.includes(term);
        })
        .slice(0, 20);
      setResults(filtered);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [excludeUserIds]);

  const handleInputChange = (val: string) => {
    setQuery(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCustomers(val), 300);
  };

  const handleSelect = (c: CustomerProfile) => {
    if (excludeUserIds.includes(c.user_id)) {
      onDuplicateAttempt?.(c);
      return;
    }
    if (clearAfterSelect) {
      setQuery("");
      setOpen(false);
      onSelect(c);
      return;
    }
    setSelected(c);
    setQuery("");
    setOpen(false);
    onSelect(c);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
    onSelect(null);
  };

  useEffect(() => {
    if (!selectedId && selected) {
      setSelected(null);
      setQuery("");
    }
  }, [selectedId, selected]);

  useEffect(() => {
    if (selectedId && !selected) {
      supabase
        .from("profiles")
        .select("user_id, full_name, phone, email, passport_number, address, nid_number, date_of_birth")
        .eq("user_id", selectedId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setSelected(data as CustomerProfile);
        });
    }
  }, [selectedId, selected]);

  if (showSelectedCard && selected) {
    return (
      <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selected.full_name || "—"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {selected.phone || ""}{selected.phone && selected.passport_number ? " — " : ""}{selected.passport_number || ""}
          </p>
        </div>
        <button type="button" onClick={handleClear} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Remove">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full bg-secondary border border-border rounded-md pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (query.trim()) setOpen(true); }}
          placeholder={placeholder}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-xs text-muted-foreground text-center">Searching...</div>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">No customer found</p>
              <div className="flex items-center gap-1 justify-center text-xs text-primary">
                <UserPlus className="h-3 w-3" />
                <span>Add the customer in Customers module first</span>
              </div>
            </div>
          )}
          {!loading && results.map((c) => (
            <button
              key={c.user_id}
              type="button"
              onClick={() => handleSelect(c)}
              className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors flex items-center gap-3 border-b border-border/50 last:border-0"
            >
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.full_name || "—"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.phone || "—"}{c.passport_number ? ` — ${c.passport_number}` : ""}{c.email ? ` — ${c.email}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
