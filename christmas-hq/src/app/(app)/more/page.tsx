"use client";

import { Gamepad2, Palette, PiggyBank, ShoppingBag, Wand2, Gift, Shuffle, Sparkles } from "lucide-react";
import { PageHead, Panel } from "@/components/ui";
import { TileGrid } from "@/components/tiles";

export default function More() {
  return (
    <div>
      <PageHead title="More" />
      <Panel>
        <TileGrid
          tiles={[
            { href: "/finder", label: "Gift Finder", icon: Wand2, color: "purple" },
            { href: "/budget", label: "Budget", icon: PiggyBank, color: "gold" },
            { href: "/games", label: "Games", icon: Gamepad2, color: "teal" },
            { href: "/shop", label: "Shop", icon: ShoppingBag, color: "pink" },
            { href: "/settings", label: "Customize", icon: Palette, color: "blue" },
            { href: "/games/catch", label: "Present Catch", icon: Gift, color: "green" },
            { href: "/games/memory", label: "Ornament Match", icon: Sparkles, color: "orange" },
            { href: "/games/scramble", label: "Jingle Jumble", icon: Shuffle, color: "red" },
          ]}
        />
      </Panel>
    </div>
  );
}
