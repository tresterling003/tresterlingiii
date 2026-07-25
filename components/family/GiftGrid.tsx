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
    <div className="relative min-h-screen bg-white text-black">
      <AnimationBackground pack={animationPack} />

      <header className="sticky top-0 z-20 border-b border-black/10 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-lg font-semibold tracking-tight">
            The Gift List
          </span>
          <span className="hidden text-sm text-neutral-500 sm:block">
            No one here will know who claimed what
          </span>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Pick something to give
          </h1>
          <p className="mt-2 text-neutral-500">
            Claim a gift below — everyone else will see it&apos;s taken, but
            the recipient never will.
          </p>
        </div>

        {occasions.length > 1 && (
          <div className="mb-10 flex flex-wrap justify-center gap-6 border-b border-black/10">
            {occasions.map((occasion) => (
              <button
                key={occasion}
                onClick={() => setOccasionFilter(occasion)}
                className={`-mb-px border-b-2 px-1 pb-3 text-sm uppercase tracking-wide transition ${
                  occasionFilter === occasion
                    ? "border-black text-black"
                    : "border-transparent text-neutral-400 hover:text-black"
                }`}
              >
                {occasion}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="py-20 text-center text-neutral-400">
            No gifts here yet — check back soon.
          </p>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 gap-px bg-black/10 sm:grid-cols-2 lg:grid-cols-3"
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
