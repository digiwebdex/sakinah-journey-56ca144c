import { format, getMonth, getYear, parseISO } from "date-fns";

export const SERVICE_CATEGORIES = [
  { key: "hajj", label: "Hajj" },
  { key: "umrah", label: "Umrah" },
  { key: "air_ticket", label: "Air Ticket" },
  { key: "hotel", label: "Hotel" },
  { key: "visa", label: "Visa" },
  { key: "tour", label: "Tour" },
] as const;

export type ServiceKey = (typeof SERVICE_CATEGORIES)[number]["key"];

export interface ServiceExpenseBreakdown {
  supplier: number;
  moallem: number;
  commission: number;
  visa: number;
  airTicket: number;
  hotel: number;
  transport: number;
  guide: number;
  other: number;
}

export interface ServiceProfitRow {
  serviceKey: ServiceKey;
  label: string;
  totalBookings: number;
  totalCustomers: number;
  revenue: number;
  collected: number;
  due: number;
  totalExpenses: number;
  expenseBreakdown: ServiceExpenseBreakdown;
  grossProfit: number;
  profitMargin: number;
  packages: ServicePackageRow[];
}

export interface ServicePackageRow {
  packageId: string;
  packageName: string;
  revenue: number;
  collected: number;
  due: number;
  expenses: number;
  profit: number;
  bookings: number;
}

export interface ServiceProfitFilters {
  month: number | "all";
  year: number;
  serviceKey: string;
  searchQuery?: string;
}

export interface ServiceProfitReportInput {
  packages: any[];
  bookings: any[];
  expenses: any[];
  moallemPayments: any[];
  commissionPayments: any[];
  supplierPayments: any[];
}

export interface ServiceProfitSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  byService: Record<ServiceKey, { revenue: number; expenses: number; profit: number }>;
  bestService: string;
  bestPackage: string;
}

function emptyBreakdown(): ServiceExpenseBreakdown {
  return { supplier: 0, moallem: 0, commission: 0, visa: 0, airTicket: 0, hotel: 0, transport: 0, guide: 0, other: 0 };
}

export function normalizeServiceType(raw: string | null | undefined): ServiceKey | "other" {
  const t = String(raw || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!t || t === "other") return "other";
  if (t.includes("hajj")) return "hajj";
  if (t.includes("umrah")) return "umrah";
  if (t === "ticket" || t === "air_ticket" || t.includes("air") || t.includes("flight")) return "air_ticket";
  if (t.includes("hotel")) return "hotel";
  if (t.includes("visa")) return "visa";
  if (t.includes("tour")) return "tour";
  if (SERVICE_CATEGORIES.some((s) => s.key === t)) return t as ServiceKey;
  return "other";
}

export function expenseTypeToService(expenseType: string | null | undefined): ServiceKey | "other" {
  const t = String(expenseType || "").toLowerCase();
  if (t === "visa") return "visa";
  if (t === "ticket" || t === "air_ticket") return "air_ticket";
  if (t === "hotel") return "hotel";
  if (t === "transport" || t === "guide" || t === "food" || t === "ziyarah") return "tour";
  if (t === "hajj") return "hajj";
  if (t === "umrah") return "umrah";
  return "other";
}

function inPeriod(dateStr: string | null | undefined, filters: ServiceProfitFilters): boolean {
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

function serviceFromPackageId(
  packageId: string | null,
  packageMeta: Map<string, any>
): ServiceKey | "other" {
  if (!packageId) return "other";
  return normalizeServiceType(packageMeta.get(packageId)?.type);
}

function addOperationalExpense(breakdown: ServiceExpenseBreakdown, expenseType: string, amount: number) {
  const t = String(expenseType || "").toLowerCase();
  if (t === "visa") breakdown.visa += amount;
  else if (t === "ticket" || t === "air_ticket") breakdown.airTicket += amount;
  else if (t === "hotel") breakdown.hotel += amount;
  else if (t === "transport") breakdown.transport += amount;
  else if (t === "guide") breakdown.guide += amount;
  else breakdown.other += amount;
}

export function buildServiceProfitReport(
  input: ServiceProfitReportInput,
  filters: ServiceProfitFilters
): ServiceProfitRow[] {
  const { packages, bookings, expenses, moallemPayments, commissionPayments, supplierPayments } = input;

  const packageMeta = new Map(packages.map((p) => [p.id, p]));
  const bookingPackageMap: Record<string, string> = {};
  bookings.forEach((b) => {
    if (b.id && b.package_id) bookingPackageMap[b.id] = b.package_id;
  });

  const rows = new Map<ServiceKey, ServiceProfitRow>();
  const customerSets = new Map<ServiceKey, Set<string>>();
  const packageAcc = new Map<string, ServicePackageRow>();

  const ensureRow = (serviceKey: ServiceKey): ServiceProfitRow | null => {
    if (filters.serviceKey !== "all" && serviceKey !== filters.serviceKey) return null;
    if (!rows.has(serviceKey)) {
      const label = SERVICE_CATEGORIES.find((s) => s.key === serviceKey)?.label || serviceKey;
      rows.set(serviceKey, {
        serviceKey,
        label,
        totalBookings: 0,
        totalCustomers: 0,
        revenue: 0,
        collected: 0,
        due: 0,
        totalExpenses: 0,
        expenseBreakdown: emptyBreakdown(),
        grossProfit: 0,
        profitMargin: 0,
        packages: [],
      });
      customerSets.set(serviceKey, new Set());
    }
    return rows.get(serviceKey)!;
  };

  const ensurePackageAcc = (packageId: string, serviceKey: ServiceKey) => {
    if (!packageAcc.has(packageId)) {
      const pkg = packageMeta.get(packageId);
      packageAcc.set(packageId, {
        packageId,
        packageName: pkg?.name || "-",
        revenue: 0,
        collected: 0,
        due: 0,
        expenses: 0,
        profit: 0,
        bookings: 0,
      });
    }
    return packageAcc.get(packageId)!;
  };

  bookings
    .filter((b) => b.status !== "cancelled" && inPeriod(b.created_at, filters))
    .forEach((b) => {
      const serviceKey = normalizeServiceType(b.packages?.type);
      if (serviceKey === "other") return;
      const row = ensureRow(serviceKey);
      if (!row) return;

      row.totalBookings += 1;
      row.revenue += Number(b.total_amount || 0);
      row.collected += Number(b.paid_amount || 0);
      row.due += Number(b.due_amount || 0);

      const customerKey = b.guest_phone || b.user_id || b.guest_name || b.id;
      customerSets.get(serviceKey)!.add(customerKey);

      if (b.package_id && (serviceKey === "hajj" || serviceKey === "umrah")) {
        const pkgRow = ensurePackageAcc(b.package_id, serviceKey);
        pkgRow.bookings += 1;
        pkgRow.revenue += Number(b.total_amount || 0);
        pkgRow.collected += Number(b.paid_amount || 0);
        pkgRow.due += Number(b.due_amount || 0);
      }
    });

  const addExpense = (serviceKey: ServiceKey | "other", amount: number, kind: keyof ServiceExpenseBreakdown | "operational", expenseType?: string) => {
    if (serviceKey === "other") return;
    const row = ensureRow(serviceKey);
    if (!row) return;
    row.totalExpenses += amount;
    if (kind === "operational") addOperationalExpense(row.expenseBreakdown, expenseType || "other", amount);
    else row.expenseBreakdown[kind] += amount;
  };

  supplierPayments.forEach((sp) => {
    if (!inPeriod(sp.date, filters)) return;
    const packageId = resolvePackageId(sp, bookingPackageMap);
    const serviceKey = serviceFromPackageId(packageId, packageMeta);
    const amount = Number(sp.amount || 0);
    addExpense(serviceKey, amount, "supplier");
    if (packageId && (serviceKey === "hajj" || serviceKey === "umrah")) {
      ensurePackageAcc(packageId, serviceKey).expenses += amount;
    }
  });

  moallemPayments.forEach((mp) => {
    if (!inPeriod(mp.date, filters)) return;
    const packageId = resolvePackageId(mp, bookingPackageMap);
    const serviceKey = serviceFromPackageId(packageId, packageMeta);
    const amount = Number(mp.amount || 0);
    addExpense(serviceKey, amount, "moallem");
    if (packageId && (serviceKey === "hajj" || serviceKey === "umrah")) {
      ensurePackageAcc(packageId, serviceKey).expenses += amount;
    }
  });

  commissionPayments.forEach((cp) => {
    if (!inPeriod(cp.date, filters)) return;
    const packageId = resolvePackageId(cp, bookingPackageMap);
    const serviceKey = serviceFromPackageId(packageId, packageMeta);
    addExpense(serviceKey, Number(cp.amount || 0), "commission");
  });

  expenses.forEach((e) => {
    if (!inPeriod(e.date, filters)) return;
    const amount = Number(e.amount || 0);
    const packageId = resolvePackageId(e, bookingPackageMap);
    let serviceKey = serviceFromPackageId(packageId, packageMeta);
    if (serviceKey === "other") serviceKey = expenseTypeToService(e.expense_type);
    addExpense(serviceKey, amount, "operational", e.expense_type);
    if (packageId && (serviceKey === "hajj" || serviceKey === "umrah")) {
      ensurePackageAcc(packageId, serviceKey).expenses += amount;
    }
  });

  rows.forEach((row, serviceKey) => {
    row.totalCustomers = customerSets.get(serviceKey)?.size || 0;
    row.grossProfit = row.revenue - row.totalExpenses;
    row.profitMargin = row.revenue > 0 ? (row.grossProfit / row.revenue) * 100 : 0;

    if (serviceKey === "hajj" || serviceKey === "umrah") {
      row.packages = Array.from(packageAcc.values())
        .filter((p) => {
          const pkg = packageMeta.get(p.packageId);
          return normalizeServiceType(pkg?.type) === serviceKey;
        })
        .map((p) => ({ ...p, profit: p.revenue - p.expenses }))
        .filter((p) => p.bookings > 0 || p.expenses > 0)
        .sort((a, b) => b.revenue - a.revenue);
    }
  });

  const q = (filters.searchQuery || "").toLowerCase();
  return SERVICE_CATEGORIES.map((s) => rows.get(s.key))
    .filter((r): r is ServiceProfitRow => !!r)
    .filter((r) => r.revenue > 0 || r.totalExpenses > 0)
    .filter((r) => !q || r.label.toLowerCase().includes(q))
    .sort((a, b) => b.revenue - a.revenue);
}

export function summarizeServiceProfit(rows: ServiceProfitRow[]): ServiceProfitSummary {
  const byService = {} as ServiceProfitSummary["byService"];
  SERVICE_CATEGORIES.forEach((s) => {
    byService[s.key] = { revenue: 0, expenses: 0, profit: 0 };
  });

  rows.forEach((r) => {
    byService[r.serviceKey].revenue = r.revenue;
    byService[r.serviceKey].expenses = r.totalExpenses;
    byService[r.serviceKey].profit = r.grossProfit;
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.totalExpenses, 0);
  const best = rows.reduce((b, r) => (!b || r.grossProfit > b.grossProfit ? r : b), null as ServiceProfitRow | null);

  let bestPackage = "—";
  let bestPackageProfit = -Infinity;
  rows.forEach((r) => {
    r.packages.forEach((p) => {
      if (p.profit > bestPackageProfit) {
        bestPackageProfit = p.profit;
        bestPackage = p.packageName;
      }
    });
  });

  return {
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    byService,
    bestService: best?.label || "—",
    bestPackage,
  };
}

export function formatServiceTableRows(rows: ServiceProfitRow[]) {
  return rows.map((r) => ({
    service: r.label,
    revenue: r.revenue,
    expense: r.totalExpenses,
    profit: r.grossProfit,
    margin: r.profitMargin,
    bookings: r.totalBookings,
  }));
}
