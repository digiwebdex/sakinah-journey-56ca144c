/**
 * entityPdfGenerator.ts — Moallem, Supplier, Customer Profile PDFs
 * Layout matches booking invoice (addBillToAndMeta, invoice tables, financial summary).
 */
import { CompanyInfo } from "./invoiceGenerator";
import {
  initPdf, addPdfHeader, addPdfFooter, addSectionTitle, addRawTable,
  addSignatureBlock, addBillToAndMeta, addFinancialSummary, addFinancialBox,
  getWatermarkStatus, ensurePageSpace, buildFileName, INVOICE_TABLE,
  fmtDate, fmtAmount,
} from "./pdfCore";
import { getPdfCompanyConfig } from "./pdfCompanyConfig";
import { registerBengaliFont } from "./pdfFontLoader";
import { addPaymentWatermark } from "./pdfQrCode";

const reportDate = () => fmtDate(new Date().toISOString());

function capitalizeStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ── Moallem Profile PDF ──
export interface MoallemPdfData {
  name: string;
  phone?: string | null;
  address?: string | null;
  nid_number?: string | null;
  contract_date?: string | null;
  status: string;
  notes?: string | null;
  bookings: { tracking_id: string; guest_name: string; package_name: string; total: number; paid: number; due: number; status: string; date: string }[];
  moallemPayments: { amount: number; date: string; method: string; notes?: string | null }[];
  commissionPayments: { amount: number; date: string; method: string; notes?: string | null }[];
  summary: { totalBookings: number; totalTravelers: number; totalAmount: number; totalPaid: number; totalDue: number; totalDeposit: number; totalCommission: number; commissionPaid: number; commissionDue: number };
}

export async function generateMoallemPdf(data: MoallemPdfData, _company: CompanyInfo) {
  const { doc, logoBase64, sig, qrDataUrl, cfg } = await initPdf();
  await registerBengaliFont(doc);

  let y = await addPdfHeader(doc, cfg, logoBase64, qrDataUrl);
  addPaymentWatermark(doc, getWatermarkStatus(data.summary.totalPaid, data.summary.totalDue));

  y = addBillToAndMeta(
    doc, y,
    [
      { label: "Name", value: data.name },
      { label: "Phone", value: data.phone || "N/A" },
      { label: "NID", value: data.nid_number || "N/A" },
      { label: "Address", value: data.address || "N/A" },
      { label: "Note", value: data.notes?.trim() || "N/A" },
    ],
    [
      { label: "Report Date", value: reportDate() },
      { label: "Status", value: capitalizeStatus(data.status) },
      { label: "Total Bookings", value: String(data.summary.totalBookings) },
    ],
    { title: "MOALLEM REPORT", leftHeading: "DETAILS" }
  );

  if (data.bookings.length > 0) {
    y = addSectionTitle(doc, y, "BOOKINGS");
    y = addRawTable(doc, {
      startY: y,
      head: ["Tracking ID", "Guest", "Package", "Total (BDT)", "Paid (BDT)", "Due (BDT)", "Status"],
      body: data.bookings.map(b => [
        b.tracking_id, b.guest_name, b.package_name,
        fmtAmount(b.total), fmtAmount(b.paid), fmtAmount(b.due),
        capitalizeStatus(b.status),
      ]),
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "center", cellWidth: 18 },
      },
      ...INVOICE_TABLE,
    });
  }

  if (data.moallemPayments.length > 0) {
    y = ensurePageSpace(doc, y, 30);
    y = addSectionTitle(doc, y, "MOALLEM DEPOSITS");
    y = addRawTable(doc, {
      startY: y,
      head: ["#", "Date", "Method", "Amount (BDT)", "Notes"],
      body: data.moallemPayments.map((p, i) => [
        String(i + 1), fmtDate(p.date),
        (p.method || "Manual").charAt(0).toUpperCase() + (p.method || "manual").slice(1),
        fmtAmount(p.amount), p.notes || "—",
      ]),
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 3: { halign: "right", fontStyle: "bold" } },
      ...INVOICE_TABLE,
    });
  }

  if (data.commissionPayments.length > 0) {
    y = ensurePageSpace(doc, y, 30);
    y = addSectionTitle(doc, y, "COMMISSION PAYMENTS");
    y = addRawTable(doc, {
      startY: y,
      head: ["#", "Date", "Method", "Amount (BDT)", "Notes"],
      body: data.commissionPayments.map((p, i) => [
        String(i + 1), fmtDate(p.date),
        (p.method || "Manual").charAt(0).toUpperCase() + (p.method || "manual").slice(1),
        fmtAmount(p.amount), p.notes || "—",
      ]),
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 3: { halign: "right", fontStyle: "bold" } },
      ...INVOICE_TABLE,
    });
  }

  y = ensurePageSpace(doc, y, 50);
  y = addFinancialSummary(
    doc, y,
    data.summary.totalAmount, 0, data.summary.totalAmount,
    data.summary.totalPaid, data.summary.totalDue
  );

  y = addFinancialBox(doc, y, [
    { label: "Total Deposit", value: `BDT ${fmtAmount(data.summary.totalDeposit)}` },
    { label: "Total Commission", value: `BDT ${fmtAmount(data.summary.totalCommission)}` },
    { label: "Commission Paid", value: `BDT ${fmtAmount(data.summary.commissionPaid)}` },
    { label: "Commission Due", value: `BDT ${fmtAmount(data.summary.commissionDue)}`, bold: true },
  ], { align: "right", width: 95 });

  y = addSignatureBlock(doc, sig, y);
  addPdfFooter(doc, cfg);
  doc.save(buildFileName("Moallem", data.name));
}

// ── Supplier Agent Profile PDF ──
export interface SupplierPdfData {
  agent_name: string;
  company_name?: string | null;
  phone?: string | null;
  address?: string | null;
  status: string;
  notes?: string | null;
  items?: { description: string; quantity: number; unit_price: number; total_amount: number }[];
  bookings: { tracking_id: string; guest_name: string; package_name: string; total: number; cost: number; paid_to_supplier: number; supplier_due: number; status: string }[];
  agentPayments: { amount: number; date: string; method: string; notes?: string | null; category?: string }[];
  contracts?: { contract_amount: number; pilgrim_count: number; total_paid: number; total_due: number; created_at: string }[];
  contractPayments?: { amount: number; payment_date: string; payment_method: string; note?: string | null }[];
  summary: { totalBookings: number; totalTravelers: number; contractedHajji: number; totalPaid: number; totalDue: number; totalBilled: number };
}

export async function generateSupplierPdf(data: SupplierPdfData, _company: CompanyInfo) {
  const { doc, logoBase64, sig, qrDataUrl, cfg } = await initPdf();
  await registerBengaliFont(doc);

  let y = await addPdfHeader(doc, cfg, logoBase64, qrDataUrl);
  addPaymentWatermark(doc, getWatermarkStatus(data.summary.totalPaid, data.summary.totalDue));

  y = addBillToAndMeta(
    doc, y,
    [
      { label: "Name", value: data.agent_name },
      { label: "Phone", value: data.phone || "N/A" },
      { label: "Company", value: data.company_name || "N/A" },
      { label: "Address", value: data.address || "N/A" },
      { label: "Note", value: data.notes?.trim() || "N/A" },
    ],
    [
      { label: "Report Date", value: reportDate() },
      { label: "Status", value: capitalizeStatus(data.status) },
      { label: "Total Bookings", value: String(data.summary.totalBookings) },
    ],
    { title: "SUPPLIER REPORT", leftHeading: "DETAILS" }
  );

  if (data.items && data.items.length > 0) {
    y = addSectionTitle(doc, y, "SERVICE ITEMS");
    const itemsTotal = data.items.reduce((s, i) => s + i.total_amount, 0);
    y = addRawTable(doc, {
      startY: y,
      head: ["#", "Description", "Qty", "Unit Price (BDT)", "Total (BDT)"],
      body: data.items.map((item, i) => [
        String(i + 1), item.description, String(item.quantity),
        fmtAmount(item.unit_price), fmtAmount(item.total_amount),
      ]),
      foot: [["", "", "", "Grand Total", fmtAmount(itemsTotal)]],
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        2: { halign: "center", cellWidth: 15 },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      },
      ...INVOICE_TABLE,
    });
  }

  if (data.bookings.length > 0) {
    y = ensurePageSpace(doc, y, 30);
    y = addSectionTitle(doc, y, "BOOKINGS");
    y = addRawTable(doc, {
      startY: y,
      head: ["Tracking ID", "Guest", "Package", "Cost (BDT)", "Paid (BDT)", "Due (BDT)", "Status"],
      body: data.bookings.map(b => [
        b.tracking_id, b.guest_name, b.package_name,
        fmtAmount(b.cost), fmtAmount(b.paid_to_supplier), fmtAmount(b.supplier_due),
        capitalizeStatus(b.status),
      ]),
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "center", cellWidth: 18 },
      },
      fontSize: 8,
      variant: "invoice",
    });
  }

  if (data.agentPayments.length > 0) {
    y = ensurePageSpace(doc, y, 30);
    y = addSectionTitle(doc, y, "PAYMENT HISTORY");
    y = addRawTable(doc, {
      startY: y,
      head: ["#", "Date", "Category", "Method", "Amount (BDT)", "Notes"],
      body: data.agentPayments.map((p, i) => [
        String(i + 1), fmtDate(p.date), p.category || "Payment",
        (p.method || "Manual").charAt(0).toUpperCase() + (p.method || "manual").slice(1),
        fmtAmount(p.amount), p.notes || "—",
      ]),
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 4: { halign: "right", fontStyle: "bold" } },
      ...INVOICE_TABLE,
    });
  }

  if (data.contracts && data.contracts.length > 0) {
    y = ensurePageSpace(doc, y, 30);
    y = addSectionTitle(doc, y, "CONTRACTS");
    y = addRawTable(doc, {
      startY: y,
      head: ["Date", "Pilgrim Count", "Contract (BDT)", "Paid (BDT)", "Due (BDT)"],
      body: data.contracts.map(c => [
        fmtDate(c.created_at), String(c.pilgrim_count),
        fmtAmount(c.contract_amount), fmtAmount(c.total_paid), fmtAmount(c.total_due),
      ]),
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
      ...INVOICE_TABLE,
    });
  }

  if (data.contractPayments && data.contractPayments.length > 0) {
    y = ensurePageSpace(doc, y, 30);
    y = addSectionTitle(doc, y, "CONTRACT PAYMENTS");
    y = addRawTable(doc, {
      startY: y,
      head: ["#", "Date", "Method", "Amount (BDT)", "Note"],
      body: data.contractPayments.map((p, i) => [
        String(i + 1), fmtDate(p.payment_date),
        (p.payment_method || "Cash").charAt(0).toUpperCase() + (p.payment_method || "cash").slice(1),
        fmtAmount(p.amount), p.note || "—",
      ]),
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 3: { halign: "right", fontStyle: "bold" } },
      ...INVOICE_TABLE,
    });
  }

  y = ensurePageSpace(doc, y, 50);
  y = addFinancialSummary(
    doc, y,
    data.summary.totalBilled, 0, data.summary.totalBilled,
    data.summary.totalPaid, data.summary.totalDue
  );

  y = addSignatureBlock(doc, sig, y);
  addPdfFooter(doc, cfg);
  doc.save(buildFileName("Supplier", data.agent_name));
}

// ── Customer Profile PDF ──
export interface CustomerPdfData {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  passport_number?: string | null;
  nid_number?: string | null;
  address?: string | null;
  notes?: string | null;
  date_of_birth?: string | null;
  emergency_contact?: string | null;
  bookings: { tracking_id: string; package_name: string; total: number; paid: number; due: number; status: string; date: string }[];
  payments: { amount: number; date: string; method: string; status: string; installment: number | null; tracking_id: string }[];
  summary: { totalBookings: number; totalAmount: number; totalPaid: number; totalDue: number; totalExpenses: number; profit: number };
}

export async function generateCustomerPdf(data: CustomerPdfData, _company: CompanyInfo) {
  const { doc, logoBase64, sig, qrDataUrl, cfg } = await initPdf();
  await registerBengaliFont(doc);

  let y = await addPdfHeader(doc, cfg, logoBase64, qrDataUrl);
  addPaymentWatermark(doc, getWatermarkStatus(data.summary.totalPaid, data.summary.totalDue));

  y = addBillToAndMeta(
    doc, y,
    [
      { label: "Name", value: data.full_name || "N/A" },
      { label: "Phone", value: data.phone || "N/A" },
      { label: "Passport", value: data.passport_number || "N/A" },
      { label: "Address", value: data.address || "N/A" },
      { label: "Note", value: data.notes?.trim() || "N/A" },
    ],
    [
      { label: "Report Date", value: reportDate() },
      { label: "Total Bookings", value: String(data.summary.totalBookings) },
    ],
    { title: "CUSTOMER REPORT" }
  );

  if (data.bookings.length > 0) {
    y = addSectionTitle(doc, y, "BOOKINGS");
    y = addRawTable(doc, {
      startY: y,
      head: ["Tracking ID", "Package", "Date", "Total (BDT)", "Paid (BDT)", "Due (BDT)", "Status"],
      body: data.bookings.map(b => [
        b.tracking_id, b.package_name, fmtDate(b.date),
        fmtAmount(b.total), fmtAmount(b.paid), fmtAmount(b.due),
        capitalizeStatus(b.status),
      ]),
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "center", cellWidth: 18 },
      },
      ...INVOICE_TABLE,
    });
  }

  if (data.payments.length > 0) {
    y = ensurePageSpace(doc, y, 30);
    y = addSectionTitle(doc, y, "PAYMENT HISTORY");
    y = addRawTable(doc, {
      startY: y,
      head: ["#", "Date", "Booking ID", "Method", "Amount (BDT)", "Status"],
      body: data.payments.map((p, i) => [
        String(p.installment ?? i + 1), fmtDate(p.date), p.tracking_id,
        (p.method || "Manual").charAt(0).toUpperCase() + (p.method || "manual").slice(1),
        fmtAmount(p.amount), capitalizeStatus(p.status),
      ]),
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        4: { halign: "right", fontStyle: "bold" },
        5: { halign: "center", cellWidth: 18 },
      },
      didParseCell: (cellData: any) => {
        if (cellData.section === "body" && cellData.column.index === 5) {
          if (cellData.cell.raw === "Completed" || cellData.cell.raw === "Paid") {
            cellData.cell.styles.textColor = [34, 139, 34];
            cellData.cell.styles.fontStyle = "bold";
          } else if (cellData.cell.raw === "Pending") {
            cellData.cell.styles.textColor = [210, 140, 20];
            cellData.cell.styles.fontStyle = "bold";
          }
        }
      },
      ...INVOICE_TABLE,
    });
  }

  y = ensurePageSpace(doc, y, 50);
  y = addFinancialSummary(
    doc, y,
    data.summary.totalAmount, 0, data.summary.totalAmount,
    data.summary.totalPaid, data.summary.totalDue
  );

  y = addSignatureBlock(doc, sig, y);
  addPdfFooter(doc, cfg);
  doc.save(buildFileName("Customer", data.full_name || "Unknown"));
}

// ── Get company info from CMS ──
export async function getCompanyInfoForPdf(): Promise<CompanyInfo> {
  const cfg = await getPdfCompanyConfig();
  return {
    name: cfg.company_name,
    phone: cfg.phone,
    email: cfg.email,
    address: cfg.address,
  };
}
