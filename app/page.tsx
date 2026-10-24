import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Banknote } from "@/components/landing/banknote";
import { Hero } from "@/components/landing/hero";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { MicroprintLine } from "@/components/landing/microprint-line";
import { Plates } from "@/components/landing/plates";
import { Button } from "@/components/ui/button";
import { getLandingData } from "@/lib/landing/data";

// The figures below come from running the engine over the demo books at build time.
export const dynamic = "force-static";

export default async function LandingPage() {
  const data = await getLandingData();
  const ledger = data.ledger.slice(0, 60).join("  ·  ");
  return (
    <main>
      <LandingNav />
      <MicroprintLine text={ledger} drift />
      <Hero data={data} />
      <MicroprintLine text={data.ledger.slice(60, 120).join("  ·  ")} />
      <Plates data={data} />
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label">The result</p>
            <h2 className="display mt-4 max-w-xl text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[1.02]">Money back, with the paperwork.</h2>
          </div>
          <Button asChild size="lg">
            <Link href="/overview">
              Open the case files <ArrowRight />
            </Link>
          </Button>
        </div>
        <Banknote data={data} />
      </section>
      <LandingFooter ledger={data.ledger.slice(120, 180).join("  ·  ")} />
    </main>
  );
}
