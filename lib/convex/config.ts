/** The Convex deployment the app talks to. Public by design: it is only an address. */
export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export function isConvexConfigured(): boolean {
  return Boolean(CONVEX_URL);
}
