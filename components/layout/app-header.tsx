import Link from "next/link";
import { ResetDemoButton } from "./reset-demo-button";
import { NavLinks } from "./nav-links";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2 font-mono text-[13px] font-medium tracking-[-0.02em]">
      <span aria-hidden className="grid size-5 place-items-center bg-foreground text-[10px] leading-none text-background transition-colors group-hover:bg-signal">
        ≋
      </span>
      ledgerlens
    </Link>
  );
}

export function AppHeader({ organizationName, demoMode }: { organizationName?: string; demoMode: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Logo />
        {organizationName && <span className="hidden font-mono text-[12px] text-muted-foreground md:inline">/ {organizationName.toLowerCase()}</span>}
        <NavLinks />
        <div className="ml-auto flex items-center gap-2">{demoMode && <ResetDemoButton />}</div>
      </div>
    </header>
  );
}
