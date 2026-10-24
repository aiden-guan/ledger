import { LandingNav } from "@/components/landing/landing-nav";
import { MoneyTree } from "@/components/landing/money-tree";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { getLandingData } from "@/lib/landing/data";

// The figures below come from running the engine over the demo books at build time.
export const dynamic = "force-static";

export default async function LandingPage() {
  const data = await getLandingData();
  return (
    <>
      <SmoothScroll />
      <LandingNav />
      <main>
        <MoneyTree data={data} />
      </main>
    </>
  );
}
