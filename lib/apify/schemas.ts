import { z } from "zod";

/** Input accepted by the ledgerlens-competitor-pricing Actor. */
export const ActorInputSchema = z.object({
  products: z
    .array(
      z.object({
        internalProductId: z.string().min(1),
        competitor: z.string().min(1),
        url: z.string().url(),
      }),
    )
    .min(1)
    .max(200),
});
export type ActorInput = z.infer<typeof ActorInputSchema>;

/** One dataset record written by the Actor. */
export const ActorOutputItemSchema = z.object({
  internalProductId: z.string().min(1),
  competitor: z.string().min(1),
  productName: z.string().nullable().optional(),
  price: z.number().positive().finite(),
  currency: z.string().length(3),
  availability: z.enum(["in_stock", "out_of_stock", "limited", "unknown"]).default("unknown"),
  url: z.string().url(),
  capturedAt: z.string().datetime({ offset: true }),
  extractionMethod: z.string().optional(),
});
export type ActorOutputItem = z.infer<typeof ActorOutputItemSchema>;
