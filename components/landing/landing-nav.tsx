import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { SoundToggle } from "@/components/landing/sound-toggle";

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="flex h-16 items-center gap-8 px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-medium tracking-[-0.01em]">
          <Mark />
          LedgerLens
        </Link>
        <SoundToggle className="ml-auto -mr-6" />
        <ThemeToggle className="-mr-4" />
        <Link
          href="/overview"
          className="rounded-[var(--radius)] bg-foreground px-3.5 py-1.5 text-[13px] font-medium text-background transition-opacity hover:opacity-85"
        >
          Open the demo
        </Link>
      </div>
    </header>
  );
}
