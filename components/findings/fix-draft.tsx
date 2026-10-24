"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Frame } from "@/components/ui/card";
import type { FixDraft } from "@/lib/investigation/drafts";
import { format } from "@/lib/finance/money";

export function FixDraftPanel({ draft, sealed }: { draft: FixDraft; sealed: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (draft.kind !== "email") return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (draft.kind === "price") {
    const change = ((draft.toCents - draft.fromCents) / draft.fromCents) * 100;
    return (
      <Frame title={sealed ? "price.diff · approved" : "price.diff"} className="px-5 pb-5 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[12px] text-muted-foreground">
          <span className="text-foreground">{draft.productName}</span>
          <span>sku {draft.sku}</span>
        </div>
        <div className="mt-4 font-mono text-[13px]">
          <p className="tabular text-signal">
            <span className="inline-block w-5 select-none">−</span>price {format(draft.fromCents, { compact: false })}
          </p>
          <p className="tabular text-positive">
            <span className="inline-block w-5 select-none">+</span>price {format(draft.toCents, { compact: false })}
            <span className="ml-3 text-muted-foreground">({change >= 0 ? "+" : ""}{change.toFixed(1)}%)</span>
          </p>
        </div>
        <p className="display figure mt-5 flex items-baseline gap-4 text-[44px] leading-none sm:text-[60px]">
          <span className="tabular text-faint line-through decoration-1">{format(draft.fromCents, { compact: false })}</span>
          <span className="text-muted-foreground">→</span>
          <span className="tabular">{format(draft.toCents, { compact: false })}</span>
        </p>
        <p className="mt-5 text-[13px] text-muted-foreground">{draft.note}</p>
      </Frame>
    );
  }

  const mailto = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  return (
    <Frame title={sealed ? "draft.eml · approved" : "draft.eml"}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 pb-3 pt-5">
        <dl className="grid grid-cols-[64px_1fr] gap-y-1 font-mono text-[12px]">
          <dt className="text-muted-foreground">to:</dt>
          <dd>{draft.to}</dd>
          <dt className="text-muted-foreground">subject:</dt>
          <dd className="text-foreground">{draft.subject}</dd>
        </dl>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={copy}>
            {copied ? "■ copied" : "copy"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={mailto}>open in email</a>
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap px-5 py-5 text-[14px] leading-relaxed">{draft.body}</p>
      <p className="border-t border-border px-5 py-3 font-mono text-[11px] text-muted-foreground">not sent. you send it.</p>
    </Frame>
  );
}
