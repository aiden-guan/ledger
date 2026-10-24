/**
 * Merchant normalization. Bank descriptors for one vendor vary wildly
 * ("SQ *RELAY INBOX 8823", "RelayInbox.com", "Relay Inbox Inc."), so detectors
 * group on a normalized name and a compact key.
 */

const PROCESSOR_PREFIXES = [
  /^sq\s*\*/i,
  /^tst\s*\*/i,
  /^paypal\s*\*/i,
  /^pp\s*\*/i,
  /^stripe\s*\*/i,
  /^pos\s+/i,
  /^ach\s+(debit|credit)?\s*/i,
  /^recurring\s+/i,
  /^debit\s+card\s+purchase\s*/i,
];

const CORPORATE_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "co",
  "corp",
  "corporation",
  "company",
  "gmbh",
  "plc",
]);

const NOISE_WORDS = new Set(["subscr", "subscription", "payment", "pmt", "autopay", "bill", "billing", "www"]);

export function normalizeMerchantName(raw: string): string {
  let value = raw.trim();
  for (const prefix of PROCESSOR_PREFIXES) value = value.replace(prefix, "");
  value = value
    .toLowerCase()
    .replace(/\.(com|net|io|co|app|org)\b/g, " ")
    .replace(/[*#]/g, " ")
    .replace(/[^a-z0-9&\s]/g, " ");

  const words = value
    .split(/\s+/)
    .filter(Boolean)
    // Drop reference numbers / store numbers ("8823", "x4411", "#22").
    .filter((w) => !/^x?\d{2,}$/.test(w))
    .filter((w) => !NOISE_WORDS.has(w));

  while (words.length > 1 && CORPORATE_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ").trim();
}

/** Compact grouping key: "relay inbox" and "relayinbox" collide intentionally. */
export function merchantKey(normalizedOrRaw: string): string {
  return normalizeMerchantName(normalizedOrRaw).replace(/\s+/g, "");
}
