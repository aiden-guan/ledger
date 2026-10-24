import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./wordmark";

export function LandingFooter() {
  return (
    <footer className="mt-32 overflow-hidden border-t border-border-strong">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 pb-10 pt-20 sm:px-6">
        <p className="display text-[clamp(2rem,4.6vw,3.5rem)] leading-none">Open the books.</p>
        <Button asChild size="lg">
          <Link href="/overview">
            Open the demo <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Wordmark />
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 border-t border-border px-4 py-4 font-mono text-[11px] text-muted-foreground sm:px-6">
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
