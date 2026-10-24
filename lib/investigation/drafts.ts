import { format } from "@/lib/finance/money";

/**
 * The fix LedgerLens prepares for each finding. Drafts are built from the deterministic
 * finding data only, so every amount in them is one the engine calculated. LedgerLens never
 * sends or applies them; the owner does, after approving.
 */
export type FixDraft =
  | { kind: "email"; to: string; subject: string; body: string }
  | { kind: "price"; sku: string; productName: string; fromCents: number; toCents: number; note: string };

const money = (cents: unknown) => format(Number(cents), { compact: false });

function dateLabel(iso: unknown) {
  if (typeof iso !== "string") return "an earlier date";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function buildFixDraft(
  findingType: string,
  finding: Record<string, unknown>,
  recommendation: Record<string, unknown>,
  organizationName: string,
): FixDraft | null {
  if (findingType === "DUPLICATE_PAYMENT") {
    const vendor = String(recommendation.vendor ?? finding.vendor ?? "your vendor");
    const invoice = (recommendation.invoiceReference ?? finding.invoiceReference) as string | null;
    const amount = money(recommendation.refundAmountCents);
    const [first, second] = (recommendation.paidDates ?? finding.paidDates ?? []) as string[];
    return {
      kind: "email",
      to: `${vendor}, accounts receivable`,
      subject: `Refund request: duplicate payment${invoice ? ` for invoice ${invoice}` : ""}`,
      body: [
        `Hi ${vendor} team,`,
        "",
        `Our records show ${invoice ? `invoice ${invoice}` : "one of your invoices"} was paid twice: once on ${dateLabel(first)} and again on ${dateLabel(second)}, ${amount} each.`,
        "",
        `Could you refund the duplicate ${amount} payment, or confirm it as a credit on our account? I'm happy to send both payment confirmations if that helps.`,
        "",
        "Thank you,",
        organizationName,
      ].join("\n"),
    };
  }

  if (findingType === "SUBSCRIPTION_CREEP") {
    const vendor = String(recommendation.vendor ?? finding.vendor ?? "the vendor");
    const before = money(recommendation.previousAmountCents);
    const after = money(recommendation.latestAmountCents);
    if (finding.kind === "POSSIBLE_DUPLICATE_SUBSCRIPTION") {
      return {
        kind: "email",
        to: `${vendor} billing`,
        subject: `Two ${vendor} subscriptions on our account`,
        body: [
          `Hi ${vendor} team,`,
          "",
          `We're being billed for two separate monthly ${vendor} subscriptions (${before} and ${after}). We only need one. Could you confirm which accounts these are and help us consolidate them?`,
          "",
          "Thank you,",
          organizationName,
        ].join("\n"),
      };
    }
    return {
      kind: "email",
      to: `${vendor} billing`,
      subject: `Our ${vendor} bill went from ${before} to ${after} a month`,
      body: [
        `Hi ${vendor} team,`,
        "",
        `Our monthly ${vendor} charge rose from ${before} to ${after}, and we didn't intend to change plans. Could you tell us what changed, and move us back to the ${before} plan or the closest plan that fits our usage?`,
        "",
        "If an annual or loyalty rate is available, we'd like to hear about it as well.",
        "",
        "Thank you,",
        organizationName,
      ].join("\n"),
    };
  }

  if (findingType === "MARGIN_EROSION" || findingType === "PRICING_OPPORTUNITY") {
    if (typeof recommendation.toPriceCents === "number" && typeof recommendation.fromPriceCents === "number") {
      return {
        kind: "price",
        sku: String(recommendation.sku ?? finding.sku ?? ""),
        productName: String(finding.productName ?? recommendation.sku ?? "Product"),
        fromCents: recommendation.fromPriceCents,
        toCents: recommendation.toPriceCents,
        note: "Still priced below every competitor LedgerLens checked.",
      };
    }
    if (findingType === "MARGIN_EROSION" && typeof recommendation.targetUnitCostCents === "number") {
      const supplier = String(recommendation.supplier ?? finding.supplier ?? "your supplier");
      const product = String(finding.productName ?? recommendation.sku ?? "this product");
      return {
        kind: "email",
        to: `${supplier}, sales`,
        subject: `Unit cost for ${product}`,
        body: [
          `Hi ${supplier} team,`,
          "",
          `Our unit cost for ${product} recently increased. We'd like to discuss returning to ${money(recommendation.targetUnitCostCents)} per unit, for example with a larger order or a longer commitment.`,
          "",
          "Thank you,",
          organizationName,
        ].join("\n"),
      };
    }
  }
  return null;
}
