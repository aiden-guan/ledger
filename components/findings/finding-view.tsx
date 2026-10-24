"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@/convex/_generated/api";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Frame } from "@/components/ui/card";
import { SiteFooter } from "@/components/layout/site-footer";
import { ConfidenceMeter } from "@/components/financial/confidence";
import { CompetitorCard, EvidenceCard } from "@/components/findings/evidence-card";
import { RecommendationActions } from "@/components/findings/recommendation-actions";
import { FixDraftPanel } from "@/components/findings/fix-draft";
import { SealedBanner } from "@/components/findings/sealed-banner";
import { buildFixDraft } from "@/lib/investigation/drafts";
import { format } from "@/lib/finance/money";
import { ACTION_TYPE_LABELS, AUDIT_ACTION_LABELS, confidenceLabel, FINDING_TYPE_LABELS, formatDateTime } from "@/lib/ui/labels";
import { cn } from "@/lib/utils/cn";
import type { FindingDetail } from "@/lib/views/findings";

/** A finding, kept live: approving or rejecting re-renders it from the committed record. */
export function FindingView({ preloaded }: { preloaded: Preloaded<typeof api.findings.detail> }) {
  const detail = usePreloadedQuery(preloaded);
  return detail ? <FindingContent detail={detail} /> : null;
}

export function FindingContent({ detail }: { detail: FindingDetail }) {
  const { finding, evidence, recommendation, audit, events } = detail;
  const market = evidence.filter((e) => e.display?.kind === "competitor");
  const internal = evidence.filter((e) => e.display && e.display.kind !== "competitor");
  const marketLive = market.some((e) => e.display?.kind === "competitor" && e.display.captureMode === "live");
  const marketSandbox = marketLive && market.every((e) => e.display?.kind === "competitor" && e.display.sandbox);
  const runId = market.find((e) => e.display?.kind === "competitor")?.display;
  const level = confidenceLabel(finding.confidence);
  const oneTime = finding.recoveryKind === "one_time";
  const stepEvents = events.filter((e) => typeof e.metadata.step === "string" && e.metadata.status !== "started");
  const sealed = recommendation?.status === "READY_FOR_EXECUTION" || recommendation?.status === "APPROVED";
  const draft = recommendation ? buildFixDraft(finding.findingType, finding.metadata, recommendation.metadata, detail.organization.name) : null;

  return (
    <>
      <AppHeader organizationName={detail.organization.name} demoMode={detail.organization.demoMode} />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <nav className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
          <Link href="/overview" className="hover:text-foreground">
            ← overview
          </Link>
          <span className="text-faint">/</span>
          <span>leaks</span>
          <span className="text-faint">/</span>
          <span className="text-foreground">{FINDING_TYPE_LABELS[finding.findingType].toLowerCase()}</span>
        </nav>

        <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_340px] lg:gap-14">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="label">{FINDING_TYPE_LABELS[finding.findingType]}</span>
              <Badge variant={sealed ? "positive" : "negative"}>{sealed ? "sealed" : recommendation?.status === "REJECTED" ? "rejected" : "leaking"}</Badge>
              <Badge variant={level === "High" ? "positive" : level === "Medium" ? "warning" : "negative"}>{level.toLowerCase()} confidence</Badge>
              {finding.status === "NEEDS_REVIEW" && <Badge variant="warning">evidence did not fully support this finding</Badge>}
            </div>
            <h1 className="display mt-4 text-balance text-[38px] font-medium leading-[1.02] sm:text-[54px]">{finding.title}</h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">{finding.summary}</p>
            {sealed && <SealedBanner annualCents={finding.annualImpactCents} oneTime={oneTime} />}

            <Section n="01" title="what happened">
              <p className="max-w-2xl text-[15px] leading-relaxed">{finding.explanation}</p>
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                {"// "}
                {finding.narrativeSource === "model"
                  ? `Explanation written by ${finding.narrativeModel} from the evidence below. Figures come from the deterministic engine.`
                  : "Rules-based explanation generated from the evidence below (AI narrative unavailable)."}
              </p>
            </Section>

            {draft && (
              <Section n="02" title={sealed ? "the fix you approved" : "the fix, already prepared"}>
                <FixDraftPanel draft={draft} sealed={sealed} />
              </Section>
            )}

            <Section n="03" title="evidence">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {internal.map((e) => (
                  <EvidenceCard key={e.id} evidence={e} />
                ))}
              </div>
            </Section>

            {market.length > 0 && (
              <Section
                n="04"
                title="market evidence · apify"
                aside={
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {marketSandbox
                      ? `Crawled through Apify from demo storefront pages; prices are set by the demo, not live market data${runId?.kind === "competitor" && runId.runId ? ` · run ${runId.runId}` : ""}`
                      : marketLive
                      ? `Collected through Apify${runId?.kind === "competitor" && runId.runId ? ` · run ${runId.runId}` : ""}`
                      : "Demo dataset, not live market data"}
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {market.map((e) => (
                    <CompetitorCard key={e.id} evidence={e} />
                  ))}
                </div>
              </Section>
            )}

            {finding.calculations.length > 0 && (
              <Section n="05" title="calculations">
                <div className="overflow-x-auto border border-border-strong bg-card">
                  <table className="w-full font-mono text-[12px]">
                    <tbody>
                      {finding.calculations.map((c, i) => (
                        <tr key={i} className={cn(i > 0 && "border-t border-border")}>
                          <td className="w-8 px-4 py-2.5 align-top text-faint">{String(i + 1).padStart(2, "0")}</td>
                          <td className="py-2.5 pr-4 align-top font-sans text-[13px]">{c.label}</td>
                          <td className="px-4 py-2.5 align-top text-muted-foreground">{c.formula}</td>
                          <td className="tabular whitespace-nowrap px-4 py-2.5 text-right align-top text-foreground">{c.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{"// "}All money is computed in integer cents by the deterministic engine. The model never performs arithmetic.</p>
              </Section>
            )}

            {finding.uncertainty.length > 0 && (
              <Section n="06" title="uncertainty and missing evidence">
                <ul className="max-w-2xl space-y-1.5 text-sm text-muted-foreground">
                  {finding.uncertainty.map((u, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="font-mono text-warning">?</span>
                      {u}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section n="07" title="agent.log">
              <details className="group border border-border-strong bg-card">
                <summary className="cursor-pointer list-none px-4 py-3 font-mono text-[12px] text-muted-foreground hover:text-foreground">
                  <span className="group-open:hidden">+ show {stepEvents.length} steps</span>
                  <span className="hidden group-open:inline">− hide steps</span>
                </summary>
                <ol className="border-t border-border px-4 py-3 font-mono text-[12px]">
                  {stepEvents.map((e) => (
                    <li key={e.seq} className="flex gap-3 py-1">
                      <span className="tabular w-20 shrink-0 text-faint">{new Date(e.createdAt).toLocaleTimeString("en-US", { hour12: false })}</span>
                      <span className={cn(e.metadata.status === "warning" && "text-warning", e.metadata.status === "failed" && "text-signal")}>{e.message.toLowerCase()}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </Section>
          </div>

          <aside className="space-y-8 lg:sticky lg:top-8 lg:self-start">
            <Frame title="impact" className="px-5 pb-5 pt-6">
              <p className="label">{sealed ? "recovered when executed" : oneTime ? "paid by mistake" : "leaking every year"}</p>
              <p className={cn("display figure tabular mt-2 text-[52px] font-medium leading-none", sealed ? "text-positive" : "text-signal")}>
                {sealed ? "+" : "−"}
                {format(finding.annualImpactCents, { compact: true })}
                <span className="ml-1 text-[14px] tracking-normal text-muted-foreground">{oneTime ? "once" : "/yr"}</span>
              </p>
              <dl className="mt-5 space-y-2 text-[13px]">
                <Row k={oneTime ? "kind" : "per month"} v={oneTime ? "one-time refund" : `${format(finding.monthlyImpactCents, { compact: true })}/mo`} />
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">confidence</dt>
                  <span className="leader" />
                  <dd>
                    <ConfidenceMeter value={finding.confidence} showLabel={false} />
                  </dd>
                </div>
              </dl>
            </Frame>

            {recommendation && (
              <Frame title="recommended action" className="px-5 pb-5 pt-6">
                <Badge variant="outline">{ACTION_TYPE_LABELS[recommendation.actionType].toLowerCase()}</Badge>
                <p className="mt-3 text-[17px] font-medium leading-snug tracking-tight">{recommendation.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{recommendation.description}</p>
                <dl className="mt-4 space-y-2 text-[13px]">
                  <Row
                    k="expected recovery"
                    v={oneTime ? format(recommendation.estimatedAnnualImpactCents, { compact: true }) : `+${format(recommendation.estimatedMonthlyImpactCents, { compact: true })}/mo`}
                    positive
                  />
                  <Row k={oneTime ? "type" : "per year"} v={oneTime ? "one-time" : `+${format(recommendation.estimatedAnnualImpactCents, { compact: true })}`} />
                </dl>
                <p className="mt-4 text-[13px] leading-relaxed">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">why </span>
                  {recommendation.reasoning}
                </p>

                <div className="mt-5 border-t border-border pt-5">
                  {recommendation.status === "PROPOSED" && <RecommendationActions recommendationId={recommendation.id} />}
                  {(recommendation.status === "READY_FOR_EXECUTION" || recommendation.status === "APPROVED") && (
                    <div className="animate-fade-up">
                      <p className="font-mono text-[13px] text-positive">■ approved, ready to execute</p>
                      {recommendation.approvedAt && (
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          approved {formatDateTime(recommendation.approvedAt)}
                          {recommendation.carriedForward ? " in an earlier investigation" : ""}
                        </p>
                      )}
                      {recommendation.checklist.length > 0 && (
                        <ol className="mt-4 space-y-2 text-[13px]">
                          {recommendation.checklist.map((c, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="font-mono text-[12px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                  {recommendation.status === "REJECTED" && (
                    <p className="font-mono text-[12px] text-muted-foreground">
                      × rejected{recommendation.rejectedAt ? ` ${formatDateTime(recommendation.rejectedAt)}` : ""}
                    </p>
                  )}
                </div>
              </Frame>
            )}

            {audit.length > 0 && (
              <Frame title="audit.log" className="px-5 pb-4 pt-6">
                <ol className="space-y-3 font-mono text-[12px]">
                  {audit.map((a) => (
                    <li key={a.id}>
                      <p className="text-foreground">{(AUDIT_ACTION_LABELS[a.action] ?? a.action).toLowerCase()}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateTime(a.createdAt)} · {a.actorType.toLowerCase()}
                      </p>
                    </li>
                  ))}
                </ol>
              </Frame>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Section({ n, title, aside, children }: { n: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
        <h2 className="label">
          <span className="mr-3 text-foreground">{n}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ k, v, positive }: { k: string; v: string; positive?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <span className="leader" />
      <dd className={cn("tabular font-mono text-[13px]", positive && "text-positive")}>{v}</dd>
    </div>
  );
}
