import { useMemo, useState, Fragment } from "react";
import { getMonth, getYear } from "date-fns";
import {
  Layers, TrendingUp, TrendingDown, DollarSign, Globe, Plane, Ticket, Building2, MapPin,
  FileDown, FileSpreadsheet, Printer, Award, ChevronDown, ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBDT, cn } from "@/lib/utils";
import { exportPDF, exportExcel } from "@/lib/reportExport";
import {
  SERVICE_CATEGORIES,
  buildServiceProfitReport,
  formatServiceTableRows,
  summarizeServiceProfit,
  type ServiceProfitFilters,
  type ServiceProfitRow,
} from "@/lib/serviceProfitReport";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const SERVICE_ICONS: Record<string, any> = {
  hajj: Globe,
  umrah: Globe,
  air_ticket: Plane,
  hotel: Building2,
  visa: Ticket,
  tour: MapPin,
};

interface Props {
  packages: any[];
  bookings: any[];
  expenses: any[];
  moallemPayments: any[];
  commissionPayments: any[];
  supplierPayments: any[];
  canSeeProfit: boolean;
  searchQuery?: string;
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <Card className="border">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("h-3.5 w-3.5", color)} />
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
        <p className={cn("text-sm font-heading font-bold truncate", color)}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default function ServiceProfitReportTab({
  packages,
  bookings,
  expenses,
  moallemPayments,
  commissionPayments,
  supplierPayments,
  canSeeProfit,
  searchQuery = "",
}: Props) {
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>(String(getMonth(now)));
  const [filterYear, setFilterYear] = useState(String(getYear(now)));
  const [filterService, setFilterService] = useState("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<ServiceProfitRow | null>(null);

  const years = useMemo(() => {
    const set = new Set<number>([getYear(now)]);
    bookings.forEach((b) => { try { set.add(getYear(new Date(b.created_at))); } catch { /* ignore */ } });
    return Array.from(set).sort((a, b) => b - a);
  }, [bookings, now]);

  const filters: ServiceProfitFilters = useMemo(() => ({
    month: filterMonth === "all" ? "all" : Number(filterMonth),
    year: Number(filterYear),
    serviceKey: filterService,
    searchQuery,
  }), [filterMonth, filterYear, filterService, searchQuery]);

  const reportInput = useMemo(() => ({
    packages, bookings, expenses, moallemPayments, commissionPayments, supplierPayments,
  }), [packages, bookings, expenses, moallemPayments, commissionPayments, supplierPayments]);

  const rows = useMemo(() => buildServiceProfitReport(reportInput, filters), [reportInput, filters]);
  const summary = useMemo(() => summarizeServiceProfit(rows), [rows]);
  const tableRows = useMemo(() => formatServiceTableRows(rows), [rows]);

  const periodLabel = filterMonth === "all" ? `Year ${filterYear}` : `${MONTHS[Number(filterMonth)]} ${filterYear}`;

  const exportData = {
    title: `Service Revenue & Profit Report — ${periodLabel}`,
    columns: ["Service", "Bookings", "Revenue", "Expenses", "Profit", "Margin %"],
    rows: tableRows.map((r) => [r.service, r.bookings, r.revenue, r.expense, r.profit, `${r.margin.toFixed(1)}%`]),
    summary: [
      `Period: ${periodLabel}`,
      ...SERVICE_CATEGORIES.map((s) => `${s.label} Revenue: BDT ${summary.byService[s.key].revenue.toLocaleString("en-IN")}`),
      `Total Expenses: BDT ${summary.totalExpenses.toLocaleString("en-IN")}`,
      `Net Profit: BDT ${summary.netProfit.toLocaleString("en-IN")}`,
      `Best Service: ${summary.bestService}`,
    ],
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterService} onValueChange={setFilterService}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Service" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            {SERVICE_CATEGORIES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportPDF(exportData)}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          <Button size="sm" variant="outline" onClick={() => exportExcel(exportData)}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
          <Button size="sm" variant="outline" onClick={() => exportPDF(exportData)}><Printer className="h-4 w-4 mr-1" /> Print</Button>
        </div>
      </div>

      {/* Monthly revenue cards by service */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {SERVICE_CATEGORIES.map((s) => {
          const Icon = SERVICE_ICONS[s.key] || Layers;
          const data = summary.byService[s.key];
          return (
            <SummaryCard
              key={s.key}
              label={`${s.label} Revenue`}
              value={formatBDT(data.revenue)}
              icon={Icon}
              color="text-primary"
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total Expenses" value={formatBDT(summary.totalExpenses)} icon={TrendingDown} color="text-destructive" />
        {canSeeProfit && (
          <>
            <SummaryCard label="Net Profit" value={formatBDT(summary.netProfit)} icon={DollarSign} color={summary.netProfit >= 0 ? "text-primary" : "text-destructive"} />
            <SummaryCard label="Best Performing Service" value={summary.bestService} icon={Award} color="text-emerald-600" />
            <SummaryCard label="Best Performing Package" value={summary.bestPackage} icon={TrendingUp} color="text-amber-600" />
          </>
        )}
      </div>

      {/* Main P&L table */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Service-wise Revenue, Expense & Profit — {periodLabel}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  {canSeeProfit && <TableHead className="text-right">Profit</TableHead>}
                  {canSeeProfit && <TableHead className="text-right">Margin</TableHead>}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No service data for selected period</TableCell></TableRow>
                )}
                {rows.map((r) => {
                  const Icon = SERVICE_ICONS[r.serviceKey] || Layers;
                  return (
                    <Fragment key={r.serviceKey}>
                      <TableRow className="hover:bg-muted/30">
                        <TableCell>
                          <button type="button" onClick={() => setExpandedKey(expandedKey === r.serviceKey ? null : r.serviceKey)}>
                            {(r.serviceKey === "hajj" || r.serviceKey === "umrah") && r.packages.length > 0 ? (
                              expandedKey === r.serviceKey ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                            ) : null}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            <Icon className="h-4 w-4 text-primary" /> {r.label}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{r.totalBookings}</TableCell>
                        <TableCell className="text-right font-medium">{formatBDT(r.revenue)}</TableCell>
                        <TableCell className="text-right text-destructive">{formatBDT(r.totalExpenses)}</TableCell>
                        {canSeeProfit && (
                          <TableCell className={cn("text-right font-bold", r.grossProfit >= 0 ? "text-primary" : "text-destructive")}>
                            {formatBDT(r.grossProfit)}
                          </TableCell>
                        )}
                        {canSeeProfit && <TableCell className="text-right text-xs">{r.profitMargin.toFixed(1)}%</TableCell>}
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetailRow(r)}>Details</Button>
                        </TableCell>
                      </TableRow>
                      {expandedKey === r.serviceKey && r.packages.length > 0 && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={8} className="py-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Package-wise ({r.label})</p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground border-b">
                                  <th className="pb-2 pr-3">Package</th>
                                  <th className="pb-2 pr-3 text-right">Bookings</th>
                                  <th className="pb-2 pr-3 text-right">Revenue</th>
                                  <th className="pb-2 pr-3 text-right">Collected</th>
                                  <th className="pb-2 pr-3 text-right">Due</th>
                                  <th className="pb-2 pr-3 text-right">Expenses</th>
                                  <th className="pb-2 text-right">Profit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.packages.map((p) => (
                                  <tr key={p.packageId} className="border-b border-border/40">
                                    <td className="py-2 pr-3 font-medium">{p.packageName}</td>
                                    <td className="py-2 pr-3 text-right">{p.bookings}</td>
                                    <td className="py-2 pr-3 text-right">{formatBDT(p.revenue)}</td>
                                    <td className="py-2 pr-3 text-right text-primary">{formatBDT(p.collected)}</td>
                                    <td className="py-2 pr-3 text-right text-destructive">{formatBDT(p.due)}</td>
                                    <td className="py-2 pr-3 text-right">{formatBDT(p.expenses)}</td>
                                    <td className={cn("py-2 text-right font-bold", p.profit >= 0 ? "text-primary" : "text-destructive")}>{formatBDT(p.profit)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </TableCell>
                        </TableRow>
                      )}
                      {canSeeProfit && expandedKey === r.serviceKey && (
                        <TableRow className="bg-muted/10">
                          <TableCell colSpan={8} className="py-2">
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2 text-xs px-2">
                              <div><span className="text-muted-foreground block">Supplier</span>{formatBDT(r.expenseBreakdown.supplier)}</div>
                              <div><span className="text-muted-foreground block">Moallem</span>{formatBDT(r.expenseBreakdown.moallem)}</div>
                              <div><span className="text-muted-foreground block">Commission</span>{formatBDT(r.expenseBreakdown.commission)}</div>
                              <div><span className="text-muted-foreground block">Visa</span>{formatBDT(r.expenseBreakdown.visa)}</div>
                              <div><span className="text-muted-foreground block">Air Ticket</span>{formatBDT(r.expenseBreakdown.airTicket)}</div>
                              <div><span className="text-muted-foreground block">Hotel</span>{formatBDT(r.expenseBreakdown.hotel)}</div>
                              <div><span className="text-muted-foreground block">Transport</span>{formatBDT(r.expenseBreakdown.transport)}</div>
                              <div><span className="text-muted-foreground block">Guide</span>{formatBDT(r.expenseBreakdown.guide)}</div>
                              <div><span className="text-muted-foreground block">Other</span>{formatBDT(r.expenseBreakdown.other)}</div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length > 0 && (
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{formatBDT(summary.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{formatBDT(summary.totalExpenses)}</TableCell>
                    {canSeeProfit && <TableCell className="text-right">{formatBDT(summary.netProfit)}</TableCell>}
                    {canSeeProfit && <TableCell colSpan={2} />}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailRow(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{detailRow?.label} — Financial Summary</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Revenue</p><p className="font-bold">{formatBDT(detailRow.revenue)}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Collected</p><p className="font-bold text-primary">{formatBDT(detailRow.collected)}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Due</p><p className="font-bold text-destructive">{formatBDT(detailRow.due)}</p></CardContent></Card>
              <Card className="border"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Expenses</p><p className="font-bold text-destructive">{formatBDT(detailRow.totalExpenses)}</p></CardContent></Card>
              {canSeeProfit && (
                <Card className="border col-span-2"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Net Profit ({detailRow.profitMargin.toFixed(1)}%)</p><p className={cn("font-bold text-lg", detailRow.grossProfit >= 0 ? "text-primary" : "text-destructive")}>{formatBDT(detailRow.grossProfit)}</p></CardContent></Card>
              )}
              <div className="col-span-2 text-xs text-muted-foreground">
                Bookings: {detailRow.totalBookings} · Customers: {detailRow.totalCustomers}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
