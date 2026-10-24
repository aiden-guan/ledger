"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/layout/app-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { FindingCard } from "@/components/findings/finding-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { LiveFeed, type Feed } from "@/components/watch/live-feed";
import { AskPanel, type Ask } from "@/components/ask/ask-panel";
import { InvestigationStage } from "@/components/investigation/investigation-stage";
import { SeedDemoPanel } from "@/components/dashboard/empty-states";
import { RelativeTime } from "@/components/financial/relative-time";
import { format } from "@/lib/finance/money";
import type { DashboardData } from "@/lib/views/dashboard";

/**
 * The overview, rendered on the server and then kept live by a Convex subscription: a run
 * finishing, a fix approved in another tab or a demo reset all re-render it without a reload.
 */
export function DashboardView({ preloaded }: { preloaded: Preloaded<typeof api.dashboard.get> }) {
  return <DashboardContent data={usePreloadedQuery(preloaded)} />;
}

export function DashboardContent({ data, preview }: { data: DashboardData | null; preview?: { feed: Feed; asks: Ask[] } }) {
  if (!data) {
    return (
      <>
        <AppHeader demoMode />
        <SeedDemoPanel demoMode />
      </>
    );
  }

  const { latest, findings, overview, organization } = data;
  const revenueChange = overview.revenuePrior30Cents ? ((overview.revenue30Cents - overview.revenuePrior30Cents) / overview.revenuePrior30Cents) * 100 : 0;

  return (
    <>
      <AppHeader organizationName={organization.name} demoMode={organization.demoMode} />
      <main className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
        {data.lastFailure && (
          <p className="mb-6 border border-signal/40 px-4 py-3 font-mono text-[12px] text-signal">
            The most recent investigation did not finish: {data.lastFailure.message ?? "unknown error"}. Results below are from the last completed run.
          </p>
        )}

        <InvestigationStage
          organizationName={organization.name}
          activeInvestigationId={data.activeInvestigationId}
          river={data.river}
          findings={findings}
          hasInvestigation={Boolean(latest)}
        />

        <section className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
              <p className="label">
                <span className="text-foreground">02</span> &nbsp;leaks traced
              </p>
              {latest?.completedAt && (
                <p className="label normal-case tracking-normal">
                  investigated <RelativeTime iso={latest.completedAt} />
                  {latest.stats && ` · ${latest.stats.transactions} transactions · ${latest.stats.sales} orders · ${latest.stats.competitorListings} competitor pages`}
                </p>
              )}
            </div>
            {findings.length === 0 && (
              <p className="border-b py-10 text-center font-mono text-[13px] text-muted-foreground">
                {latest ? "no leaks found in the last investigation." : "run an investigation to trace where money is leaking."}
              </p>
            )}
            {findings.map((f, i) => (
              <FindingCard key={f.id} finding={f} index={i} />
            ))}
            {latest && (
              <dl className="mt-6 grid gap-1 font-mono text-[11px] text-muted-foreground sm:grid-cols-3">
                <div>
                  <dt className="inline text-faint">market data · </dt>
                  <dd className="inline">{latest.externalIntelMode !== "live" ? "demo dataset" : latest.externalIntelSandbox ? "apify crawl of demo storefront" : "live via apify"}</dd>
                </div>
                <div>
                  <dt className="inline text-faint">narrative · </dt>
                  <dd className="inline">{latest.modelExplanations > 0 ? latest.aiModel : "rules-based"}</dd>
                </div>
                <div>
                  <dt className="inline text-faint">money math · </dt>
                  <dd className="inline">exact cents, deterministic</dd>
                </div>
              </dl>
            )}
          </div>

          <aside>
            <p className="label border-b pb-3">
              <span className="text-foreground">03</span> &nbsp;cash
            </p>
            <dl className="mt-4 grid gap-1.5 font-mono text-[13px]">
              {data.forecast && <Stat label="in the bank" value={format(data.forecast.balanceCents)} />}
              <Stat label="revenue, 30d" value={format(overview.revenue30Cents)} note={`${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}%`} />
              <Stat label="gross margin" value={`${overview.grossMargin30Pct.toFixed(1)}%`} />
              <Stat label="orders, 30d" value={String(overview.orders30)} />
            </dl>
            <div className="mt-8">
              {data.forecast ? (
                <>
                  <p className="label mb-3">next 90 days</p>
                  <ForecastChart forecast={data.forecast} />
                </>
              ) : (
                <RevenueChart months={overview.months} />
              )}
            </div>
          </aside>
        </section>

        <LiveFeed preview={preview?.feed} />
        <AskPanel preview={preview?.asks} />
      </main>
      <SiteFooter />
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <span className="leader" />
      {note && <span className="tabular text-[11px] text-faint">{note}</span>}
      <dd className="tabular">{value}</dd>
    </div>
  );
}
