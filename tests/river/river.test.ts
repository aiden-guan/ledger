import { describe, expect, it } from "vitest";
import { buildFixDraft } from "@/lib/investigation/drafts";
import { streamForCategory, streamForFinding } from "@/lib/river/streams";

describe("money river streams", () => {
  it("maps ledger categories to river streams", () => {
    expect(streamForCategory("packaging")).toBe("fulfillment");
    expect(streamForCategory("software")).toBe("software");
    expect(streamForCategory("contractors")).toBe("team");
    expect(streamForCategory("insurance")).toBe("overhead");
    expect(streamForCategory(null)).toBe("overhead");
  });

  it("places each finding on the stream it leaks from", () => {
    expect(streamForFinding("MARGIN_EROSION", {})).toBe("cogs");
    expect(streamForFinding("PRICING_OPPORTUNITY", {})).toBe("uncaptured");
    expect(streamForFinding("DUPLICATE_PAYMENT", { stream: "fulfillment" })).toBe("fulfillment");
  });
});

describe("prepared fixes", () => {
  it("drafts a refund request using only engine amounts and dates", () => {
    const draft = buildFixDraft(
      "DUPLICATE_PAYMENT",
      {},
      { vendor: "Summit Packaging Supply", invoiceReference: "INV-20418", refundAmountCents: 105800, paidDates: ["2026-08-29", "2026-09-03"] },
      "Acme Outdoor Co.",
    );
    expect(draft?.kind).toBe("email");
    if (draft?.kind !== "email") return;
    expect(draft.subject).toContain("INV-20418");
    expect(draft.body).toContain("$1,058");
    expect(draft.body).toContain("August 29, 2026");
    expect(draft.body).toContain("September 3, 2026");
    expect(draft.body.match(/\$[\d,]+/g)?.every((m) => m === "$1,058")).toBe(true);
  });

  it("drafts a plan review email for subscription creep", () => {
    const draft = buildFixDraft("SUBSCRIPTION_CREEP", { kind: "PRICE_CREEP" }, { vendor: "Relay Inbox", previousAmountCents: 6900, latestAmountCents: 11900 }, "Acme");
    expect(draft?.kind === "email" && draft.subject).toBe("Our Relay Inbox bill went from $69 to $119 a month");
  });

  it("prepares a price change for pricing findings", () => {
    const draft = buildFixDraft("MARGIN_EROSION", { productName: "Alpine Insulated Bottle 32oz" }, { fromPriceCents: 4900, toPriceCents: 5500, sku: "ALP-BTL-32" }, "Acme");
    expect(draft).toMatchObject({ kind: "price", fromCents: 4900, toCents: 5500, sku: "ALP-BTL-32" });
  });

  it("returns nothing when there is no data to build a fix from", () => {
    expect(buildFixDraft("MARGIN_EROSION", {}, {}, "Acme")).toBeNull();
  });
});
