import { SeedDemoButton } from "./seed-demo-button";

export function SystemErrorPanel() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-signal">[fail] database unreachable</p>
      <h1 className="mt-3 text-[30px] font-medium tracking-[-0.03em]">LedgerLens can&apos;t reach its database.</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">
        Financial data and findings are stored in Postgres. Check that <code className="bg-muted px-1 py-0.5 font-mono text-[13px]">DATABASE_URL</code> is
        set and the database is running, then reload this page.
      </p>
    </main>
  );
}

export function SeedDemoPanel({ demoMode }: { demoMode: boolean }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-[30px] font-medium tracking-[-0.03em]">No business data yet.</h1>
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
