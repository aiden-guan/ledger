import type { MonthlyOverview } from "@/lib/db/queries/dashboard";
import { format } from "@/lib/finance/money";

const ROWS = 8;
const PARTIALS = " ▁▂▃▄▅▆▇█";

/** Six 30-day periods as character bars: revenue in light shade, gross profit solid. */
export function RevenueChart({ months }: { months: MonthlyOverview[] }) {
  const max = Math.max(1, ...months.map((m) => m.revenueCents));
  const cell = (value: number, row: number) => {
    // Height in eighths of a row, counted from the bottom.
    const eighths = Math.round((value / max) * ROWS * 8) - row * 8;
    return eighths >= 8 ? 8 : eighths <= 0 ? 0 : eighths;
  };
  return (
    <figure>
      <div className="grid grid-cols-6 gap-2 font-mono text-[14px] leading-[1.05]" role="img" aria-label="Revenue and gross profit by 30-day period">
        {months.map((m) => (
          <div key={m.label} title={`${m.label}: revenue ${format(m.revenueCents)}, gross profit ${format(m.grossProfitCents)}`} className="flex flex-col items-center">
            {Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i).map((row) => {
              const gp = cell(Math.max(0, m.grossProfitCents), row);
              const rev = cell(m.revenueCents, row);
              return (
                <span key={row} className="block w-full overflow-hidden whitespace-pre text-center">
                  {gp > 0 ? <span className="text-foreground">{PARTIALS[gp].repeat(4)}</span> : rev > 0 ? <span className="text-faint">{"░".repeat(4)}</span> : " "}
                </span>
              );
            })}
            <span className="mt-2 text-[10px] text-muted-foreground">{m.label.toLowerCase()}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-3 flex gap-4 font-mono text-[11px] text-muted-foreground">
        <span>
          <span className="text-faint">░</span> revenue
        </span>
        <span>
          <span className="text-foreground">█</span> gross profit
        </span>
      </figcaption>
    </figure>
  );
}
