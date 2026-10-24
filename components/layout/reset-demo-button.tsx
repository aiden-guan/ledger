"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Restores the seeded demo company. Two-step to avoid accidental resets. */
export function ResetDemoButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "working" | "error">("idle");

  useEffect(() => {
    if (state !== "confirm") return;
    const t = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(t);
  }, [state]);

  async function reset() {
    setState("working");
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      if (!res.ok) throw new Error();
      setState("idle");
      router.push("/");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <Button
      variant={state === "confirm" ? "default" : "ghost"}
      size="sm"
      disabled={state === "working"}
      onClick={() => (state === "confirm" ? reset() : setState("confirm"))}
      className="normal-case tracking-normal"
      data-state={state}
      aria-label="Reset demo"
    >
      {state === "idle" ? (
        <>
          <span className="sm:hidden">reset</span>
          <span className="hidden sm:inline">reset demo</span>
        </>
      ) : state === "confirm" ? (
        "confirm reset"
      ) : state === "working" ? (
        "restoring…"
      ) : (
        "failed, retry"
      )}
    </Button>
  );
}
