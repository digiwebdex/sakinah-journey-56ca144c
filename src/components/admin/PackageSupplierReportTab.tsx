import { useMemo, useState, Fragment } from "react";
import { getYear } from "date-fns";
import {
  Handshake, TrendingUp, TrendingDown, Users, Wallet,
  ChevronDown, ChevronRight, FileDown, FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBDT, cn } from "@/lib/utils";
import { exportPDF, exportExcel } from "@/lib/reportExport";
import { buildPackageProfitReport, type PackageProfitFilters } from "@/lib/packageProfitReport";
import { buildPackageSupplierRows, summarizePackageSupplier } from "@/lib/packageSupplierSummary";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  packages: any[];
  bookings: any[];
  expenses: any[];
  moallemPayments: any[];
  commissionPayments: any[];
  supplierPayments: any[];
  packageContracts: any[];
  moallemMap: Record<string, any>;
  supplierMap: Record<string, any>;
  canSeeProfit: boolean;
  searchQuery?: string;
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("h-4 w-4", color)} />
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <p className={cn("text-lg font-heading font-bold", color)}>{value}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Package-wise supplier settlement and profit.
 *
 * Suppliers are contracted per package, so this view answers per package: what
 * the suppliers are owed, what has been paid, what is left, how many pilgrims
 * remain unpaid on either side, and whether the package made money or lost it.
 */
export default function PackageSupplierReportTab({
  packages, bookings, expenses, moallemPayments, commissionPayments,
  supplierPayments, packageContracts, moallemMap, supplierMap, canSeeProfit, searchQuery = "",
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<number>(getYear(new Date()));
  const [filterMonth, setFilterMonth] = useState<number | "all">("all");

  const years = useMemo(() => {
    const set = new Set<number>([getYear(new Date())]);
    bookings.forEach((b) => { if (b?.created_at) set.add(getYear(new Date(b.created_at))); });
    return Array.from(set).sort((a, b) => b - a);
  }, [bookings]);

  const filters: PackageProfitFilters = useMemo(
    () => ({ month: filterMonth, year: filterYear, packageId: "all", serviceType: "all" }),
    [filterMonth, filterYear]
  );

  // Revenue and the non-supplier costs come from the existing P&L engine, so both
  // reports agree on what a package earned.
  const profitRows = useMemo(
    () => buildPackageProfitReport(
      { packages, bookings, payments: [], expenses, moallemPayments, commissionPayments, supplierPayments, moallemMap, supplierMap },
      filters
    ),
    [packages, bookings, expenses, moallemPayments, commissionPayments, supplierPayments, moallemMap, supplierMap, filters]
  );

  const allRows = useMemo(
    () => buildPackageSupplierRows({ packages, contracts: packageContracts as any, supplierPayments, bookings, supplierMap, profitRows }),
    [packages, packageContracts, supplierPayments, bookings, supplierMap, profitRows]
  );

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const visible = q
      ? allRows.filter((r) => r.packageName.toLowerCase().includes(q) || r.packageType.toLowerCase().includes(q))
      : allRows;
    // Packages with nothing contracted and nothing booked are noise.
    return visible
      .filter((r) => r.contractTotal > 0 || r.paidTotal > 0 || r.bookedPax > 0 || r.salesRevenue > 0)
      .sort((a, b) => b.dueTotal - a.dueTotal);
  }, [allRows, searchQuery]);

  const totals = useMemo(() => summarizePackageSupplier(rows), [rows]);

  const periodLabel = filterMonth === "all" ? `Year ${filterYear}` : `${MONTHS[Number(filterMonth)]} ${filterYear}`;

  const exportColumns = ["Package", "Type", "Pilgrims", "Supplier Contract", "Paid", "Supplier Due", "Unpaid Pax", "Customer Due Pax", "Customer Due", "Revenue", canSeeProfit ? "Profit / Loss" : "—"];
  const exportRows = () => rows.map((r) => [
    r.packageName, r.packageType, r.bookedPax,
    r.contractTotal, r.paidTotal, r.dueTotal,
    r.supplierUnpaidPax, r.customerDuePax, r.customerDueAmount,
    r.salesRevenue, canSeeProfit ? r.profit : "—",
  ]);

  const summaryLines = [
    `Supplier Contract: BDT ${totals.contractTotal.toLocaleString("en-IN")}`,
    `Paid to Suppliers: BDT ${totals.paidTotal.toLocaleString("en-IN")}`,
    `Supplier Due: BDT ${totals.dueTotal.toLocaleString("en-IN")}`,
    `Pilgrims unpaid (supplier): ${totals.supplierUnpaidPax}`,
    `Pilgrims with dues (customer): ${totals.customerDuePax}`,
  ];
  if (canSeeProfit) {
    summaryLines.push(`${totals.profit < 0 ? "Loss" : "Profit"}: BDT ${Math.abs(totals.profit).toLocaleString("en-IN")}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(filterMonth)} onValueChange={(v) => setFilterMonth(v === "all" ? "all" : Number(v))}>
          <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Whole year</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
          <SelectTrigger className="w-[110px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => exportPDF({
          title: `Package-wise Supplier Settlement — ${periodLabel}`,
          columns: exportColumns, rows: exportRows(), summary: summaryLines,
        })}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
        <Button variant="outline" size="sm" onClick={() => exportExcel({
          title: `Package-wise Supplier Settlement — ${periodLabel}`,
          columns: exportColumns, rows: exportRows(), summary: summaryLines,
        })}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Supplier Contract" value={formatBDT(totals.contractTotal)} icon={Handshake} color="text-foreground" />
        <SummaryCard label="Paid to Suppliers" value={formatBDT(totals.paidTotal)} icon={Wallet} color="text-emerald-600" />
        <SummaryCard label="Supplier Due" value={formatBDT(totals.dueTotal)} icon={TrendingDown} color={totals.dueTotal > 0 ? "text-destructive" : "text-emerald-600"} />
        <SummaryCard label="Pilgrims Unpaid / Dues" value={`${totals.supplierUnpaidPax} / ${totals.customerDuePax}`} icon={Users} color="text-amber-600" />
        {canSeeProfit && (
          <SummaryCard
            label={totals.profit < 0 ? "Total Loss" : "Total Profit"}
            value={formatBDT(Math.abs(totals.profit))}
            icon={totals.profit < 0 ? TrendingDown : TrendingUp}
            color={totals.profit < 0 ? "text-destructive" : "text-emerald-600"}
          />
        )}
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Package</TableHead>
              <TableHead className="text-right">Pilgrims</TableHead>
              <TableHead className="text-right">Supplier Contract</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Supplier Due</TableHead>
              <TableHead className="text-right">Unpaid Pax</TableHead>
              <TableHead className="text-right">Customer Due</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              {canSeeProfit && <TableHead className="text-right">Profit / Loss</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canSeeProfit ? 10 : 9} className="text-center text-muted-foreground py-10 text-sm">
                  No package has a supplier contract or booking yet. Add one from Packages → Supplier Contracts.
                </TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <Fragment key={r.packageId}>
                <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(expanded === r.packageId ? null : r.packageId)}>
                  <TableCell>{expanded === r.packageId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell>
                    <span className="font-medium">{r.packageName}</span>
                    <span className="block text-[11px] text-muted-foreground capitalize">{r.packageType}</span>
                  </TableCell>
                  <TableCell className="text-right">{r.bookedPax}</TableCell>
                  <TableCell className="text-right font-medium">{formatBDT(r.contractTotal)}</TableCell>
                  <TableCell className="text-right text-emerald-600">{formatBDT(r.paidTotal)}</TableCell>
                  <TableCell className={cn("text-right font-semibold", r.dueTotal > 0 ? "text-destructive" : "text-emerald-600")}>
                    {formatBDT(r.dueTotal)}
                  </TableCell>
                  <TableCell className="text-right">{r.supplierUnpaidPax}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn(r.customerDuePax > 0 ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                      {r.customerDuePax} pax
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{formatBDT(r.customerDueAmount)}</span>
                  </TableCell>
                  <TableCell className="text-right">{formatBDT(r.salesRevenue)}</TableCell>
                  {canSeeProfit && (
                    <TableCell className={cn("text-right font-bold", r.isLoss ? "text-destructive" : "text-emerald-600")}>
                      {r.isLoss ? `− ${formatBDT(Math.abs(r.profit))}` : formatBDT(r.profit)}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {r.isLoss ? "Loss" : "Profit"}{r.salesRevenue > 0 ? ` · ${r.margin.toFixed(1)}%` : ""}
                      </span>
                    </TableCell>
                  )}
                </TableRow>

                {expanded === r.packageId && (
                  <TableRow>
                    <TableCell colSpan={canSeeProfit ? 10 : 9} className="bg-muted/20 p-3">
                      {r.suppliers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No supplier contract set for this package.
                          {r.paidTotal > 0 ? ` ${formatBDT(r.paidTotal)} has been paid against it without a contract.` : ""}
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground">
                                <th className="p-1.5 font-medium">Supplier</th>
                                <th className="p-1.5 font-medium text-right">Contracted Pax</th>
                                <th className="p-1.5 font-medium text-right">Contract</th>
                                <th className="p-1.5 font-medium text-right">Paid</th>
                                <th className="p-1.5 font-medium text-right">Due</th>
                                <th className="p-1.5 font-medium text-right">Unpaid Pax</th>
                                <th className="p-1.5 font-medium text-right">Payments</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.suppliers.map((s) => (
                                <tr key={s.supplierId} className="border-t border-border/60">
                                  <td className="p-1.5 font-medium">{s.supplierName}</td>
                                  <td className="p-1.5 text-right">{s.contractedPax || "—"}</td>
                                  <td className="p-1.5 text-right">{formatBDT(s.contractAmount)}</td>
                                  <td className="p-1.5 text-right text-emerald-600">{formatBDT(s.paid)}</td>
                                  <td className={cn("p-1.5 text-right font-semibold", s.due > 0 ? "text-destructive" : "text-emerald-600")}>{formatBDT(s.due)}</td>
                                  <td className="p-1.5 text-right">{s.unpaidPax}</td>
                                  <td className="p-1.5 text-right text-muted-foreground">{s.paymentCount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Costs other than suppliers on this package: {formatBDT(r.otherExpenses)} ·
                            {" "}Total cost {formatBDT(r.totalCost)} · Collected {formatBDT(r.collected)}
                          </p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Supplier due is the agreed package contract minus what has been paid against that package.
        Profit counts the full contract as a cost, so an unpaid supplier never shows up as profit.
      </p>
    </div>
  );
}
