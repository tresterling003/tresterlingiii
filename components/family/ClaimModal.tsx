"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Confetti } from "@/components/animations/Confetti";
import type { FamilyGiftDTO } from "@/types/gift";

export function ClaimModal({
  gift,
  slug,
  onClose,
  onClaimed,
}: {
  gift: FamilyGiftDTO;
  slug: string;
  onClose: () => void;
  onClaimed: (giftId: string, claimerName: string) => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/public/${slug}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giftId: gift.id, claimerName: name }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Try again.");
      return;
    }
    setSuccess(true);
    onClaimed(gift.id, name);
    setTimeout(onClose, 1600);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm border border-black/10 bg-white p-6 text-black shadow-2xl"
        >
          {success ? (
            <>
              <Confetti burst />
              <p className="py-8 text-center text-lg font-medium">
                Got it, thank you! 🎁
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 className="mb-1 text-lg font-semibold">{gift.title}</h2>
              <p className="mb-4 text-sm text-neutral-500">
                Other family members will see this is claimed, so no one
                doubles up — the recipient never will.
              </p>
              <label className="mb-1 block text-sm text-neutral-600">
                Your name
              </label>
              <Input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="So others know it's taken"
              />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-5 flex gap-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Claiming…" : "I'll get this"}
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
