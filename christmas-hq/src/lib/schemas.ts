import { z } from "zod";

const s = (max: number) => z.string().trim().max(max);
export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .transform((u) => (u === "" ? "" : /^http:\/\//i.test(u) ? "https://" + u.slice(7) : /^https:\/\//i.test(u) ? u : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(u) ? "https://" + u : "!" + u))
  .refine((u) => u === "" || /^https:\/\/[^\s<>"']+$/i.test(u), "That link doesn't look right. Copy the full address from the store's page.");

export const About = z.object({
  note: s(300).default(""),
  sizes: z.array(s(40)).max(12).default([]),
  colors: s(120).default(""),
  brands: s(160).default(""),
  into: s(200).default(""),
  skip: s(160).default(""),
});

export const Wish = z.object({
  kind: z.enum(["exact", "idea"]).default("exact"),
  top: z.boolean().default(false),
  title: s(120).min(1, "Give the wish a name."),
  brand: s(60).default(""),
  category: s(40).default(""),
  price: s(30).default(""),
  size: s(40).default(""),
  color: s(60).default(""),
  links: z.array(httpsUrl).max(5).default([]).transform((l) => l.filter(Boolean)),
  notes: s(600).default(""),
  image_id: z.string().uuid().nullable().default(null),
});

export const Gift = z.object({
  recipient_id: z.string().uuid(),
  wish_id: z.string().uuid().nullable().default(null),
  title: s(120).min(1, "What's the gift?"),
  price_cents: z.number().int().min(0).max(10_000_000).default(0),
  status: z.enum(["planned", "bought", "wrapped", "given"]).default("planned"),
  link: httpsUrl.default(""),
  notes: s(400).default(""),
});
