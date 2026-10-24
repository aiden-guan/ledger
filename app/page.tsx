import { Control } from "@/components/landing/control";
import { Found } from "@/components/landing/found";
import { Hero } from "@/components/landing/hero";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { Method } from "@/components/landing/method";
import { getLandingData } from "@/lib/landing/data";

// The figures below come from running the engine over the demo books at build time.
export const dynamic = "force-static";

export default async function LandingPage() {
  const data = await getLandingData();
  return (
    <>
      <LandingNav />
      <main>
        <Hero data={data} />
        <Found data={data} />
        <Method data={data} />
        <Control data={data} />
      </main>
      <LandingFooter />
    </>
  );
}
