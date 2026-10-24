"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SeedDemoButton() {
  const router = useRouter();
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
          const res = await fetch("/api/demo/seed", { method: "POST" });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            setError(body?.error?.message ?? "Could not load the demo company");
            setBusy(false);
            return;
          }
          router.refresh();
        }}
      >
        {busy && <Loader2 className="animate-spin" />}
        {busy ? "Loading demo company" : "Load demo company"}
      </Button>
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}
