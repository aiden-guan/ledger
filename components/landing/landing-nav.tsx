import Link from "next/link";
import { RosetteMark } from "@/components/brand/rosette-mark";

export function LandingNav() {
  return (
    <header className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <RosetteMark className="size-6" />
        <span className="display text-[21px] font-medium leading-none">LedgerLens</span>
      </Link>
      <nav className="ml-auto flex items-center gap-5 font-mono text-[12px] text-muted-foreground">
        <a href="#how" className="hidden transition-colors hover:text-foreground sm:inline">
          how it works
        </a>
        <a href="https://github.com/aiden-guan/ledger" className="hidden transition-colors hover:text-foreground sm:inline">
          source
        </a>
        <Link href="/overview" className="border border-foreground px-3 py-1.5 text-foreground transition-colors hover:bg-foreground hover:text-background">
          open the demo
        </Link>
      </nav>
    </header>
  );
}
