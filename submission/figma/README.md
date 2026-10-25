# Figma construction and handoff

These are the final, corrected construction scripts used to reconstruct the submission. They are intended for the Figma MCP `use_figma` tool, not for execution as a browser plugin or Node program. The native files are linked in the parent README.

## Reproduce in fresh files

1. Regenerate `prototype/data.json`, `prototype/tree.svg`, and `figma/tree-packed.json` with the source export command in the parent README.
2. Create a fresh Figma Design file using an appropriate plan. Confirm the available fonts include Geist Regular/Medium/Bold and Geist Mono Regular.
3. Run `node submission/figma/make-payload.mjs design > /tmp/ledgerlens-design.js`. Execute that payload once in the new file using `use_figma`, following the Figma skills. Save the returned node IDs and inspect screenshots. Do not rerun a full construction script over an existing populated file.
4. Read the semantic variables from that Design file, resolving primitive aliases, and export `design-tokens.json`. Generate `prototype/tokens.css` from the exported values. The current checked-in values are an actual export from the linked reconstruction.
5. Create a fresh Figma Slides file. Generate `deck-01`, `deck-02`, and `deck-03` payloads with the same command and execute them in that order. Each batch builds four slides and returns layout validation. Inspect the first and final compositions. Native interactive/media embeds require the Slides editor.

The compact tree payload exists because the tool accepts at most 50,000 code characters. It packs positions from the original procedural artwork; it is not a substituted image or invented illustration. Text, receipt cards, and layouts remain native editable nodes.

## Inspectable handoff

- `design-tokens.json`: actual semantic-variable readback from Figma, including CSS syntax and resolved RGBA values.
- `../prototype/tokens.css`: CSS generated from that export.
- `../prototype/data.json`: fixed-anchor finance-engine results with provenance.
- `../prototype/model.mjs`: explicit local prototype state transitions and opportunity aggregation.
- `../stage-log.json`: four bounded logs, with current-session estimates and ratings labeled as assessments.

The existing LedgerLens application is the product source of truth. This prototype is a focused design iteration, with local simulated approval. It does not send email, execute refunds, or alter the deployed application.
