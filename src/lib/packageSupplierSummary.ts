/**
 * Package-wise supplier settlement.
 *
 * A supplier is contracted per package (package_supplier_contracts), not per
 * pilgrim booking. This module answers, for one package:
 *   - how much the suppliers are owed in total (the agreed contract)
 *   - how much has actually been paid to them so far
 *   - how much is still outstanding
 *   - how many pilgrims are still unpaid on the supplier side
 *   - how many pilgrims still owe us money on the customer side
 *   - the resulting profit, or loss when the costs exceed the revenue
 */

export interface PackageSupplierContract {
  id: string;
  package_id: string;
  supplier_agent_id: string;
  contract_amount: number | string | null;
  contracted_pax: number | null;
  notes?: string | null;
}

export interface SupplierLine {
  supplierId: string;
  supplierName: string;
  contractAmount: number;
  contractedPax: number;
  paid: number;
  due: number;
  /** Pilgrims still unpaid on this contract, derived from the per-pax rate. */
  unpaidPax: number;
  paymentCount: number;
}

export interface PackageSupplierRow {
  packageId: string;
  packageName: string;
  packageType: string;

  contractTotal: number;
  paidTotal: number;
  dueTotal: number;
  contractedPax: number;
  supplierUnpaidPax: number;
  suppliers: SupplierLine[];

  bookedPax: number;
  customerDuePax: number;
  customerDueBookings: number;
  customerDueAmount: number;

  salesRevenue: number;
  collected: number;
  otherExpenses: number;
  totalCost: number;
  profit: number;
  isLoss: boolean;
  margin: number;
}

const num = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pilgrims a payment run still has not covered. The contract buys `contractedPax`
 * pilgrims for `contractAmount`, so the per-pax rate turns an outstanding balance
 * back into a headcount. Without a pax figure there is no rate, so fall back to
 * the package's booked pilgrims while anything is owed.
 */
export function unpaidPaxFor(contractAmount: number, contractedPax: number, due: number, fallbackPax = 0): number {
  if (due <= 0) return 0;
  if (contractedPax > 0 && contractAmount > 0) {
    const perPax = contractAmount / contractedPax;
    if (perPax > 0) return Math.min(contractedPax, Math.ceil(due / perPax));
    return contractedPax;
  }
  return fallbackPax;
}

export interface BuildInput {
  packages: any[];
  contracts: PackageSupplierContract[];
  supplierPayments: any[];
  bookings: any[];
  supplierMap: Record<string, any>;
  /** Rows from buildPackageProfitReport, for revenue and non-supplier costs. */
  profitRows?: Array<{
    packageId: string;
    totalSalesRevenue: number;
    totalCollected: number;
    totalExpenses: number;
    expenseBreakdown: { supplier: number };
  }>;
}

export function buildPackageSupplierRows(input: BuildInput): PackageSupplierRow[] {
  const { packages, contracts, supplierPayments, bookings, supplierMap, profitRows = [] } = input;

  const profitByPackage: Record<string, any> = {};
  profitRows.forEach((r) => { profitByPackage[r.packageId] = r; });

  // Payments only count against a package when they were booked against it.
  const paidByPkgSupplier: Record<string, { amount: number; count: number }> = {};
  const paidByPkg: Record<string, number> = {};
  supplierPayments.forEach((p) => {
    if (!p?.package_id) return;
    const amount = num(p.amount);
    const key = `${p.package_id}::${p.supplier_agent_id}`;
    if (!paidByPkgSupplier[key]) paidByPkgSupplier[key] = { amount: 0, count: 0 };
    paidByPkgSupplier[key].amount += amount;
    paidByPkgSupplier[key].count += 1;
    paidByPkg[p.package_id] = (paidByPkg[p.package_id] || 0) + amount;
  });

  const contractsByPkg: Record<string, PackageSupplierContract[]> = {};
  contracts.forEach((c) => {
    if (!c?.package_id) return;
    (contractsByPkg[c.package_id] = contractsByPkg[c.package_id] || []).push(c);
  });

  const bookingsByPkg: Record<string, any[]> = {};
  bookings.forEach((b) => {
    if (!b?.package_id) return;
    (bookingsByPkg[b.package_id] = bookingsByPkg[b.package_id] || []).push(b);
  });

  return packages.map((pkg) => {
    const pkgId = pkg.id;
    const pkgContracts = contractsByPkg[pkgId] || [];
    const pkgBookings = bookingsByPkg[pkgId] || [];

    let bookedPax = 0, customerDuePax = 0, customerDueBookings = 0, customerDueAmount = 0;
    pkgBookings.forEach((b) => {
      const pax = Math.max(1, num(b.num_travelers) || 1);
      bookedPax += pax;
      const due = num(b.due_amount);
      if (due > 0) {
        customerDuePax += pax;
        customerDueBookings += 1;
        customerDueAmount += due;
      }
    });

    const suppliers: SupplierLine[] = pkgContracts.map((c) => {
      const contractAmount = num(c.contract_amount);
      const contractedPax = num(c.contracted_pax);
      const paidEntry = paidByPkgSupplier[`${pkgId}::${c.supplier_agent_id}`] || { amount: 0, count: 0 };
      const paid = paidEntry.amount;
      const due = contractAmount - paid;
      return {
        supplierId: c.supplier_agent_id,
        supplierName: supplierMap[c.supplier_agent_id]?.agent_name || "Unknown supplier",
        contractAmount,
        contractedPax,
        paid,
        due,
        unpaidPax: unpaidPaxFor(contractAmount, contractedPax, due, due > 0 ? bookedPax : 0),
        paymentCount: paidEntry.count,
      };
    }).sort((a, b) => b.contractAmount - a.contractAmount);

    const contractTotal = suppliers.reduce((s, x) => s + x.contractAmount, 0);
    const contractedPax = suppliers.reduce((s, x) => s + x.contractedPax, 0);
    const supplierUnpaidPax = suppliers.reduce((s, x) => s + x.unpaidPax, 0);

    // Payments made against this package but with no contract row still count as
    // paid, otherwise money would silently vanish from the settlement.
    const paidTotal = paidByPkg[pkgId] || 0;
    const dueTotal = contractTotal - paidTotal;

    const profitSource = profitByPackage[pkgId];
    const salesRevenue = num(profitSource?.totalSalesRevenue);
    const collected = num(profitSource?.totalCollected);
    // Swap the supplier component: what was actually paid out is replaced by the
    // full agreed contract, so an unpaid supplier cannot look like profit.
    const otherExpenses = Math.max(0, num(profitSource?.totalExpenses) - num(profitSource?.expenseBreakdown?.supplier));
    const totalCost = otherExpenses + contractTotal;
    const profit = salesRevenue - totalCost;

    return {
      packageId: pkgId,
      packageName: pkg.name || "Unnamed package",
      packageType: pkg.type || "-",
      contractTotal,
      paidTotal,
      dueTotal,
      contractedPax,
      supplierUnpaidPax,
      suppliers,
      bookedPax,
      customerDuePax,
      customerDueBookings,
      customerDueAmount,
      salesRevenue,
      collected,
      otherExpenses,
      totalCost,
      profit,
      isLoss: profit < 0,
      margin: salesRevenue > 0 ? (profit / salesRevenue) * 100 : 0,
    };
  });
}

export function summarizePackageSupplier(rows: PackageSupplierRow[]) {
  return rows.reduce(
    (acc, r) => ({
      contractTotal: acc.contractTotal + r.contractTotal,
      paidTotal: acc.paidTotal + r.paidTotal,
      dueTotal: acc.dueTotal + r.dueTotal,
      supplierUnpaidPax: acc.supplierUnpaidPax + r.supplierUnpaidPax,
      customerDuePax: acc.customerDuePax + r.customerDuePax,
      customerDueAmount: acc.customerDueAmount + r.customerDueAmount,
      salesRevenue: acc.salesRevenue + r.salesRevenue,
      profit: acc.profit + r.profit,
    }),
    { contractTotal: 0, paidTotal: 0, dueTotal: 0, supplierUnpaidPax: 0, customerDuePax: 0, customerDueAmount: 0, salesRevenue: 0, profit: 0 }
  );
}
