import Link from "next/link";
import { Mark } from "@/components/brand/mark";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-medium tracking-[-0.01em]">
          <Mark />
          LedgerLens
        </Link>
        <nav className="hidden items-center gap-6 font-mono text-[12px] text-muted-foreground sm:flex">
          <a href="#method" className="transition-colors hover:text-foreground">
            Method
          </a>
          <a href="https://github.com/aiden-guan/ledger" className="transition-colors hover:text-foreground">
            Source
          </a>
        </nav>
        <Link
          href="/overview"
          className="ml-auto rounded-[var(--radius)] bg-foreground px-3.5 py-1.5 text-[13px] font-medium text-background transition-opacity hover:opacity-85"
        >
          Open the demo
        </Link>
      </div>
    </header>
  );
}
