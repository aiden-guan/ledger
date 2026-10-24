import type { Cents } from "./money";

/** Plain data shapes consumed by the deterministic finance tools. */

export interface LedgerTransaction {
  id: string;
  transactionDate: Date;
  merchantName: string;
  normalizedMerchantName: string;
  amountCents: Cents;
  transactionType: "DEBIT" | "CREDIT";
  category: string | null;
  invoiceReference: string | null;
}

export interface ProductRecord {
  id: string;
  sku: string;
  name: string;
  sellingPriceCents: Cents;
}

export interface SaleRecord {
  productId: string;
  soldAt: Date;
  quantity: number;
  unitPriceCents: Cents;
  grossRevenueCents: Cents;
}

export interface SupplierCostRecord {
  productId: string;
  supplierName: string;
  effectiveDate: Date;
  unitCostCents: Cents;
  source: string;
}

export interface PriceObservation {
  productId: string;
  competitorId: string;
  competitorName: string;
  priceCents: Cents;
  currency: string;
  productUrl: string;
  capturedAt: Date;
  availability: string | null;
  captureMode: "live" | "fixture";
  apifyRunId: string | null;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / DAY_MS;
}
