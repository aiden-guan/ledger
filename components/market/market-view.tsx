"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useMutation,
  usePreloadedQuery,
  useQuery,
  type Preloaded,
} from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/layout/app-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfitRiver } from "@/components/market/profit-river";
import {
  RETAIL_SOURCES,
  apifyDatasetUrl,
  apifyRunUrl,
} from "@/lib/apify/retail-sources";
import { format } from "@/lib/finance/money";
import { formatDateTime } from "@/lib/ui/labels";
import type { MarketCheckData } from "@/lib/views/market";
import type { RiverData } from "@/lib/views/dashboard";
import { cn } from "@/lib/utils/cn";

export function MarketView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.market.get>;
}) {
  const data = usePreloadedQuery(preloaded);
  const dashboard = useQuery(api.dashboard.get, {});
  return data ? (
    <MarketContent data={data} river={dashboard?.river} />
  ) : (
    <>
      <AppHeader demoMode={false} />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="display text-4xl">Start with a business.</h1>
        <Link href="/overview" className="mt-6 inline-block underline">
          Load the sample company →
        </Link>
      </main>
    </>
  );
}

export function MarketContent({
  data,
  river,
}: {
  data: MarketCheckData;
  river?: RiverData;
}) {
  const start = useMutation(api.market.start);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const riverRef = useRef<HTMLElement>(null);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const abandoned = Boolean(
    data.latest &&
      clock > 0 &&
      clock - new Date(data.latest.startedAt).getTime() > 10 * 60_000,
  );
  const active = Boolean(
    data.latest &&
      !["COMPLETED", "FAILED"].includes(data.latest.status) &&
      !abandoned,
  );
  const busy = active || starting;
  const opp = data.opportunity;
  const runUrl = data.capture ? apifyRunUrl(data.capture.runId) : null;
  const datasetUrl = data.capture?.datasetId
    ? apifyDatasetUrl(data.capture.datasetId)
    : null;
  const maxPrice = Math.max(
    data.product?.priceCents ?? 1,
    ...data.quotes.map((q) => q.priceCents),
  );

  async function refresh() {
    setError(null);
    setStarting(true);
    setPreview(false);
    try {
      await start({});
    } catch (e) {
      setError(
        e instanceof ConvexError
          ? String(
              (e.data as { message?: string }).message ??
                "Could not start the market check.",
            )
          : "Could not start the market check. Try again.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(
        [
          "Sponsor tooling: Apify",
          `Actor ID: ${data.actorId ?? "Not connected"}`,
          "LedgerLens uses a custom Apify Actor to crawl real retailer product pages, extract prices, currency and availability, and store source-linked observations in a dataset. A deterministic finance engine combines the observations with sample sales and costs to prepare pricing tests for owner approval.",
          runUrl
            ? `Evidence run: ${runUrl}`
            : "No completed real market capture yet.",
          datasetUrl ? `Dataset: ${datasetUrl}` : "",
          "Business financials are synthetic. Retailer quotes are actual captures. Profit uplift is projected at unchanged unit sales.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
      setCopied(true);
    } catch {
      setError(
        "Clipboard access is unavailable. The Actor and run details are shown below.",
      );
    }
  }

  return (
    <>
      <AppHeader
        organizationName={data.organization.name}
        demoMode={data.organization.demoMode}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <section className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="label flex flex-wrap items-center gap-3">
              market check{" "}
              <span className="text-signal">collected with Apify</span>
            </p>
            <h1 className="display mt-5 max-w-2xl text-[clamp(2.25rem,5vw,4rem)] font-medium leading-[1.04] tracking-[-0.035em]">
              {opp ? (
                <>
                  <span className="text-signal">{format(opp.annualCents)}</span>{" "}
                  a year,
                  <br />
                  if sales hold.
                </>
              ) : (
                <>
                  Your price.
                  <br />
                  Meet the market.
                </>
              )}
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
              {opp && data.product ? (
                <>
                  Your {data.product.name} sells for{" "}
                  {format(data.product.priceCents)}. {opp.eligibleQuotes}{" "}
                  retailer quotes put the benchmark at {format(opp.medianCents)}
                  . Here’s a smaller price change worth testing.
                </>
              ) : (
                <>
                  Check real retailer prices against Acme’s 24L daypack, then
                  see whether a price test could put more money into profit.
                </>
              )}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={refresh}
                disabled={
                  busy || !data.configured || !data.organization.demoMode
                }
              >
                {busy
                  ? "Checking retailer prices…"
                  : data.capture
                    ? "Refresh market prices"
                    : "Check retailer prices"}
                <span aria-hidden>↗</span>
              </Button>
              {opp && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    riverRef.current?.scrollIntoView({
                      behavior: "auto",
                      block: "start",
                    });
                    setPreview((v) => !v);
                  }}
                  aria-pressed={preview}
                >
                  {preview ? "Show current profit" : "Preview this price"}
                </Button>
              )}
            </div>
            <div
              aria-live="polite"
              className="mt-4 min-h-5 font-mono text-[12px]"
            >
              {error ? (
                <p role="alert" className="text-negative">
                  {error}
                </p>
              ) : !data.configured ? (
                <p className="text-warning">
                  Live market checks are not connected yet.
                </p>
              ) : busy ? (
                <p className="text-signal">
                  {data.progress.at(-1)?.message ??
                    "Starting the market check…"}
                </p>
              ) : data.latest?.status === "FAILED" ? (
                <p role="alert" className="text-negative">
                  Latest check failed.{" "}
                  {data.capture
                    ? "The previous capture is still shown."
                    : "No demo quotes have been substituted."}
                </p>
              ) : data.capture ? (
                <p className="text-muted-foreground">
                  Captured {formatDateTime(data.capture.at)} ·{" "}
                  {(data.capture.durationMs / 1000).toFixed(1)}s ·{" "}
                  {data.quotes.length}/{data.capture.requested} pages
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Three retailer pages. One check. Source-linked results.
                </p>
              )}
            </div>
          </div>
          <div className="frame self-start">
            <span className="frame-title">a price test, prepared</span>
            <div className="p-5 sm:p-6">
              <p className="label">
                {data.product?.name ?? "Trail Daypack 24L"}
              </p>
              <div className="mt-5 flex flex-wrap items-baseline gap-4 font-mono text-[34px] sm:text-[42px]">
                <span className="tabular">
                  {format(data.product?.priceCents ?? 7900)}
                </span>
                <span aria-hidden className="text-faint">
                  →
                </span>
                <span className="tabular text-signal">
                  {opp ? format(opp.recommendedCents) : "—"}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">
                current price <span className="mx-3">→</span> proposed test
              </p>
              {opp ? (
                <>
                  <dl className="mt-6 space-y-2 border-t pt-4 font-mono text-[12px]">
                    <Row
                      label="projected extra profit / month"
                      value={`+${format(opp.monthlyCents)}`}
                    />
                    <Row
                      label="sample sales / month"
                      value={`${opp.monthlyUnits} units`}
                    />
                    <Row
                      label="market median × 90%, capped at +15%"
                      value={format(opp.recommendedCents)}
                    />
                  </dl>
                  <Button asChild variant="outline" className="mt-5 w-full">
                    <Link href={`/findings/${opp.findingId}`}>
                      Review the prepared price change →
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="mt-6 border-t pt-4 text-[13px] leading-relaxed text-muted-foreground">
                  {data.capture
                    ? "These quotes do not establish a pricing opportunity. No price increase is proposed."
                    : "A price change appears only when at least two usable quotes support it."}
                </p>
              )}
              <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
                Projected at unchanged unit sales. Approval prepares a change
                for execution; it does not update a storefront.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 border-t pt-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="label text-foreground">
              the evidence, straight from the web
            </h2>
            {data.capture && (
              <Badge variant="positive">actual retailer capture</Badge>
            )}
          </div>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            Gregory Nano 24 listings benchmark a 24L daypack at three retailers.
            Acme’s product is fictional and comparable, not identical. Brand,
            features, variants, shipping and tax can differ.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {RETAIL_SOURCES.map((source) => {
              const quote = data.quotes.find(
                (q) => q.retailer === source.competitor,
              );
              const delta =
                quote && quote.previousPriceCents !== null
                  ? quote.priceCents - quote.previousPriceCents
                  : null;
              return (
                <article
                  key={source.url}
                  className="min-w-0 border border-border-strong bg-card p-5"
                >
                  <a
                    href={quote?.url ?? source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 text-sm font-medium hover:underline"
                  >
                    {source.competitor}
                    <span aria-hidden>↗</span>
                  </a>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {quote?.name ?? source.name}
                  </p>
                  <p className="tabular mt-5 font-mono text-[32px]">
                    {quote
                      ? format(quote.priceCents, { currency: quote.currency })
                      : "—"}
                  </p>
                  <div className="mt-3 h-1 bg-muted">
                    <div
                      className="h-full bg-signal transition-[width] duration-500 motion-reduce:transition-none"
                      style={{
                        width: `${quote ? (quote.priceCents / maxPrice) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-4 font-mono text-[11px]",
                      quote?.eligible
                        ? "text-muted-foreground"
                        : "text-warning",
                    )}
                  >
                    {quote
                      ? (quote.availability?.replaceAll("_", " ") ??
                        "availability unconfirmed")
                      : busy
                        ? "checking…"
                        : data.capture
                          ? "no usable quote returned"
                          : "awaiting first capture"}
                  </p>
                  {quote && (
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      {formatDateTime(quote.capturedAt)}
                      {quote.method ? ` · ${quote.method}` : ""}
                    </p>
                  )}
                  {delta !== null && (
                    <p
                      className={cn(
                        "mt-2 font-mono text-[11px]",
                        delta === 0 ? "text-muted-foreground" : "text-signal",
                      )}
                    >
                      {delta === 0
                        ? "unchanged since previous capture"
                        : `${delta > 0 ? "+" : "−"}${format(Math.abs(delta))} since previous capture`}
                    </p>
                  )}
                  {quote && !quote.eligible && (
                    <p className="mt-2 text-[11px] text-warning">
                      Excluded from the price recommendation.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {data.capture?.warnings.length ? (
            <details className="mt-4 text-[12px] text-muted-foreground">
              <summary className="cursor-pointer">
                Capture notes ({data.capture.warnings.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {data.capture.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        {river && opp && (
          <section
            ref={riverRef}
            className="mt-10 scroll-mt-20 border-t pt-6"
            aria-label="Projected effect of this price change"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="label text-foreground">
                {preview
                  ? "profit with this price test"
                  : "profit at today’s price"}
              </h2>
              <Button
                variant="outline"
                onClick={() => setPreview((v) => !v)}
                aria-pressed={preview}
              >
                {preview ? "Show current profit" : "Preview this price"}
              </Button>
            </div>
            <p className="mb-4 text-[13px] text-muted-foreground">
              {preview
                ? `Projected +${format(opp.annualCents)} per year if sales hold at ${opp.monthlyUnits} units a month.`
                : "Acme’s sample books at today’s price. Preview the proposed price to see the profit stream widen."}{" "}
              Trailing 90 days × 4.
            </p>
          <ProfitRiver
              river={river}
              preview={preview}
              leaks={[
                {
                  key: opp.findingId,
                  findingId: opp.findingId,
                  type: "PRICING_OPPORTUNITY",
                  stream: "uncaptured",
                  title: data.product?.name ?? "Daypack price",
                  annualCents: opp.annualCents,
                  recoveryKind: "recurring",
                  state: "open",
                },
              ]}
            />
          </section>
        )}

        <details className="mt-10 border-y py-4 text-[13px]">
          <summary className="cursor-pointer font-medium">
            How Apify powers this check
          </summary>
          <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
            Our custom Actor visits the retailer pages, extracts product prices,
            currency and availability, and writes an Apify dataset. LedgerLens
            validates those observations, compares them with the sample books,
            and prepares a pricing test. Live checks never substitute fixture
            prices.
          </p>
          <dl className="mt-4 space-y-2 break-all font-mono text-[12px]">
            <Row label="Actor ID" value={data.actorId ?? "not connected"} />
            {data.capture && <Row label="Run ID" value={data.capture.runId} />}
          </dl>
          <div className="mt-4 flex flex-wrap gap-4 text-[12px]">
            {runUrl && (
              <a
                href={runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Inspect Apify run ↗
              </a>
            )}
            {datasetUrl && (
              <a
                href={datasetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Inspect dataset ↗
              </a>
            )}
            <button
              onClick={copyDetails}
              className="underline underline-offset-4"
            >
              {copied ? "Submission details copied" : "Copy submission details"}
            </button>
          </div>
        </details>
      </main>
      <SiteFooter />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
