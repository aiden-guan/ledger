import { layGarden } from "@/lib/landing/garden";
import type { Loop } from "@/lib/landing/pond";
import { centre, layRiver, riverWay } from "@/lib/landing/river";

/** The river and pond as the page lays them out for a screen vw by vh. */
export function lay(vw: number, vh: number) {
  const narrow = vw < 640;
  const flat = 0.95;
  const pondY = vh * (narrow ? 0.36 : 0.47);
  const label = vw < 1100 ? 168 : 220;
  const r = narrow ? Math.min(vw * 0.4, (vh * 0.3) / flat) : Math.max(110, Math.min((vh * 0.36) / (0.78 * 1.11 * flat), (vw / 2 - label - 56) / (1.11 + 0.82 * 0.3)));
  const loop: Loop = { r, squash: narrow ? 1 : 0.78, lap: 28, phase: 3.4, lumps: [2.6, 0.4] };
  const koi = r * 0.82;
  const view = vh / flat;
  const river = layRiver({ width: vw, view, narrow, from: (vh - pondY) / flat, koi });
  const garden = layGarden({ width: vw, view, top: river.bottom - view * 0.1, mouthX: centre(river, river.bottom), mouthY: river.bottom, open: river.open, half: river.half, narrow, cell: narrow ? 3 : 4, koi });
  const clear = koi * 0.3 + 14;
  const path = riverWay(river, clear, garden.path);
  return { vh, loop, koi, river, garden, clear, path, hold: ((narrow ? 0.46 : 0.48) * vh - pondY) / flat, bottom: garden.top + pondY / flat };
}

export const SCREENS: [number, number][] = [
  [1440, 900],
  [1024, 768],
  [390, 844],
];
