import Link from "next/link";
import { RosetteMark } from "@/components/brand/rosette-mark";
import { ResetDemoButton } from "./reset-demo-button";
import { NavLinks } from "./nav-links";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2">
      <RosetteMark className="size-[22px] transition-transform duration-700 group-hover:rotate-90" />
      <span className="display hidden text-[19px] font-medium leading-none min-[440px]:inline">LedgerLens</span>
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
