import { promises as dns } from 'node:dns';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'metadata.goog', 'instance-data']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet'];

/** @param {string} ip */
export function isPrivateAddress(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    if (net.isIPv6(ip)) {
        const h = ip.toLowerCase();
        if (h === '::' || h === '::1') return true;
        if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
        const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        return mapped ? isPrivateAddress(mapped[1]) : false;
    }
    return true;
}

/**
 * Rejects URLs that point at internal infrastructure (SSRF guard). Resolves DNS so a
 * public-looking name that resolves to a private address is also rejected.
 * @param {string} raw
 */
export async function assertPublicUrl(raw) {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Scheme ${url.protocol} not allowed`);
    if (url.username || url.password) throw new Error('Credentials in URL not allowed');
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new Error(`Host ${host} is internal`);
    if (net.isIP(host)) {
        if (isPrivateAddress(host)) throw new Error(`Host ${host} is a private address`);
        return url;
    }
    const addresses = await dns.lookup(host, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
        throw new Error(`Host ${host} resolves to a private address`);
    }
    return url;
}
