import { z } from "zod";

export const giftInputSchema = z.object({
  title: z.string().min(1).max(200),
  link: z.string().url(),
  imageUrl: z.string().url().nullable().optional(),
  price: z.string().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  occasion: z.string().min(1).max(100),
});

export const giftUpdateSchema = giftInputSchema.partial();

export const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export const scrapeInputSchema = z.object({
  url: z.string().url(),
});
