#!/usr/bin/env node
// Fails if any server-only secret name or value appears in the browser bundle
// (.next/static). Run after `next build`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_NAMES = ["SUPABASE_SERVICE_ROLE_KEY", "APIFY_TOKEN", "LLM_API_KEY", "DATABASE_URL"];
const STATIC_DIR = join(process.cwd(), ".next", "static");

if (!existsSync(STATIC_DIR)) {
  console.error("check-client-bundle: .next/static not found. Run `npm run build` first.");
  process.exit(1);
}

// Secret values from the environment (only meaningful ones, long enough to be distinctive).
const secretValues = SECRET_NAMES.map((name) => [name, process.env[name]]).filter(([, v]) => typeof v === "string" && v.length >= 8);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|css|json|html|map|txt)$/.test(entry)) yield path;
  }
}

const problems = [];
let scanned = 0;
for (const file of walk(STATIC_DIR)) {
  scanned++;
  const text = readFileSync(file, "utf8");
  for (const name of SECRET_NAMES) if (text.includes(name)) problems.push(`${file}: contains secret name ${name}`);
  for (const [name, value] of secretValues) if (text.includes(value)) problems.push(`${file}: contains the value of ${name}`);
  if (/sk-ant-[A-Za-z0-9_-]{10,}/.test(text)) problems.push(`${file}: contains something that looks like an Anthropic API key`);
  if (/apify_api_[A-Za-z0-9]{10,}/.test(text)) problems.push(`${file}: contains something that looks like an Apify token`);
}

if (problems.length) {
  console.error(`check-client-bundle: ${problems.length} problem(s) in ${scanned} files`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-client-bundle: OK, ${scanned} client files scanned, no secret names or values found (${secretValues.length} secret values checked).`);
