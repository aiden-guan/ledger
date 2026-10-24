"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function SeedDemoButton() {
  const seed = useAction(api.engine.seedDemo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            // The dashboard is subscribed, so it renders as soon as the data lands.
            await seed({});
          } catch (e) {
            setError(e instanceof ConvexError ? String((e.data as { message?: string }).message) : "Could not load the demo company");
            setBusy(false);
          }
        }}
      >
        {busy ? "Loading demo company…" : "Load demo company"}
      </Button>
      {error && <p className="font-mono text-[12px] text-signal">{error}</p>}
    </div>
  );
}
