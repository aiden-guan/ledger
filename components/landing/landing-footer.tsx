import Link from "next/link";
import { MicroprintLine } from "./microprint-line";

const PROMISES = [
  { title: "Exact to the cent.", body: "A deterministic engine does every calculation in whole cents. The model only explains the result." },
  { title: "Evidence attached.", body: "Competitor prices come from an Apify Actor, and each one says how and when it was captured." },
  { title: "You decide.", body: "LedgerLens prepares fixes and logs decisions. It never moves money, changes prices or emails anyone." },
];

export function LandingFooter({ ledger }: { ledger: string }) {
  return (
    <footer className="mt-10 overflow-hidden border-t border-border-strong">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        {PROMISES.map((p) => (
          <p key={p.title} className="text-[14px] leading-relaxed text-muted-foreground">
            <span className="display mb-1 block text-[20px] text-foreground">{p.title}</span>
            {p.body}
          </p>
        ))}
      </div>
      <MicroprintLine text={ledger} drift />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 font-mono text-[11px] text-muted-foreground sm:px-6">
        <Link href="/overview" className="hover:text-foreground">
          overview
        </Link>
        <Link href="/activity" className="hover:text-foreground">
          audit log
        </Link>
        <a href="https://github.com/aiden-guan/ledger" className="hover:text-foreground">
          source
        </a>
        <span className="ml-auto">Demo data only. Acme Outdoor Co. is fictional.</span>
      </div>
      <p aria-hidden className="display hatched mx-auto max-w-6xl select-none whitespace-nowrap px-2 text-[21vw] font-medium leading-[0.74] tracking-[-0.04em] text-engrave lg:text-[236px]">
        LedgerLens
      </p>
    </footer>
  );
}
