/**
 * Where each dollar of revenue goes. Shared by the dashboard query that measures the flows and
 * the engine that tags each finding with the stream it drains, so it must stay pure.
 */
export const STREAMS = [
  { key: "cogs", label: "Product costs" },
  { key: "fulfillment", label: "Shipping & packaging" },
  { key: "team", label: "Team & contractors" },
  { key: "marketing", label: "Marketing" },
  { key: "software", label: "Software" },
  { key: "overhead", label: "Overhead" },
  { key: "profit", label: "Profit" },
] as const;

export type StreamKey = (typeof STREAMS)[number]["key"];
/** "uncaptured" is revenue the business could be earning but is not (a pricing gap). */
export type LeakStream = Exclude<StreamKey, "profit"> | "uncaptured";

const CATEGORY_STREAM: Record<string, Exclude<StreamKey, "cogs" | "profit">> = {
  packaging: "fulfillment",
  fulfillment: "fulfillment",
  shipping: "fulfillment",
  contractors: "team",
  payroll: "team",
  marketing: "marketing",
  advertising: "marketing",
  software: "software",
  subscriptions: "software",
};

/** Operating-expense stream for a ledger category. Inventory is excluded by the caller (it is COGS). */
export function streamForCategory(category: string | null | undefined): Exclude<StreamKey, "cogs" | "profit"> {
  return (category && CATEGORY_STREAM[category]) || "overhead";
}

export function streamForFinding(findingType: string, metadata: Record<string, unknown>): LeakStream {
  if (typeof metadata.stream === "string") return metadata.stream as LeakStream;
  if (findingType === "MARGIN_EROSION") return "cogs";
  if (findingType === "PRICING_OPPORTUNITY") return "uncaptured";
  if (findingType === "SUBSCRIPTION_CREEP") return "software";
  return "overhead";
}
