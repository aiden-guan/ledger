/**
 * Money helpers. All monetary values are integers in minor currency units (cents).
 * Business calculations never use floating-point dollars; any intermediate decimal
 * (percentages, averages) is rounded explicitly back to whole cents.
 */

export type Cents = number;

function assertCents(value: number, label = "value"): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer number of cents, received ${value}`);
  }
}

/** Round half away from zero to a whole number of cents. */
export function roundCents(value: number): Cents {
  if (!Number.isFinite(value)) throw new TypeError(`Cannot round non-finite value ${value}`);
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

export function add(...values: Cents[]): Cents {
  return values.reduce((sum, v) => {
    assertCents(v);
    return sum + v;
  }, 0);
}

export function subtract(a: Cents, b: Cents): Cents {
  assertCents(a, "a");
  assertCents(b, "b");
  return a - b;
}

/** Multiply a unit amount by an integer or fractional quantity, rounding to cents. */
export function multiplyQuantity(unit: Cents, quantity: number): Cents {
  assertCents(unit, "unit");
  if (!Number.isFinite(quantity)) throw new TypeError(`quantity must be finite, received ${quantity}`);
  return roundCents(unit * quantity);
}

/** `percent` percent of `amount`, e.g. percentage(4900, 15) === 735. */
export function percentage(amount: Cents, percent: number): Cents {
  assertCents(amount, "amount");
  return roundCents((amount * percent) / 100);
}

/** Percentage change from `from` to `to` as a decimal percent (e.g. 31.82). */
export function percentChange(from: Cents, to: Cents): number {
  assertCents(from, "from");
  assertCents(to, "to");
  if (from === 0) return to === 0 ? 0 : Infinity;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Ratio helper returning a decimal fraction (not rounded). */
export function ratio(numerator: Cents, denominator: Cents): number {
  assertCents(numerator, "numerator");
  assertCents(denominator, "denominator");
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function sum(values: Cents[]): Cents {
  return add(...values);
}

export function fromDecimal(amount: number): Cents {
  // Used only at boundaries (e.g. scraped "59.99"). Avoids 59.99 * 100 = 5998.999...
  return roundCents(Number((amount * 100).toFixed(4)));
}

export function toDecimalString(cents: Cents): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export interface FormatOptions {
  currency?: string;
  /** Drop ".00" for whole amounts and always for large hero numbers. */
  compact?: boolean;
  signed?: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", CAD: "CA$", AUD: "A$", EUR: "€", GBP: "£" };

/** Groups an integer string with commas: "1234567" -> "1,234,567". */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Formats cents as en-US currency without Intl, so output is identical in every runtime
 * (browser, Node and the Convex function runtime).
 */
export function format(cents: Cents, options: FormatOptions = {}): string {
  assertCents(cents);
  const { currency = "USD", compact = false, signed = false } = options;
  const abs = Math.abs(cents);
  const whole = abs % 100 === 0;
  const showFraction = !compact && !whole;
  const units = showFraction ? Math.floor(abs / 100) : Math.round(abs / 100);
  const fraction = showFraction ? `.${String(abs % 100).padStart(2, "0")}` : "";
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const formatted = `${symbol}${groupThousands(String(units))}${fraction}`;
  if (cents < 0) return `-${formatted}`;
  if (signed && cents > 0) return `+${formatted}`;
  return formatted;
}

export const money = {
  add,
  subtract,
  multiplyQuantity,
  percentage,
  percentChange,
  ratio,
  sum,
  roundCents,
  fromDecimal,
  toDecimalString,
  format,
};
