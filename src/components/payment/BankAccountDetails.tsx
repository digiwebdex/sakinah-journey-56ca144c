import type { BankAccount } from "@/lib/paymentMethods";
import { bankAccountSummary } from "@/lib/paymentMethods";

interface BankAccountDetailsProps {
  accounts: BankAccount[];
  compact?: boolean;
}

const FIELD_LABELS: { key: keyof BankAccount; label: string; labelBn: string; mono?: boolean }[] = [
  { key: "bank_name", label: "Bank Name", labelBn: "ব্যাংকের নাম" },
  { key: "account_name", label: "Account Name", labelBn: "অ্যাকাউন্ট নাম" },
  { key: "account_number", label: "Account Number", labelBn: "অ্যাকাউন্ট নম্বর", mono: true },
  { key: "routing_number", label: "Routing Number", labelBn: "রাউটিং নম্বর", mono: true },
  { key: "branch", label: "Branch", labelBn: "শাখা" },
  { key: "swift_code", label: "Swift Code", labelBn: "SWIFT কোড", mono: true },
];

export function BankAccountListSummary({ accounts }: { accounts: BankAccount[] }) {
  const filled = accounts.filter((a) => bankAccountSummary(a));
  if (filled.length === 0) return null;
  if (filled.length === 1) {
    return <p className="text-xs font-mono text-muted-foreground">{bankAccountSummary(filled[0])}</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      {filled.length} bank accounts available
    </p>
  );
}

export default function BankAccountDetails({ accounts, compact }: BankAccountDetailsProps) {
  const filled = accounts.filter((a) => FIELD_LABELS.some((f) => a[f.key]));
  if (filled.length === 0) return null;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {filled.map((account, idx) => (
        <div
          key={idx}
          className={filled.length > 1 ? "rounded-lg border border-border/60 p-3 space-y-1.5 bg-background/50" : "space-y-1.5"}
        >
          {filled.length > 1 && (
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              {account.bank_name || `Account ${idx + 1}`}
            </p>
          )}
          {FIELD_LABELS.map(({ key, label, labelBn, mono }) =>
            account[key] ? (
              <div key={key} className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground shrink-0">{labelBn || label}:</span>
                <span className={`text-sm text-foreground ${mono ? "font-mono font-bold tracking-wide" : "font-semibold"}`}>
                  {account[key]}
                </span>
              </div>
            ) : null
          )}
        </div>
      ))}
    </div>
  );
}
