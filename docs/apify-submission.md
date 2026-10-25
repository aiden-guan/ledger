# Apify submission and demo

Sponsor tooling used: **Apify** (custom Actor, Crawlee, Apify datasets and key-value storage), **Convex**, **Anthropic**.

Actor ID: **`aidengrails/ledgerlens-competitor-pricing`**

Opaque Actor ID: **`r1XmOWedMNF9AKMbr`**

Public demo: **[LedgerLens market check](https://ledgerlens-mu.vercel.app/market-check)**.

Verified production capture, October 25, 2026: [Apify run](https://console.apify.com/actors/runs/wVzqauODYyITpuVD5), [dataset](https://console.apify.com/storage/datasets/5EgC1yt4GuQhfebK1). All three pages returned USD 99.95 and in-stock observations, with no failed pages. The expected product-name checks were verified in the actual run input. The engine proposed a USD 79 → 89 test, projecting USD 90/month or USD 1,080/year at nine units/month. Market collection took about 12 seconds. These are capture-time results, not a promise that a future refresh returns the same prices. The structured receipt is in `docs/apify-evidence.json`.

The Actor remains private. Share the ID with the Apify judges as requested. Do not claim the separate “Best Actor built with AI Chat” category until the sponsor confirms the build meets that condition.

## First ten seconds

Open `/market-check` after a successful real retailer capture. Leave the capture timestamp visible.

1. **0–3s:** Point to Acme's current price and the actual retailer quotes: “Your price is $79. Here's what three retailers charge for a comparable 24L pack.” Use the current displayed figures if the sample or quotes have changed.
2. **3–7s:** Point to the prepared price test and projected yearly improvement. State the actual computed figures and “if unit sales hold.”
3. **7–10s:** Click **Preview this price**. The money river widens its profit stream.

Opening narration: “Your books show your price. Apify shows the market. LedgerLens prepares the next move.”

Use the completed capture for the opening. Do not imply a recorded/completed crawl is finishing live in ten seconds. During the rest of the demo, click **Refresh market prices**, show progress, open **How Apify powers this check**, and inspect the run/dataset. Review the prepared finding to show its calculations and approval step. A changed recommendation requires a fresh decision.

## Submission copy

LedgerLens helps a small online business see where its money goes and prepare evidence-backed fixes. Our custom Apify Actor crawls real retailer product pages and extracts product names, prices, currency and availability into a dataset. It handles structured product variants, checks expected product names and records extraction failures without guessing.

LedgerLens validates those observations and combines them with the sample business's product costs and sales history. A deterministic finance engine measures the pricing opportunity in cents and prepares a conservative price test for owner approval. The money river previews the projected profit effect. Every quote links to its source and capture time; the app exposes the Actor ID and run/dataset for inspection, and repeated checks show observed price changes.

The business and financial records are synthetic; retailer observations come from actual Apify crawls. Benchmark products are comparable rather than identical, and projected profit assumes unchanged unit sales. The live retail check never substitutes demo quotes for a failed request.

## Before recording

- Open `/market-check` and complete a real refresh.
- Check the current quotes, capture time, page coverage and run/dataset links.
- Use **Copy submission details** for the actual Actor/run references.
- Include Apify in Devpost's sponsor tooling and explain the crawl → dataset → pricing test → profit preview workflow.
- Include a working repository link and the required demo video. Do not put API tokens in the submission.
