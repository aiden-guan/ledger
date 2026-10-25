# Figma design tokens

Variables and text styles from the LedgerLens Figma Design file
[Evidence to Action](https://www.figma.com/design/9V6201C7apk3N3VObf6opa), read back through Figma MCP.

- `figma-variables.json`: the raw variables and text styles as Figma returned them
- `design-tokens.json`: the same values as W3C design tokens
- `tokens.css`: CSS custom properties

Regenerate with `node scripts/figma-tokens.mjs`. The paper (`#f6f4ee`) and blue (`#1662e6`) values are the
same ones the app uses in `app/globals.css`.
