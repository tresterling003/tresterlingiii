"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GiftCard } from "./GiftCard";
import { ClaimModal } from "./ClaimModal";
import { AnimationBackground } from "@/components/animations/AnimationBackground";
import type { FamilyGiftDTO } from "@/types/gift";

export function GiftGrid({
  slug,
  initialGifts,
  animationPack,
}: {
  slug: string;
  initialGifts: FamilyGiftDTO[];
  animationPack: string;
}) {
  const [gifts, setGifts] = useState(initialGifts);
  const [claimingGift, setClaimingGift] = useState<FamilyGiftDTO | null>(
    null,
  );
  const [occasionFilter, setOccasionFilter] = useState<string>("All");

  const occasions = useMemo(
    () => ["All", ...Array.from(new Set(gifts.map((g) => g.occasion)))],
    [gifts],
  );

  const filtered = useMemo(
    () =>
      occasionFilter === "All"
        ? gifts
        : gifts.filter((g) => g.occasion === occasionFilter),
    [gifts, occasionFilter],
  );

  function handleClaimed(giftId: string, claimerName: string) {
    setGifts((prev) =>
      prev.map((g) =>
        g.id === giftId ? { ...g, claimed: true, claimedBy: claimerName } : g,
      ),
    );
  }

  return (
    <div className="relative">
      <AnimationBackground pack={animationPack} />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">
            Gift Registry
          </h1>
          <p className="mt-2 text-white/60">
            Claim something below — no one else will know it was you, except
            each other.
          </p>
        </header>

        {occasions.length > 1 && (
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {occasions.map((occasion) => (
              <button
                key={occasion}
                onClick={() => setOccasionFilter(occasion)}
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  occasionFilter === occasion
                    ? "bg-accent text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {occasion}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="py-20 text-center text-white/40">
            No gifts here yet — check back soon.
          </p>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filtered.map((gift, i) => (
              <motion.div
                key={gift.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GiftCard gift={gift} onClaim={() => setClaimingGift(gift)} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {claimingGift && (
        <ClaimModal
          gift={claimingGift}
          slug={slug}
          onClose={() => setClaimingGift(null)}
          onClaimed={handleClaimed}
        />
      )}
    </div>
  );
}
