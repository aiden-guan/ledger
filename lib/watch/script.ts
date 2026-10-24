import type { Payment } from "./screen";

/*
 * The demo bank feed: the next payments to arrive for Acme Outdoor Co., replayed live. Most are
 * routine. Three are not: an impersonator invoicing as the packaging supplier with new bank
 * details, a second payment of an invoice that was already paid, and an ad charge far above usual.
 */

export type ScriptedPayment = Omit<Payment, "id" | "at"> & { gapMs: number };

export const FEED_SCRIPT: ScriptedPayment[] = [
  { gapMs: 900, merchantName: "PIXELGRID ADS", amountCents: 12840, transactionType: "DEBIT", category: "marketing", invoiceReference: null, payeeAccount: null },
  { gapMs: 2400, merchantName: "SHOPWISE PAYMENTS PAYOUT", amountCents: 96420, transactionType: "CREDIT", category: "revenue", invoiceReference: null, payeeAccount: null },
  { gapMs: 2400, merchantName: "Trailpost Fulfillment", amountCents: 30112, transactionType: "DEBIT", category: "fulfillment", invoiceReference: "TPF-70236", payeeAccount: "2291" },
  { gapMs: 2800, merchantName: "SUMMIT PACKAGNG SUPPLY", amountCents: 105840, transactionType: "DEBIT", category: "packaging", invoiceReference: "INV-20534", payeeAccount: "7731" },
  { gapMs: 3200, merchantName: "CANVASLY", amountCents: 1500, transactionType: "DEBIT", category: "software", invoiceReference: null, payeeAccount: null },
  { gapMs: 2400, merchantName: "PIXELGRID ADS", amountCents: 48600, transactionType: "DEBIT", category: "marketing", invoiceReference: null, payeeAccount: null },
  { gapMs: 2800, merchantName: "PAYPAL *SUMMIT PACKAGING SUPPLY LLC", amountCents: 92610, transactionType: "DEBIT", category: "packaging", invoiceReference: "INV-20475", payeeAccount: "4410" },
  { gapMs: 3000, merchantName: "ACH DEBIT NORTHWIND TEXTILES", amountCents: 128600, transactionType: "DEBIT", category: "inventory", invoiceReference: "NWT-4143", payeeAccount: "5068" },
  { gapMs: 2400, merchantName: "KESTREL LABEL CO", amountCents: 6400, transactionType: "DEBIT", category: "office", invoiceReference: null, payeeAccount: null },
  { gapMs: 2400, merchantName: "BRIGHTDESK VIRTUAL ASSIST", amountCents: 45000, transactionType: "DEBIT", category: "contractors", invoiceReference: "BD-2216", payeeAccount: "8812" },
];

/** Receiving accounts on file for the demo's invoiced vendors, keyed by bank descriptor. */
export const PAYEE_ACCOUNTS: Record<string, string> = {
  "Summit Packaging Supply": "4410",
  "PAYPAL *SUMMIT PACKAGING SUPPLY LLC": "4410",
  "Trailpost Fulfillment": "2291",
  "BRIGHTDESK VIRTUAL ASSIST": "8812",
  "ACH DEBIT CASCADE DRINKWARE CO.": "3307",
  "ACH DEBIT NORTHWIND TEXTILES": "5068",
  "ACH DEBIT BRIGHTLINE ELECTRONICS": "6152",
  "ACH DEBIT GRANITE GEAR WORKS": "9024",
};
