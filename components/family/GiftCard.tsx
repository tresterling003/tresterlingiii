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
      whileHover={gift.claimed ? undefined : { y: -6, scale: 1.02 }}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg transition-shadow ${
        gift.claimed ? "opacity-60" : "hover:shadow-2xl hover:shadow-primary/20"
      }`}
    >
      <div className="aspect-square w-full overflow-hidden bg-white/10">
        {gift.imageUrl ? (
          <motion.img
            src={gift.imageUrl}
            alt={gift.title}
            className="h-full w-full object-cover"
            whileHover={gift.claimed ? undefined : { scale: 1.08 }}
            transition={{ duration: 0.4 }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            🎁
          </div>
        )}
        {gift.claimed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-black">
              Claimed by {gift.claimedBy}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="mb-0.5 text-xs uppercase tracking-wide text-white/40">
          {gift.occasion}
        </p>
        <h3 className="font-medium leading-snug">{gift.title}</h3>
        {gift.price && (
          <p className="mt-1 text-sm text-white/50">{gift.price}</p>
        )}
        {gift.notes && (
          <p className="mt-2 text-xs text-white/40">{gift.notes}</p>
        )}
        <div className="mt-4 flex gap-2">
          <a
            href={gift.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-center text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            View
          </a>
          {!gift.claimed && (
            <button
              onClick={onClaim}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
            >
              I&apos;ll get this
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
