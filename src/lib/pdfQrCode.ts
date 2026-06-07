import QRCode from "qrcode";
import jsPDF from "jspdf";

const TRACKING_BASE_URL = "https://manasiktravelhub.com/verify";

/**
 * Generate a QR code data URL for a booking tracking ID.
 */
export async function generateTrackingQr(trackingId: string): Promise<string> {
  const url = `${TRACKING_BASE_URL}?id=${encodeURIComponent(trackingId)}`;
  return QRCode.toDataURL(url, {
    width: 200,
    margin: 1,
    color: { dark: "#231F20", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });
}

/**
 * Generate a verification ID from a tracking ID.
 * Format: INV-YYYY-NNNNN
 */
export function generateVerificationId(trackingId: string): string {
  const year = new Date().getFullYear();
  // Create a numeric hash from tracking ID
  let hash = 0;
  for (let i = 0; i < trackingId.length; i++) {
    hash = ((hash << 5) - hash + trackingId.charCodeAt(i)) | 0;
  }
  const num = String(Math.abs(hash) % 100000).padStart(5, "0");
  return `INV-${year}-${num}`;
}

/**
 * Add QR verification stamp to a jsPDF document.
 * Includes QR code, checkmark badge, "Verified Booking", verification ID, and "Scan to Verify" text.
 */
export function addQrToDoc(
  doc: jsPDF,
  qrDataUrl: string,
  options?: { x?: number; y?: number; size?: number; trackingId?: string; position?: "top" | "bottom" | "left" }
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const size = options?.size ?? 38;
  const position = options?.position ?? "bottom";

  let x = options?.x ?? pageWidth - size - 14;  // Default to right side
  let y = options?.y ?? 12;  // Default to top

  if (position === "bottom") {
    x = pageWidth - 14 - size;
    y = pageHeight - size - 32;
  } else if (position === "top") {
    x = pageWidth - 14 - size;
    y = 10;
  }
  // position === "left" uses left side
  if (position === "left") {
    x = options?.x ?? 10;
    y = options?.y ?? 12;
  }

  try {
    // Plain QR code only, no border or decorations
    doc.addImage(qrDataUrl, "PNG", x, y, size, size);
  } catch {
    /* QR generation failed silently */
  }
}

/**
 * Payment status watermark types.
 */
export type WatermarkStatus = "paid" | "partial" | "due";

/**
 * Determine watermark status from payment amounts.
 */
export function getWatermarkStatus(paidAmount: number, dueAmount: number): WatermarkStatus {
  if (dueAmount <= 0) return "paid";
  if (paidAmount > 0 && dueAmount > 0) return "partial";
  return "due";
}

/**
 * Add a large diagonal payment status watermark to the PDF background.
 * Call this AFTER header but BEFORE content for proper layering.
 */
export function addPaymentWatermark(doc: jsPDF, status: WatermarkStatus) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const config: Record<WatermarkStatus, { text: string; r: number; g: number; b: number }> = {
    paid: { text: "PAID", r: 34, g: 139, b: 34 },
    partial: { text: "PARTIAL", r: 210, g: 140, b: 20 },
    due: { text: "DUE", r: 200, g: 40, b: 40 },
  };

  const { text, r, g, b } = config[status];

  // Save current state
  const prevR = (doc as any).__textColor?.r ?? 0;
  const prevG = (doc as any).__textColor?.g ?? 0;
  const prevB = (doc as any).__textColor?.b ?? 0;

  doc.saveGraphicsState();

  // Set transparency via GState
  const gState = new (doc as any).GState({ opacity: 0.08 });
  doc.setGState(gState);

  doc.setTextColor(r, g, b);
  doc.setFontSize(72);
  doc.setFont("helvetica", "bold");

  // Center + rotate
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  doc.text(text, centerX, centerY, {
    align: "center",
    angle: 35,
  });

  doc.restoreGraphicsState();
  doc.setTextColor(0);
}
