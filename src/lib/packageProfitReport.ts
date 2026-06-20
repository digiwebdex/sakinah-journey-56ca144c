import { format, getMonth, getYear, isWithinInterval, parseISO } from "date-fns";

export interface PackageProfitFilters {
  month: number | "all";
  year: number;
  packageId: string;
  serviceType: string;
  searchQuery?: string;
}

export interface PackageExpenseBreakdown {
  supplier: number;
  moallem: number;
  commission: number;
  visa: number;
  airTicket: number;
  hotel: number;
  transport: number;
  other: number;
  general: number;
}

export interface PackageProfitRow {
  packageId: string;
  packageName: string;
  packageType: string;
  totalBookings: number;
  totalCustomers: number;
  totalSalesRevenue: number;
  totalCollected: number;
  totalDue: number;
  totalExpenses: number;
  expenseBreakdown: PackageExpenseBreakdown;
  grossProfit: number;
  profitMargin: number;
  bookings: Array<{
    id: string;
    trackingId: string;
    guestName: string;
    phone: string;
    total: number;
    paid: number;
    due: number;
    status: string;
    date: string;
  }>;
  customers: Array<{ name: string; phone: string; bookings: number; totalPaid: number }>;
  supplierPayments: Array<{ amount: number; date: string; method: string; supplier: string; notes: string }>;
  moallemPayments: Array<{ amount: number; date: string; method: string; moallem: string; notes: string }>;
  expenseItems: Array<{ title: string; amount: number; date: string; type: string; category: string }>;
}

export interface PackageProfitReportInput {
  packages: any[];
  bookings: any[];
  payments: any[];
  expenses: any[];
  moallemPayments: any[];
  commissionPayments: any[];
  supplierPayments: any[];
  moallemMap: Record<string, any>;
  supplierMap: Record<string, any>;
}

export interface PackageProfitSummary {
  totalSales: number;
  totalExpenses: number;
  totalProfit: number;
  bestSellingPackage: string;
  mostProfitablePackage: string;
}

const EXPENSE_TYPE_BUCKETS: Record<string, keyof PackageExpenseBreakdown> = {
  visa: "visa",
  ticket: "airTicket",
  air_ticket: "airTicket",
  hotel: "hotel",
  transport: "transport",
  food: "other",
  guide: "other",
  ziyarah: "other",
  insurance: "other",
  other: "other",
};

function inPeriod(dateStr: string | null | undefined, filters: PackageProfitFilters): boolean {
  if (!dateStr) return false;
  try {
    const d = parseISO(dateStr);
    if (getYear(d) !== filters.year) return false;
    if (filters.month !== "all" && getMonth(d) !== filters.month) return false;
    return true;
  } catch {
    return false;
  }
}

function resolvePackageId(
  item: { package_id?: string | null; booking_id?: string | null },
  bookingPackageMap: Record<string, string>
): string | null {
  if (item.package_id) return item.package_id;
  if (item.booking_id && bookingPackageMap[item.booking_id]) return bookingPackageMap[item.booking_id];
  return null;
}

function emptyBreakdown(): PackageExpenseBreakdown {
  return { supplier: 0, moallem: 0, commission: 0, visa: 0, airTicket: 0, hotel: 0, transport: 0, other: 0, general: 0 };
}

function addExpenseAmount(breakdown: PackageExpenseBreakdown, expenseType: string, amount: number) {
  const bucket = EXPENSE_TYPE_BUCKETS[expenseType] || "general";
  breakdown[bucket] += amount;
}

export function buildPackageProfitReport(
  input: PackageProfitReportInput,
  filters: PackageProfitFilters
): PackageProfitRow[] {
  const { packages, bookings, expenses, moallemPayments, commissionPayments, supplierPayments, moallemMap, supplierMap } = input;

  const bookingPackageMap: Record<string, string> = {};
  bookings.forEach((b) => {
    if (b.id && b.package_id) bookingPackageMap[b.id] = b.package_id;
  });

  const packageMeta = new Map(packages.map((p) => [p.id, p]));
  const rows = new Map<string, PackageProfitRow>();

  const ensureRow = (packageId: string): PackageProfitRow | null => {
    if (filters.packageId !== "all" && packageId !== filters.packageId) return null;
    const pkg = packageMeta.get(packageId);
    if (!pkg) return null;
    if (filters.serviceType !== "all" && pkg.type !== filters.serviceType) return null;

    if (!rows.has(packageId)) {
      rows.set(packageId, {
        packageId,
        packageName: pkg.name || "-",
        packageType: pkg.type || "-",
        totalBookings: 0,
        totalCustomers: 0,
        totalSalesRevenue: 0,
        totalCollected: 0,
        totalDue: 0,
        totalExpenses: 0,
        expenseBreakdown: emptyBreakdown(),
        grossProfit: 0,
        profitMargin: 0,
        bookings: [],
        customers: [],
        supplierPayments: [],
        moallemPayments: [],
        expenseItems: [],
      });
    }
    return rows.get(packageId)!;
  };

  const customerSets = new Map<string, Set<string>>();

  bookings
    .filter((b) => b.status !== "cancelled")
    .forEach((b) => {
      if (!b.package_id || !inPeriod(b.created_at, filters)) return;
      const row = ensureRow(b.package_id);
      if (!row) return;

      row.totalBookings += 1;
      row.totalSalesRevenue += Number(b.total_amount || 0);
      row.totalCollected += Number(b.paid_amount || 0);
      row.totalDue += Number(b.due_amount || 0);
      row.bookings.push({
        id: b.id,
        trackingId: b.tracking_id || "-",
        guestName: b.guest_name || "-",
        phone: b.guest_phone || "-",
        total: Number(b.total_amount || 0),
        paid: Number(b.paid_amount || 0),
        due: Number(b.due_amount || 0),
        status: b.status || "-",
        date: b.created_at ? format(parseISO(b.created_at), "dd MMM yyyy") : "-",
      });

      const customerKey = b.guest_phone || b.user_id || b.guest_name || b.id;
      if (!customerSets.has(b.package_id)) customerSets.set(b.package_id, new Set());
      customerSets.get(b.package_id)!.add(customerKey);
    });

  supplierPayments.forEach((sp) => {
    if (!inPeriod(sp.date, filters)) return;
    const packageId = resolvePackageId(sp, bookingPackageMap);
    if (!packageId) return;
    const row = ensureRow(packageId);
    if (!row) return;
    const amount = Number(sp.amount || 0);
    row.expenseBreakdown.supplier += amount;
    row.totalExpenses += amount;
    row.supplierPayments.push({
      amount,
      date: sp.date ? format(parseISO(sp.date), "dd MMM yyyy") : "-",
      method: sp.payment_method || "cash",
      supplier: supplierMap[sp.supplier_agent_id]?.agent_name || "-",
      notes: sp.notes || "",
    });
  });

  moallemPayments.forEach((mp) => {
    if (!inPeriod(mp.date, filters)) return;
    const packageId = resolvePackageId(mp, bookingPackageMap);
    if (!packageId) return;
    const row = ensureRow(packageId);
    if (!row) return;
    const amount = Number(mp.amount || 0);
    row.expenseBreakdown.moallem += amount;
    row.totalExpenses += amount;
    row.moallemPayments.push({
      amount,
      date: mp.date ? format(parseISO(mp.date), "dd MMM yyyy") : "-",
      method: mp.payment_method || "cash",
      moallem: moallemMap[mp.moallem_id]?.name || "-",
      notes: mp.notes || "",
    });
  });

  commissionPayments.forEach((cp) => {
    if (!inPeriod(cp.date, filters)) return;
    const packageId = resolvePackageId(cp, bookingPackageMap);
    if (!packageId) return;
    const row = ensureRow(packageId);
    if (!row) return;
    const amount = Number(cp.amount || 0);
    row.expenseBreakdown.commission += amount;
    row.totalExpenses += amount;
  });

  expenses.forEach((e) => {
    if (!inPeriod(e.date, filters)) return;
    const packageId = resolvePackageId(e, bookingPackageMap);
    if (!packageId) return;
    const row = ensureRow(packageId);
    if (!row) return;
    const amount = Number(e.amount || 0);
    addExpenseAmount(row.expenseBreakdown, e.expense_type || "other", amount);
    row.totalExpenses += amount;
    row.expenseItems.push({
      title: e.title || "-",
      amount,
      date: e.date ? format(parseISO(e.date), "dd MMM yyyy") : "-",
      type: e.expense_type || "other",
      category: e.category || "-",
    });
  });

  rows.forEach((row, packageId) => {
    row.totalCustomers = customerSets.get(packageId)?.size || 0;
    row.grossProfit = row.totalSalesRevenue - row.totalExpenses;
    row.profitMargin = row.totalSalesRevenue > 0 ? (row.grossProfit / row.totalSalesRevenue) * 100 : 0;

    const customerMap: Record<string, { name: string; phone: string; bookings: number; totalPaid: number }> = {};
    row.bookings.forEach((b) => {
      const key = b.phone || b.guestName;
      if (!customerMap[key]) customerMap[key] = { name: b.guestName, phone: b.phone, bookings: 0, totalPaid: 0 };
      customerMap[key].bookings += 1;
      customerMap[key].totalPaid += b.paid;
    });
    row.customers = Object.values(customerMap);
  });

  const q = (filters.searchQuery || "").toLowerCase();
  return Array.from(rows.values())
    .filter((r) => {
      if (!q) return true;
      return r.packageName.toLowerCase().includes(q) || r.packageType.toLowerCase().includes(q);
    })
    .filter((r) => r.totalBookings > 0 || r.totalExpenses > 0)
    .sort((a, b) => b.totalSalesRevenue - a.totalSalesRevenue);
}

export function summarizePackageProfit(rows: PackageProfitRow[]): PackageProfitSummary {
  const totalSales = rows.reduce((s, r) => s + r.totalSalesRevenue, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.totalExpenses, 0);
  const totalProfit = rows.reduce((s, r) => s + r.grossProfit, 0);
  const bestSelling = rows.reduce((best, r) => (!best || r.totalSalesRevenue > best.totalSalesRevenue ? r : best), null as PackageProfitRow | null);
  const mostProfitable = rows.reduce((best, r) => (!best || r.grossProfit > best.grossProfit ? r : best), null as PackageProfitRow | null);
  return {
    totalSales,
    totalExpenses,
    totalProfit,
    bestSellingPackage: bestSelling?.packageName || "—",
    mostProfitablePackage: mostProfitable?.packageName || "—",
  };
}

export function buildMonthlyPackageRows(rows: PackageProfitRow[]) {
  return rows.map((r) => ({
    package: r.packageName,
    type: r.packageType,
    bookings: r.totalBookings,
    revenue: r.totalSalesRevenue,
    expenses: r.totalExpenses,
    profit: r.grossProfit,
    margin: r.profitMargin,
  }));
}

export function getMonthYearInterval(year: number, month: number | "all") {
  if (month === "all") {
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
  }
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0, 23, 59, 59) };
}

export function isDateInMonthYear(dateStr: string | null | undefined, year: number, month: number | "all") {
  if (!dateStr) return false;
  try {
    const d = parseISO(dateStr);
    const interval = getMonthYearInterval(year, month);
    return isWithinInterval(d, interval);
  } catch {
    return false;
  }
}
