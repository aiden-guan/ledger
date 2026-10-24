"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

/** Approve / reject controls. Approval never executes anything; it records the decision. */
export function RecommendationActions({ recommendationId }: { recommendationId: string }) {
  const approve = useMutation(api.recommendations.approve);
  const reject = useMutation(api.recommendations.reject);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      // The finding page is subscribed to this record, so it updates the moment this commits.
      if (kind === "approve") await approve({ id: recommendationId });
      else await reject({ id: recommendationId, reason: reason.trim() || null });
    } catch (e) {
      setError(e instanceof ConvexError ? String((e.data as { message?: string }).message ?? "Something went wrong") : "Something went wrong");
      setBusy(null);
    }
  }

  if (rejecting) {
    return (
      <div className="space-y-2">
        <label htmlFor="reject-reason" className="label">
          Why are you rejecting this? (optional)
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-[2px] border border-border-strong bg-background px-3 py-2 font-mono text-[13px] outline-none focus-visible:border-foreground"
          placeholder="For example: the plan upgrade was intentional"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => submit("reject")} disabled={busy !== null}>
            {busy === "reject" ? "Rejecting…" : "Confirm rejection"}
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy !== null}>
            Cancel
          </Button>
        </div>
        {error && <p className="font-mono text-[12px] text-signal">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="lg" className="flex-1" aria-label="Approve fix" onClick={() => submit("approve")} disabled={busy !== null}>
          {busy === "approve" ? "Sealing…" : "Approve fix ↵"}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setRejecting(true)} disabled={busy !== null}>
          Reject
        </Button>
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">Approving records your decision and seals the leak on your money river. LedgerLens never moves money, changes prices or contacts vendors.</p>
      {error && <p className="font-mono text-[12px] text-signal">{error}</p>}
    </div>
  );
}
