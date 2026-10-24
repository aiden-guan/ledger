import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-5 font-mono text-[11px] text-muted-foreground sm:px-8">
        <Link href="/overview" className="hover:text-foreground">
          Overview
        </Link>
        <Link href="/activity" className="hover:text-foreground">
          Audit log
        </Link>
        <a href="https://github.com/aiden-guan/ledger" className="hover:text-foreground">
          Source
        </a>
        <span className="ml-auto">Demo data. Acme Outdoor Co. is fictional.</span>
      </div>
    </footer>
  );
}
