import Link from "next/link";
import { Mark } from "@/components/brand/mark";

/** The app footer: one line. */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 font-mono text-[11px] text-muted-foreground sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <Mark className="size-4" />
          LedgerLens
        </Link>
        <a href="https://github.com/aiden-guan/ledger" className="hover:text-foreground">
          Source
        </a>
        <span className="ml-auto">Acme Outdoor Co. is a sample business.</span>
      </div>
    </footer>
  );
}
