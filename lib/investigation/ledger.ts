import { and, eq, inArray, desc } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
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
  organization: schema.Organization;
  products: ProductRecord[];
  sales: SaleRecord[];
  supplierCosts: SupplierCostRecord[];
  transactions: LedgerTransaction[];
  listings: CompetitorListing[];
  /** End of the latest day with activity; analysis windows are measured back from here. */
  asOf: Date;
}

export async function loadLedger(db: Database, organizationId: string): Promise<Ledger> {
  const [organization] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId));
  if (!organization) throw new Error(`Organization ${organizationId} not found`);

  const [productRows, salesRows, costRows, txRows] = await Promise.all([
    db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.organizationId, organizationId), eq(schema.products.active, true))),
    db.select().from(schema.sales).where(eq(schema.sales.organizationId, organizationId)),
    db.select().from(schema.supplierCosts).where(eq(schema.supplierCosts.organizationId, organizationId)),
    db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.organizationId, organizationId))
      .orderBy(desc(schema.transactions.transactionDate)),
  ]);

  const productIds = productRows.map((p) => p.id);
  const listingRows = productIds.length
    ? await db
        .select({
          competitorProductId: schema.competitorProducts.id,
          productId: schema.competitorProducts.productId,
          competitorId: schema.competitorProducts.competitorId,
          url: schema.competitorProducts.productUrl,
          externalName: schema.competitorProducts.externalName,
          competitorName: schema.competitors.name,
        })
        .from(schema.competitorProducts)
        .innerJoin(schema.competitors, eq(schema.competitors.id, schema.competitorProducts.competitorId))
        .where(inArray(schema.competitorProducts.productId, productIds))
    : [];

  const skuById = new Map(productRows.map((p) => [p.id, p.sku]));
  const latestActivity = Math.max(
    0,
    ...salesRows.map((s) => s.soldAt.getTime()),
    ...txRows.map((t) => t.transactionDate.getTime()),
  );
  const asOfDay = latestActivity ? new Date(latestActivity) : new Date();
  const asOf = new Date(Date.UTC(asOfDay.getUTCFullYear(), asOfDay.getUTCMonth(), asOfDay.getUTCDate() + 1) - 1);

  return {
    organization,
    products: productRows.map((p) => ({ id: p.id, sku: p.sku, name: p.name, sellingPriceCents: p.sellingPriceCents })),
    sales: salesRows.map((s) => ({
      productId: s.productId,
      soldAt: s.soldAt,
      quantity: s.quantity,
      unitPriceCents: s.unitPriceCents,
      grossRevenueCents: s.grossRevenueCents,
    })),
    supplierCosts: costRows.map((c) => ({
      productId: c.productId,
      supplierName: c.supplierName,
      effectiveDate: c.effectiveDate,
      unitCostCents: c.unitCostCents,
      source: c.source,
    })),
    transactions: txRows.map((t) => ({
      id: t.id,
      transactionDate: t.transactionDate,
      merchantName: t.merchantName,
      normalizedMerchantName: t.normalizedMerchantName,
      amountCents: t.amountCents,
      transactionType: t.transactionType,
      category: t.category,
      invoiceReference: t.invoiceReference,
    })),
    listings: listingRows.map((l) => ({ ...l, productSku: skuById.get(l.productId) ?? "" })),
    asOf,
  };
}
