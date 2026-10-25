import { Badge } from "@/components/ui/badge";
import type { FindingDetail } from "@/lib/views/findings";
import { cn } from "@/lib/utils/cn";
import { apifyRunUrl } from "@/lib/apify/retail-sources";
import { formatDateTime } from "@/lib/ui/labels";

type Evidence = FindingDetail["evidence"][number];

const cell = "border border-border-strong bg-card p-4";

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const d = evidence.display;
  if (!d) return null;
  if (d.kind === "change") {
    return (
      <div className={cell}>
        <p className="label">{d.label}</p>
        <p className="tabular mt-2 font-mono text-[17px]">
          {d.before} <span className="text-muted-foreground">→</span> {d.after}
        </p>
        <p className={cn("tabular mt-1 font-mono text-[12px]", d.tone === "negative" ? "text-signal" : d.tone === "positive" ? "text-positive" : "text-muted-foreground")}>{d.delta}</p>
      </div>
    );
  }
  if (d.kind === "metric") {
    return (
      <div className={cell}>
        <p className="label">{d.label}</p>
        <p className="tabular mt-2 font-mono text-[17px]">{d.value}</p>
        {d.note && <p className="mt-1 text-[13px] text-muted-foreground">{d.note}</p>}
      </div>
    );
  }
  if (d.kind === "transactions") {
    return (
      <div className="min-w-0 border border-border-strong bg-card sm:col-span-2 lg:col-span-3">
        <p className="label px-4 pt-4">{evidence.title}</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full font-mono text-[12px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-2 font-normal">date</th>
                <th className="px-4 py-2 font-normal">bank descriptor</th>
                <th className="px-4 py-2 font-normal">reference</th>
                <th className="px-4 py-2 text-right font-normal">amount</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="tabular whitespace-nowrap px-4 py-2.5">{r.date}</td>
                  <td className="px-4 py-2.5">{r.merchant}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{r.reference ?? "–"}</td>
                  <td className="tabular whitespace-nowrap px-4 py-2.5 text-right">{r.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (d.kind === "series") {
    return (
      <div className={cn(cell, "sm:col-span-2")}>
        <p className="label">{d.label}</p>
        <div className="mt-3 flex flex-wrap font-mono">
          {d.rows.map((r, i) => {
            const changed = i > 0 && r.amount !== d.rows[i - 1].amount;
            return (
              <div key={i} className={cn("-ml-px border border-border-strong px-2.5 py-1.5 first:ml-0", changed && "bg-signal-soft text-signal")}>
                <p className="tabular text-[10px] text-muted-foreground">{r.date}</p>
                <p className="tabular text-[13px]">{r.amount}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (d.kind === "score") {
    return (
      <div className={cell}>
        <p className="label">{d.label}</p>
        <ul className="mt-2 space-y-1 text-[13px]">
          {d.components.map((c) => (
            <li key={c.signal} className="flex items-baseline gap-2">
              <span className="text-muted-foreground">{c.detail}</span>
              <span className="leader" />
              <span className={cn("tabular font-mono text-[12px]", c.weight < 0 && "text-signal")}>
                {c.weight > 0 ? "+" : ""}
                {c.weight.toFixed(2)}
              </span>
            </li>
          ))}
          <li className="flex items-baseline gap-2 border-t border-border pt-1.5">
            <span>score (flag at 0.70)</span>
            <span className="leader" />
            <span className="tabular font-mono text-[12px]">{d.total.toFixed(2)}</span>
          </li>
        </ul>
      </div>
    );
  }
  return null;
}

export function CompetitorCard({ evidence }: { evidence: Evidence }) {
  const d = evidence.display;
  if (!d || d.kind !== "competitor") return null;
  return (
    <div className={cn(cell, "group transition-colors hover:bg-muted")}>
      <a href={d.url} target="_blank" rel="noopener noreferrer" className="block hover:underline">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">{d.competitorName}</p>
        <span className="font-mono text-[12px] text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground">↗</span>
      </div>
      <p className="tabular mt-2 font-mono text-2xl tracking-tight">{d.price}</p>
      {d.externalName && <p className="mt-1 line-clamp-1 text-[12px] text-muted-foreground">{d.externalName}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {d.captureMode === "fixture" ? (
          <Badge variant="warning">demo dataset</Badge>
        ) : d.sandbox ? (
          <Badge variant="warning">demo storefront</Badge>
        ) : (
          <Badge variant="positive">live</Badge>
        )}
        {d.availability && d.availability !== "unknown" && <Badge variant="outline">{d.availability.replace(/_/g, " ")}</Badge>}
      </div>
      </a>
      <p className="mt-3 font-mono text-[10px] text-muted-foreground">{formatDateTime(d.capturedAt)}</p>
      {d.captureMode === "live" && d.runId && apifyRunUrl(d.runId) && <a href={apifyRunUrl(d.runId)!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-mono text-[11px] text-signal hover:underline">Inspect Apify run ↗</a>}
    </div>
  );
}
