"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState } from "react";

/** One Convex client per browser tab; every useQuery on the page shares its live connection. */
export function ConvexClientProvider({ url, children }: { url: string | undefined; children: React.ReactNode }) {
  const [client] = useState(() => (url ? new ConvexReactClient(url) : null));
  if (!client) return <>{children}</>;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
