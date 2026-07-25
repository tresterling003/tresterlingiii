"use client";

import { motion } from "framer-motion";
import type { FamilyGiftDTO } from "@/types/gift";

export function GiftCard({
  gift,
  onClaim,
}: {
  gift: FamilyGiftDTO;
  onClaim: () => void;
}) {
  return (
    <motion.div
      layout
      whileHover={gift.claimed ? undefined : { y: -4 }}
      className={`group relative z-0 bg-white transition-shadow hover:z-10 ${
        gift.claimed ? "opacity-70" : "hover:shadow-lg"
      }`}
    >
      {gift.claimed && (
        <div className="absolute left-3 top-3 z-10 bg-accent px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white">
          Claimed by {gift.claimedBy}
        </div>
      )}
      <div className="aspect-square w-full overflow-hidden bg-neutral-100">
        {gift.imageUrl ? (
          <motion.img
            src={gift.imageUrl}
            alt={gift.title}
            className={`h-full w-full object-cover transition-all ${
              gift.claimed ? "grayscale" : ""
            }`}
            whileHover={gift.claimed ? undefined : { scale: 1.04 }}
            transition={{ duration: 0.4 }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            🎁
          </div>
        )}
      </div>
      <div className="border-t border-black/10 p-4">
        <p className="mb-0.5 text-[11px] uppercase tracking-wide text-neutral-400">
          {gift.occasion}
        </p>
        <h3 className="font-medium leading-snug text-black">{gift.title}</h3>
        {gift.price && (
          <p className="mt-1 text-sm font-medium text-black">{gift.price}</p>
        )}
        {gift.notes && (
          <p className="mt-2 text-xs text-neutral-500">{gift.notes}</p>
        )}
        <div className="mt-4 flex gap-2">
          <a
            href={gift.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 border border-neutral-300 px-3 py-2 text-center text-sm text-black transition hover:border-black"
          >
            View
          </a>
          {!gift.claimed && (
            <button
              onClick={onClaim}
              className="flex-1 bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-black"
            >
              I&apos;ll get this
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
