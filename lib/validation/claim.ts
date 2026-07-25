import { z } from "zod";

export const claimInputSchema = z.object({
  giftId: z.string().min(1),
  claimerName: z.string().min(1).max(100),
});
