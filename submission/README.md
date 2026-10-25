# LedgerLens · Idea to Demo · Cal Hacks 13.0

**Find the leak. Show the proof. Keep the owner in control.**

## Submission links

- [Figma Slides — product and four-stage workflow](https://www.figma.com/slides/0SCx9Ow10siUfe7D9qrXS6)
- [Figma Design — reconstructed evidence-to-action flow](https://www.figma.com/design/9V6201C7apk3N3VObf6opa)
- [Clickable prototype](https://www.figma.com/proto/9V6201C7apk3N3VObf6opa?node-id=2-30)
- [Full working product](https://ledgerlens-mu.vercel.app/overview)
- [Working product repository](https://github.com/aiden-guan/ledger)
- Demo video: `video/ledgerlens-demo.mp4` in the downloadable submission package.

## What is included

- Twelve native editable Figma Slides with speaker notes, clickable artifact links, and four stage-log entries. Each stage is under 200 words, includes tool choice and why, approximate time, a 1–5 rating, and its output.
- Four linked native Figma Design screens: Discover → Prove → Prepare → Review. There are five prototype actions, semantic color variables, shared type styles, auto layout, and a reusable button.
- A focused runnable HTML/CSS/JavaScript prototype in `prototype/`, using actual Figma-exported token values and existing finance-engine output.
- A guided video of the reconstructed Figma prototype and workflow, with synthetic narration and captions. It is an edited walkthrough, not a live browser screen recording.
- The source generator, Figma construction scripts, design-token export, narration script, and QA evidence.

## Run the focused prototype

From this directory:

```bash
python3 -m http.server 4173 --directory prototype
```

Open `http://localhost:4173`. It needs no API keys, backend, network fetches, or dependency installation. Local fonts are included. Use a local HTTP server rather than opening the HTML as a file, because the state module is loaded as an ES module.

To regenerate the financial data and tree from the full repository:

```bash
npm ci
node -e 'require("esbuild").buildSync({entryPoints:["submission/export-data.ts"],bundle:true,platform:"node",format:"cjs",outfile:"/tmp/ledgerlens-export.cjs"})'
node /tmp/ledgerlens-export.cjs
```

The generator uses a fixed fictional demo anchor. It runs the existing investigation engine in fixture mode. Monetary output is not a claim of real recovered funds or live market research.

## Provenance and boundaries

The team reports prior Figma use, but the original files were lost. These files are newly reconstructed and refined artifacts. The stage log describes this session; it does not invent historical file links, timings, ratings, user research, or time savings. Times are approximate overlapping estimates; ratings are agent QA assessments.

The full LedgerLens application predates this submission assembly. The focused Evidence Lab was implemented from the newly created Figma flow and exported variables. Codex generated its code. Figma Make was selected as a runnable-hosting destination, but the environment blocked its source upload before import. The empty Make file is not a completed deliverable and is not used as evidence of a successful workflow.

Native Figma screens were inspected in screenshots and checked for text bounds, typography, and prototype links. The local model passed checks for exact engine-derived totals, approval gating, repeat approval, and reset; JavaScript syntax passed. Browser playback and mobile rendering of the HTML prototype remain unverified in this environment.

## Final submission assembly

The current tools cannot create native interactive/media embeds in Figma Slides or change Figma sharing permissions. Complete these editor/account steps before submitting:

1. Open the Slides deck and insert the Design prototype as a **native Figma embed**, using the prototype link above. A text hyperlink alone does not satisfy the organizer’s embed requirement.
2. Add `video/ledgerlens-demo.mp4` to the deck as the demo video. The download package also includes the narration source for replacement or re-recording.
3. Set the Slides deck and Design file to **Anyone with the link → Can view**. Verify the deck, embedded prototype, and repository in a signed-out browser.
4. Confirm every team member is Edu verified. The connected account reports a student plan; this does not establish anyone else’s eligibility.
5. If useful, follow the optional Make import instructions below from an environment with Figma upload access. A Make file is not required when the native prototype is embedded.

No submission portal URL or feedback-form URL was provided. No form has been submitted and no feedback has been invented on the team’s behalf.

## Optional Make import

The complete import-ready project is `prototype/`. It is plain HTML/CSS/JavaScript with a root `index.html`, so it should use Figma’s unconfigured HTML import path; do not add lifecycle scripts or a package manifest. Preserve its fonts, token CSS, data export, and tree SVG. The previous upload failed before import; do not treat the blank file as a working preview.

## Credits

The tree and financial data originate from this LedgerLens repository. Geist fonts are bundled from the repository’s existing Geist dependency; see its font license. Narration is synthesized locally with Piper using the public-domain LJ Speech dataset voice model. Model card: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD . No voice recording from a team member is implied.
