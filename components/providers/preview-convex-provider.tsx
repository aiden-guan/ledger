"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState } from "react";

/** A Convex client pointed at an address that never answers, so hooks render but stay idle. */
export function PreviewConvexProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new ConvexReactClient("https://offline-preview.convex.cloud"));
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
