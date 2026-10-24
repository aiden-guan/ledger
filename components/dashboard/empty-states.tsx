import { SeedDemoButton } from "./seed-demo-button";

export function SystemErrorPanel({ reason = "unreachable" }: { reason?: "unreachable" | "not_configured" }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-signal">
        {reason === "not_configured" ? "[fail] backend not configured" : "[fail] backend unreachable"}
      </p>
      <h1 className="display mt-3 text-[34px] font-medium">LedgerLens can&apos;t reach its backend.</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">
        {reason === "not_configured" ? (
          <>
            Financial data and findings live in Convex. Run <code className="bg-muted px-1 py-0.5 font-mono text-[13px]">npx convex dev</code> to create a
            deployment; it writes <code className="bg-muted px-1 py-0.5 font-mono text-[13px]">NEXT_PUBLIC_CONVEX_URL</code> to .env.local. Then restart the app.
          </>
        ) : (
          <>The Convex deployment did not respond. Check that it is running and that NEXT_PUBLIC_CONVEX_URL points at it, then reload this page.</>
        )}
      </p>
    </main>
  );
}

export function SeedDemoPanel({ demoMode }: { demoMode: boolean }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="display text-[34px] font-medium">No business data yet.</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">
        {demoMode
          ? "Load the Acme Outdoor Co. demo company: six months of sales, supplier costs and bank transactions."
          : "Set DEMO_MODE=true to load the demo company, or point DEFAULT_ORGANIZATION_SLUG at an existing organization."}
      </p>
      {demoMode && (
        <div className="mt-8 flex justify-center">
          <SeedDemoButton />
        </div>
      )}
    </main>
  );
}
