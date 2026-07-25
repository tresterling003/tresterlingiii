import { timingSafeEqual } from "crypto";

export function isValidFamilySlug(slug: string): boolean {
  const expected = process.env.FAMILY_ACCESS_SLUG;
  if (!expected) return false;

  const a = Buffer.from(slug);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
