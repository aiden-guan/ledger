import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { ResetDemoButton } from "./reset-demo-button";
import { NavLinks } from "./nav-links";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2">
      <Mark />
      <span className="hidden text-[15px] font-medium tracking-[-0.01em] min-[440px]:inline">LedgerLens</span>
    </Link>
  );
}

export function AppHeader({ organizationName, demoMode }: { organizationName?: string; demoMode: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Logo />
        {organizationName && <span className="hidden font-mono text-[12px] text-muted-foreground md:inline">/ {organizationName.toLowerCase()}</span>}
        <NavLinks />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {demoMode && <ResetDemoButton />}
        </div>
      </div>
    </header>
  );
}
