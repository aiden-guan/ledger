import type { Organization } from "@/lib/domain";
import type { LedgerTransaction, ProductRecord, SaleRecord, SupplierCostRecord } from "@/lib/finance/types";

export interface CompetitorListing {
  competitorProductId: string;
  productId: string;
  productSku: string;
  competitorId: string;
  competitorName: string;
  url: string;
  externalName: string;
}

export interface Ledger {
  organization: Organization;
  products: ProductRecord[];
  sales: SaleRecord[];
  supplierCosts: SupplierCostRecord[];
  transactions: LedgerTransaction[];
  listings: CompetitorListing[];
  /** End of the latest day with activity; analysis windows are measured back from here. */
  asOf: Date;
}

/** Ledger as stored: the same records with epoch-millisecond timestamps. */
export interface RawLedger {
  organization: Organization;
  products: (ProductRecord & { active: boolean })[];
  sales: (Omit<SaleRecord, "soldAt"> & { soldAt: number })[];
  supplierCosts: (Omit<SupplierCostRecord, "effectiveDate"> & { effectiveDate: number })[];
  transactions: (Omit<LedgerTransaction, "transactionDate"> & { transactionDate: number })[];
  listings: Omit<CompetitorListing, "productSku">[];
}

/** Converts stored records into the shapes the deterministic finance tools expect. */
export function buildLedger(raw: RawLedger): Ledger {
  const products = raw.products.filter((p) => p.active);
  const skuById = new Map(products.map((p) => [p.id, p.sku]));
  const latestActivity = Math.max(0, ...raw.sales.map((s) => s.soldAt), ...raw.transactions.map((t) => t.transactionDate));
  const asOfDay = latestActivity ? new Date(latestActivity) : new Date();
  const asOf = new Date(Date.UTC(asOfDay.getUTCFullYear(), asOfDay.getUTCMonth(), asOfDay.getUTCDate() + 1) - 1);

  return {
    organization: raw.organization,
    products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, sellingPriceCents: p.sellingPriceCents })),
    sales: raw.sales.map((s) => ({ ...s, soldAt: new Date(s.soldAt) })),
    supplierCosts: raw.supplierCosts.map((c) => ({ ...c, effectiveDate: new Date(c.effectiveDate) })),
    transactions: [...raw.transactions]
      .sort((a, b) => b.transactionDate - a.transactionDate)
      .map((t) => ({ ...t, transactionDate: new Date(t.transactionDate) })),
    listings: raw.listings.filter((l) => skuById.has(l.productId)).map((l) => ({ ...l, productSku: skuById.get(l.productId) ?? "" })),
    asOf,
  };
}
