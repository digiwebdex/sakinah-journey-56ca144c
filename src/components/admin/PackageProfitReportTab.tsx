import { useMemo, useState, Fragment } from "react";
import { getMonth, getYear } from "date-fns";
import {
  Package, TrendingUp, TrendingDown, DollarSign, BarChart3,
  ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Printer, Award, Star,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBDT, cn } from "@/lib/utils";
import { exportPDF, exportExcel } from "@/lib/reportExport";
import {
  buildMonthlyPackageRows,
  buildPackageProfitReport,
  summarizePackageProfit,
  type PackageProfitFilters,
  type PackageProfitRow,
} from "@/lib/packageProfitReport";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  packages: any[];
  bookings: any[];
  payments: any[];
  expenses: any[];
  moallemPayments: any[];
  commissionPayments: any[];
  supplierPayments: any[];
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

export default function PackageProfitReportTab({
  packages,
  bookings,
  payments,
  expenses,
  moallemPayments,
  commissionPayments,
  supplierPayments,
  moallemMap,
  supplierMap,
  canSeeProfit,
  searchQuery = "",
}: Props) {
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>(String(getMonth(now)));
  const [filterYear, setFilterYear] = useState(String(getYear(now)));
  const [filterPackage, setFilterPackage] = useState("all");
  const [filterServiceType, setFilterServiceType] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailPackage, setDetailPackage] = useState<PackageProfitRow | null>(null);

  const years = useMemo(() => {
    const set = new Set<number>([getYear(now)]);
    bookings.forEach((b) => { try { set.add(getYear(new Date(b.created_at))); } catch { /* ignore */ } });
    return Array.from(set).sort((a, b) => b - a);
  }, [bookings, now]);

  const serviceTypes = useMemo(() => {
    const set = new Set<string>();
    packages.forEach((p) => { if (p.type) set.add(p.type); });
    return Array.from(set).sort();
  }, [packages]);

  const filters: PackageProfitFilters = useMemo(() => ({
    month: filterMonth === "all" ? "all" : Number(filterMonth),
    year: Number(filterYear),
    packageId: filterPackage,
    serviceType: filterServiceType,
    searchQuery,
  }), [filterMonth, filterYear, filterPackage, filterServiceType, searchQuery]);

  const reportInput = useMemo(() => ({
    packages,
    bookings,
    payments,
    expenses,
    moallemPayments,
    commissionPayments,
    supplierPayments,
    moallemMap,
    supplierMap,
  }), [packages, bookings, payments, expenses, moallemPayments, commissionPayments, supplierPayments, moallemMap, supplierMap]);

  const rows = useMemo(() => buildPackageProfitReport(reportInput, filters), [reportInput, filters]);
  const summary = useMemo(() => summarizePackageProfit(rows), [rows]);
  const monthlyRows = useMemo(() => buildMonthlyPackageRows(rows), [rows]);

  const periodLabel = filterMonth === "all"
    ? `Year ${filterYear}`
    : `${MONTHS[Number(filterMonth)]} ${filterYear}`;

  const handleExportPdf = () => {
    exportPDF({
      title: `Package Sales & Profit Report — ${periodLabel}`,
      columns: ["Package", "Bookings", "Customers", "Revenue", "Collected", "Due", "Expenses", "Profit", "Margin %"],
      rows: rows.map((r) => [
        r.packageName,
        r.totalBookings,
        r.totalCustomers,
        r.totalSalesRevenue,
        r.totalCollected,
        r.totalDue,
        r.totalExpenses,
        r.grossProfit,
        `${r.profitMargin.toFixed(1)}%`,
      ]),
      summary: [
        `Period: ${periodLabel}`,
        `Total Sales: BDT ${summary.totalSales.toLocaleString("en-IN")}`,
        `Total Expenses: BDT ${summary.totalExpenses.toLocaleString("en-IN")}`,
        `Total Profit: BDT ${summary.totalProfit.toLocaleString("en-IN")}`,
        `Best Selling: ${summary.bestSellingPackage}`,
        `Most Profitable: ${summary.mostProfitablePackage}`,
      ],
    });
  };

  const handleExportExcel = () => {
    exportExcel({
      title: `Package Sales & Profit Report — ${periodLabel}`,
      columns: ["Package", "Type", "Bookings", "Customers", "Revenue", "Collected", "Due", "Expenses", "Profit", "Margin %"],
      rows: rows.map((r) => [
        r.packageName,
        r.packageType,
        r.totalBookings,
        r.totalCustomers,
        r.totalSalesRevenue,
        r.totalCollected,
        r.totalDue,
        r.totalExpenses,
        r.grossProfit,
        `${r.profitMargin.toFixed(1)}%`,
      ]),
      summary: [
        `Total Sales: BDT ${summary.totalSales.toLocaleString("en-IN")}`,
        `Total Expenses: BDT ${summary.totalExpenses.toLocaleString("en-IN")}`,
        `Total Profit: BDT ${summary.totalProfit.toLocaleString("en-IN")}`,
      ],
    });
  };

  const handlePrint = () => {
    handleExportPdf();
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterPackage} onValueChange={setFilterPackage}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Package" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Packages</SelectItem>
            {packages.filter((p) => p.is_active !== false).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterServiceType} onValueChange={setFilterServiceType}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Service Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {serviceTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExportPdf}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          <Button size="sm" variant="outline" onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Print</Button>
        </div>
      </div>

      {/* Dashboard widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label={`Sales (${periodLabel})`} value={formatBDT(summary.totalSales)} icon={TrendingUp} color="text-primary" />
        <SummaryCard label={`Expenses (${periodLabel})`} value={formatBDT(summary.totalExpenses)} icon={TrendingDown} color="text-destructive" />
        {canSeeProfit && <SummaryCard label={`Profit (${periodLabel})`} value={formatBDT(summary.totalProfit)} icon={DollarSign} color={summary.totalProfit >= 0 ? "text-primary" : "text-destructive"} />}
        <SummaryCard label="Best Selling Package" value={summary.bestSellingPackage} icon={Star} color="text-amber-600" />
        {canSeeProfit && <SummaryCard label="Most Profitable Package" value={summary.mostProfitablePackage} icon={Award} color="text-emerald-600" />}
      </div>

      {/* Monthly summary table */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Monthly Package Report — {periodLabel}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  {canSeeProfit && <TableHead className="text-right">Profit</TableHead>}
                  {canSeeProfit && <TableHead className="text-right">Margin</TableHead>}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyRows.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No package data for selected period</TableCell></TableRow>
                )}
                {monthlyRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.package}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize text-xs">{r.type}</Badge></TableCell>
                    <TableCell className="text-right">{r.bookings}</TableCell>
                    <TableCell className="text-right font-medium">{formatBDT(r.revenue)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatBDT(r.expenses)}</TableCell>
                    {canSeeProfit && <TableCell className={cn("text-right font-bold", r.profit >= 0 ? "text-primary" : "text-destructive")}>{formatBDT(r.profit)}</TableCell>}
                    {canSeeProfit && <TableCell className="text-right text-xs">{r.margin.toFixed(1)}%</TableCell>}
                    <TableCell>
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setDetailPackage(rows[i])}>Details</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {monthlyRows.length > 0 && (
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{formatBDT(summary.totalSales)}</TableCell>
                    <TableCell className="text-right">{formatBDT(summary.totalExpenses)}</TableCell>
                    {canSeeProfit && <TableCell className="text-right">{formatBDT(summary.totalProfit)}</TableCell>}
                    {canSeeProfit && <TableCell />}
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed revenue & expense breakdown */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Package Revenue & Expense Tracking
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Sales Revenue</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  {canSeeProfit && <TableHead className="text-right">Gross Profit</TableHead>}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <Fragment key={r.packageId}>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell>
                        <button type="button" onClick={() => setExpandedId(expandedId === r.packageId ? null : r.packageId)} className="p-1">
                          {expandedId === r.packageId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.packageName}</div>
                        <Badge variant="outline" className="capitalize text-[10px] mt-0.5">{r.packageType}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.totalBookings}</TableCell>
                      <TableCell className="text-right">{r.totalCustomers}</TableCell>
                      <TableCell className="text-right font-medium">{formatBDT(r.totalSalesRevenue)}</TableCell>
                      <TableCell className="text-right text-primary">{formatBDT(r.totalCollected)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatBDT(r.totalDue)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatBDT(r.totalExpenses)}</TableCell>
                      {canSeeProfit && (
                        <TableCell className={cn("text-right font-bold", r.grossProfit >= 0 ? "text-primary" : "text-destructive")}>
                          {formatBDT(r.grossProfit)}
                          <span className="block text-[10px] font-normal text-muted-foreground">{r.profitMargin.toFixed(1)}% margin</span>
                        </TableCell>
                      )}
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDetailPackage(r)}>View</Button>
                      </TableCell>
                    </TableRow>
                    {expandedId === r.packageId && canSeeProfit && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={10} className="py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
                            <div><span className="text-muted-foreground block">Supplier</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.supplier)}</span></div>
                            <div><span className="text-muted-foreground block">Moallem</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.moallem)}</span></div>
                            <div><span className="text-muted-foreground block">Commission</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.commission)}</span></div>
                            <div><span className="text-muted-foreground block">Visa</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.visa)}</span></div>
                            <div><span className="text-muted-foreground block">Air Ticket</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.airTicket)}</span></div>
                            <div><span className="text-muted-foreground block">Hotel</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.hotel)}</span></div>
                            <div><span className="text-muted-foreground block">Transport</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.transport)}</span></div>
                            <div><span className="text-muted-foreground block">Other</span><span className="font-semibold">{formatBDT(r.expenseBreakdown.other + r.expenseBreakdown.general)}</span></div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Package detail dialog */}
      <Dialog open={!!detailPackage} onOpenChange={(o) => { if (!o) setDetailPackage(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{detailPackage?.packageName} — Profit Details</DialogTitle>
          </DialogHeader>
          {detailPackage && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Sales</p><p className="font-bold">{formatBDT(detailPackage.totalSalesRevenue)}</p></CardContent></Card>
                <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Collected</p><p className="font-bold text-primary">{formatBDT(detailPackage.totalCollected)}</p></CardContent></Card>
                <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Due</p><p className="font-bold text-destructive">{formatBDT(detailPackage.totalDue)}</p></CardContent></Card>
                <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Expenses</p><p className="font-bold text-destructive">{formatBDT(detailPackage.totalExpenses)}</p></CardContent></Card>
                {canSeeProfit && (
                  <Card className="border col-span-2"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Net Profit ({detailPackage.profitMargin.toFixed(1)}%)</p><p className={cn("font-bold text-lg", detailPackage.grossProfit >= 0 ? "text-primary" : "text-destructive")}>{formatBDT(detailPackage.grossProfit)}</p></CardContent></Card>
                )}
              </div>

              <Section title="Bookings" count={detailPackage.bookings.length}>
                <MiniTable headers={["Tracking", "Guest", "Total", "Paid", "Due", "Status"]} rows={detailPackage.bookings.map((b) => [b.trackingId, b.guestName, formatBDT(b.total), formatBDT(b.paid), formatBDT(b.due), b.status])} />
              </Section>
              <Section title="Customers" count={detailPackage.customers.length}>
                <MiniTable headers={["Name", "Phone", "Bookings", "Paid"]} rows={detailPackage.customers.map((c) => [c.name, c.phone, c.bookings, formatBDT(c.totalPaid)])} />
              </Section>
              <Section title="Supplier Payments" count={detailPackage.supplierPayments.length}>
                <MiniTable headers={["Supplier", "Amount", "Date", "Method"]} rows={detailPackage.supplierPayments.map((p) => [p.supplier, formatBDT(p.amount), p.date, p.method])} />
              </Section>
              <Section title="Moallem Payments" count={detailPackage.moallemPayments.length}>
                <MiniTable headers={["Moallem", "Amount", "Date", "Method"]} rows={detailPackage.moallemPayments.map((p) => [p.moallem, formatBDT(p.amount), p.date, p.method])} />
              </Section>
              <Section title="Other Expenses" count={detailPackage.expenseItems.length}>
                <MiniTable headers={["Title", "Type", "Amount", "Date"]} rows={detailPackage.expenseItems.map((e) => [e.title, e.type, formatBDT(e.amount), e.date])} />
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title} ({count})</h4>
      {children}
    </div>
  );
}

function MiniTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No records</p>;
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-xs">
        <thead><tr className="border-b bg-muted/30">{headers.map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-b border-border/40">{row.map((cell, j) => <td key={j} className="p-2">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
