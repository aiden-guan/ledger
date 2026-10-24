import type { RecommendationRecord } from "@/lib/domain";
import { format } from "@/lib/finance/money";

/**
 * Deterministic execution checklist for an approved recommendation. LedgerLens never executes
 * these itself: no payments, price changes, cancellations or vendor emails.
 */
export function buildExecutionChecklist(rec: RecommendationRecord): string[] {
  const m = rec.metadata;
  const money = (v: unknown) => (typeof v === "number" ? format(v) : "");
  switch (rec.actionType) {
    case "REVIEW_PAYMENT":
      return [
        `Pull both payment confirmations${m.invoiceReference ? ` for ${m.invoiceReference}` : ""} from the bank and vendor portal.`,
        `Email ${m.vendor ?? "the vendor"} requesting a refund of ${money(m.refundAmountCents)} or a credit on the next invoice.`,
        "Record the refund or credit in the books when it arrives.",
        "Disable duplicate payment paths (for example, portal autopay plus ACH) for this vendor.",
      ];
    case "CHANGE_PRICE":
      return [
        `Update ${m.sku ?? "the product"} from ${money(m.fromPriceCents)} to ${money(m.toPriceCents)} in the storefront.`,
        "Update any marketplace listings and ad copy that show the old price.",
        "Watch conversion rate and units sold for 14 days against the prior 14 days.",
        "Re-run LedgerLens after two weeks to confirm margin recovery.",
      ];
    case "CONTACT_VENDOR":
      return [
        `Request an itemized explanation of the cost change from ${m.supplier ?? m.vendor ?? "the vendor"}.`,
        "Collect at least two alternative supplier quotes.",
        "Negotiate a rollback or volume discount; record the agreed unit cost.",
      ];
    case "REVIEW_SUBSCRIPTION":
      return [
        `Log in to ${m.vendor ?? "the vendor"} and confirm the current plan and what changed.`,
        "Check seat or usage levels against the lower tier's limits.",
        `If the higher tier is not needed, request a downgrade${m.previousAmountCents ? ` back to the ${money(m.previousAmountCents)} plan` : ""}.`,
        "Confirm the next charge reflects the change.",
      ];
    default:
      return ["Assign an owner to investigate this finding.", "Document the outcome in LedgerLens."];
  }
}
