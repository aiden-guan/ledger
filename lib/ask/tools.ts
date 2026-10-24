import { z } from "zod";
import type { CashForecast } from "@/lib/finance/forecast";
import { format, type Cents } from "@/lib/finance/money";
import { merchantKey } from "@/lib/finance/merchants";

/*
 * "Ask your books": read-only tools the model calls to answer an owner's question. Every tool
 * computes in code and returns money already formatted, so the model copies figures instead of
 * doing arithmetic. Each record a tool returns carries a ref the answer can cite.
 */

export interface BooksContext {
  organizationName: string;
  transactions: {
    id: string;
    at: number;
    merchantName: string;
    normalizedMerchantName: string;
    amountCents: Cents;
    type: "DEBIT" | "CREDIT";
    category: string | null;
    invoiceReference: string | null;
    payeeAccount: string | null;
    source: string;
  }[];
  findings: {
    id: string;
    findingType: string;
    title: string;
    summary: string;
    monthlyImpactCents: Cents;
    annualImpactCents: Cents;
    confidence: number;
    status: string;
    recoveryKind: string;
    recommendation: { title: string; status: string } | null;
  }[];
  screenings: {
    id: string;
    at: number;
    merchantName: string;
    amountCents: Cents;
    verdict: string;
    score: number;
    status: string;
    signals: { signal: string; detail: string }[];
  }[];
  products: {
    sku: string;
    name: string;
    priceCents: Cents;
    unitCostCents: Cents;
    units30: number;
    revenue30Cents: Cents;
    competitorMedianCents: Cents | null;
  }[];
  forecast: CashForecast | null;
}

export interface Citation {
  ref: string;
  label: string;
  href: string | null;
}

/** Everything the tools have shown the model during one answer. */
export class Registry {
  readonly refs = new Map<string, Citation>();
  readonly figures = new Set<string>();

  cite(ref: string, label: string, href: string | null = null): string {
    if (!this.refs.has(ref)) this.refs.set(ref, { ref, label, href });
    return ref;
  }

  /** Records every dollar figure in a tool result so the answer's figures can be traced. */
  output(value: unknown): string {
    const text = JSON.stringify(value);
    for (const m of text.matchAll(MONEY)) this.figures.add(normalizeMoney(m[0]));
    return text;
  }
}

const MONEY = /-?\$\d[\d,]*(?:\.\d{2})?/g;
const normalizeMoney = (s: string) => s.replace(/[,-]/g, "").replace(/\.00$/, "");
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shortDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export interface BooksTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  run: (input: z.infer<S>) => string;
  /** One line for the live step list. */
  summarize: (input: z.infer<S>, output: string) => string;
}

function tool<S extends z.ZodType>(t: BooksTool<S>): BooksTool<S> {
  return t;
}

export function buildTools(books: BooksContext, registry: Registry) {
  const citeTx = (t: BooksContext["transactions"][number]) =>
    registry.cite(`tx:${t.id}`, `${shortDay(t.at)} · ${t.merchantName} · ${format(t.amountCents)}${t.invoiceReference ? ` · ${t.invoiceReference}` : ""}`);
  const txRow = (t: BooksContext["transactions"][number]) => ({
    ref: citeTx(t),
    date: ymd(t.at),
    merchant: t.merchantName,
    amount: format(t.type === "CREDIT" ? t.amountCents : -t.amountCents),
    category: t.category,
    invoice: t.invoiceReference,
    ...(t.payeeAccount ? { account: `••${t.payeeAccount}` } : {}),
    ...(t.source === "live_feed" ? { arrived: "live feed" } : {}),
  });
  const matches = (t: BooksContext["transactions"][number], merchant: string) => merchantKey(t.normalizedMerchantName).includes(merchantKey(merchant));
  const count = (out: string, key: string) => {
    try {
      return (JSON.parse(out) as Record<string, unknown[]>)[key]?.length ?? 0;
    } catch {
      return 0;
    }
  };

  return [
    tool({
      name: "search_transactions",
      description:
        "Search bank transactions. Filters combine. Returns the matched count, the exact total of all matches, and up to `limit` rows (newest first). Amounts are negative for money out.",
      inputSchema: z.object({
        merchant: z.string().optional().describe("Part of the payee name, e.g. 'summit'"),
        category: z.string().optional().describe("e.g. software, inventory, packaging, marketing, fulfillment, revenue"),
        from: dateString.optional(),
        to: dateString.optional(),
        min_amount_dollars: z.number().optional(),
        type: z.enum(["DEBIT", "CREDIT"]).optional(),
        invoice: z.string().optional(),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      run: (q) => {
        const from = q.from ? Date.parse(`${q.from}T00:00:00Z`) : -Infinity;
        const to = q.to ? Date.parse(`${q.to}T23:59:59Z`) : Infinity;
        const hits = books.transactions
          .filter(
            (t) =>
              (!q.merchant || matches(t, q.merchant)) &&
              (!q.category || t.category === q.category.toLowerCase()) &&
              t.at >= from &&
              t.at <= to &&
              (q.min_amount_dollars === undefined || t.amountCents >= Math.round(q.min_amount_dollars * 100)) &&
              (!q.type || t.type === q.type) &&
              (!q.invoice || t.invoiceReference?.toUpperCase() === q.invoice.toUpperCase()),
          )
          .sort((a, b) => b.at - a.at);
        const out = hits.reduce((s, t) => s + (t.type === "DEBIT" ? t.amountCents : 0), 0);
        const inflow = hits.reduce((s, t) => s + (t.type === "CREDIT" ? t.amountCents : 0), 0);
        return registry.output({ matched: hits.length, total_out: format(out), total_in: format(inflow), rows: hits.slice(0, q.limit ?? 12).map(txRow) });
      },
      summarize: (q, out) => `searched transactions${q.merchant ? ` for "${q.merchant}"` : q.category ? ` in ${q.category}` : ""}, ${count(out, "rows")} shown`,
    }),

    tool({
      name: "vendor_profile",
      description: "Everything paid to one payee: count, total, typical amount, first and last payment, receiving accounts on file and recent invoices.",
      inputSchema: z.object({ merchant: z.string().describe("Part of the payee name") }),
      run: ({ merchant }) => {
        const paid = books.transactions.filter((t) => t.type === "DEBIT" && matches(t, merchant)).sort((a, b) => a.at - b.at);
        if (!paid.length) return registry.output({ found: false });
        const amounts = paid.map((t) => t.amountCents).sort((a, b) => a - b);
        const accounts = [...new Set(paid.map((t) => t.payeeAccount).filter(Boolean))].map((a) => `••${a}`);
        return registry.output({
          found: true,
          payee: paid.at(-1)!.merchantName,
          payments: paid.length,
          total: format(amounts.reduce((s, a) => s + a, 0)),
          typical: format(amounts[Math.floor(amounts.length / 2)]),
          first: ymd(paid[0].at),
          last: ymd(paid.at(-1)!.at),
          accounts_on_file: accounts,
          recent: paid.slice(-4).reverse().map(txRow),
        });
      },
      summarize: ({ merchant }) => `pulled the payment history for "${merchant}"`,
    }),

    tool({
      name: "list_findings",
      description: "Leaks found by the latest investigation, largest first, with recoverable amounts, confidence and whether the owner approved the fix.",
      inputSchema: z.object({}),
      run: () =>
        registry.output({
          findings: books.findings.map((f) => ({
            ref: registry.cite(`finding:${f.id}`, f.title, `/findings/${f.id}`),
            title: f.title,
            summary: f.summary,
            recoverable: f.recoveryKind === "one_time" ? `${format(f.annualImpactCents)} once` : `${format(f.annualImpactCents)} a year (${format(f.monthlyImpactCents)} a month)`,
            confidence: pct(f.confidence),
            fix: f.recommendation ? `${f.recommendation.title} (${f.recommendation.status.toLowerCase().replace(/_/g, " ")})` : null,
          })),
        }),
      summarize: (_q, out) => `read ${count(out, "findings")} findings from the last investigation`,
    }),

    tool({
      name: "live_feed",
      description: "Payments screened as they arrived from the bank feed: verdict, risk score, the signals behind it, and whether autopilot posted, flagged, held or escalated it (or a person released or blocked it).",
      inputSchema: z.object({}),
      run: () =>
        registry.output({
          payments: books.screenings.map((s) => ({
            ref: registry.cite(`screening:${s.id}`, `${s.merchantName} · ${format(s.amountCents)} · ${s.status}`),
            merchant: s.merchantName,
            amount: format(s.amountCents),
            arrived: new Date(s.at).toISOString(),
            risk: s.score.toFixed(2),
            status: s.status,
            signals: s.signals.map((x) => x.detail),
          })),
        }),
      summarize: (_q, out) => `checked ${count(out, "payments")} payments from the live feed`,
    }),

    tool({
      name: "cash_forecast",
      description: "Cash now and over the next 90 days: as things stand, with the fixes already approved, and with every open fix approved. Includes monthly run rates and upcoming fixed charges.",
      inputSchema: z.object({}),
      run: () => {
        const f = books.forecast;
        if (!f) return registry.output({ available: false });
        return registry.output({
          cash_now: format(f.balanceCents),
          in_90_days: { as_is: format(f.end.base), with_approved_fixes: format(f.end.approved), with_all_fixes: format(f.end.potential) },
          lowest_point_as_is: { day: f.low.day, cash: format(f.low.cents) },
          monthly: { money_in: format(f.monthly.inflowCents), variable_spend: format(f.monthly.variableOutflowCents), fixed_charges: format(f.monthly.fixedOutflowCents) },
          next_fixed_charges: f.scheduled.slice(0, 6).map((s) => ({ in_days: s.day, payee: s.name, amount: format(s.amountCents) })),
        });
      },
      summarize: () => "ran the 90-day cash forecast",
    }),

    tool({
      name: "product_economics",
      description: "Per product: selling price, current unit cost, gross margin, units and revenue in the last 30 days, and the median competitor price where known.",
      inputSchema: z.object({ product: z.string().optional().describe("Part of a product name or SKU; omit for all") }),
      run: ({ product }) => {
        const needle = product?.toLowerCase();
        const rows = books.products.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle));
        return registry.output({
          products: rows.map((p) => ({
            sku: p.sku,
            name: p.name,
            price: format(p.priceCents),
            unit_cost: format(p.unitCostCents),
            gross_margin: p.priceCents ? pct((p.priceCents - p.unitCostCents) / p.priceCents) : null,
            units_30d: p.units30,
            revenue_30d: format(p.revenue30Cents),
            competitor_median: p.competitorMedianCents === null ? null : format(p.competitorMedianCents),
          })),
        });
      },
      summarize: ({ product }) => (product ? `looked up the economics of "${product}"` : "pulled product margins"),
    }),

    tool({
      name: "spending_by_category",
      description: "Money out grouped by category between two dates (default: the last 90 days), largest first, with each category's share.",
      inputSchema: z.object({ from: dateString.optional(), to: dateString.optional() }),
      run: (q) => {
        const end = books.transactions.reduce((m, t) => Math.max(m, t.at), 0);
        const from = q.from ? Date.parse(`${q.from}T00:00:00Z`) : end - 90 * 86_400_000;
        const to = q.to ? Date.parse(`${q.to}T23:59:59Z`) : end;
        const totals = new Map<string, number>();
        for (const t of books.transactions) {
          if (t.type !== "DEBIT" || t.at < from || t.at > to) continue;
          const k = t.category ?? "uncategorized";
          totals.set(k, (totals.get(k) ?? 0) + t.amountCents);
        }
        const all = [...totals.values()].reduce((s, v) => s + v, 0);
        return registry.output({
          from: ymd(from),
          to: ymd(to),
          total: format(all),
          categories: [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category, cents]) => ({ category, amount: format(cents), share: all ? pct(cents / all) : "0%" })),
        });
      },
      summarize: () => "totaled spending by category",
    }),
  ];
}

export type BuiltTool = ReturnType<typeof buildTools>[number];

const CITE = /\[((?:tx|finding|screening):[A-Za-z0-9_-]+)\]/g;

/**
 * Turns the model's text into the stored answer: citations to records the tools actually returned
 * are kept and numbered in order of first use, unknown ones are dropped, and every dollar figure
 * is checked against the figures the tools produced.
 */
export function finalizeAnswer(text: string, registry: Registry): { answer: string; citations: Citation[]; figures: { total: number; traced: number } } {
  const order: string[] = [];
  const answer = text
    .replace(CITE, (_m, ref: string) => {
      if (!registry.refs.has(ref)) return "";
      if (!order.includes(ref)) order.push(ref);
      return `[${order.indexOf(ref) + 1}]`;
    })
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const found = [...answer.matchAll(MONEY)].map((m) => normalizeMoney(m[0]));
  return {
    answer,
    citations: order.map((ref) => registry.refs.get(ref)!),
    figures: { total: found.length, traced: found.filter((f) => registry.figures.has(f)).length },
  };
}

export function systemPrompt(organizationName: string, today: string): string {
  return [
    `You answer questions about the books of ${organizationName} for its owner. Today is ${today}.`,
    "Use the tools to look things up; never guess or rely on outside knowledge of this business.",
    "Every dollar figure you write must be copied exactly from a tool result. Do not add, subtract, average or estimate amounts yourself; if you need a total, call a tool that returns it.",
    "After each claim, cite the records behind it with their ref in square brackets, for example [tx:abc123] or [finding:xyz]. Only cite refs that a tool returned.",
    "Answer in one to four plain sentences, leading with the answer. No headings, lists or markdown unless the owner asks for them.",
    "If the books do not contain the answer, say so plainly. LedgerLens never moves money: if asked to act, say what the owner can approve in the app.",
  ].join("\n");
}
