/**
 * SSRF guard for URLs handed to scraping infrastructure. Rejects non-http(s) schemes,
 * localhost, private RFC1918 / link-local / CGNAT ranges, IPv6 loopback/ULA/link-local,
 * and cloud metadata endpoints.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet"];

function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

export function isPrivateIPv4(host: string): boolean {
  const ip = parseIPv4(host);
  if (!ip) return false;
  const [a, b] = ip;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::" || h === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10 link local
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkPublicUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: `Scheme ${url.protocol} is not allowed` };
  if (url.username || url.password) return { ok: false, reason: "Credentials in URLs are not allowed" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "Missing host" };
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: `Host ${host} is internal` };
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return { ok: false, reason: `Host ${host} is a private or reserved address` };
  // Bare numeric hosts in other encodings (e.g. 2130706433) are rejected outright.
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "Numeric host encodings are not allowed" };
  if (!host.includes(".") && !host.includes(":")) return { ok: false, reason: `Host ${host} is not a public domain` };
  return { ok: true, url };
}
