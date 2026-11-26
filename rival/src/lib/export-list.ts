import type { About, WishRow } from "./types";

/**
 * Turns a wishlist into plain text that reads well when pasted into Notes, Messages or email.
 * Top wishes first, then exact picks, then open-ended gift ideas. Links go on their own line
 * so phones make them tappable.
 */
export function listAsText(name: string, about: About, wishes: WishRow[], siteUrl?: string): string {
  const out: string[] = [];
  const first = name.split(" ")[0] || name;
  out.push(`🎄 ${first}'s Christmas List`);
  if (about.note) out.push(about.note);
  out.push("");

  const sizes = (about.sizes ?? []).filter(Boolean);
  const facts: string[] = [];
  if (sizes.length) facts.push(`Sizes: ${sizes.map((x) => x.replace(/\s*:\s*/, " ")).join(" · ")}`);
  if (about.colors) facts.push(`Colors I like: ${about.colors}`);
  if (about.brands) facts.push(`Brands I like: ${about.brands}`);
  if (about.into) facts.push(`Into lately: ${about.into}`);
  if (about.skip) facts.push(`Please skip: ${about.skip}`);
  if (facts.length) out.push("ABOUT ME", ...facts, "");

  const item = (w: WishRow, n: number) => {
    const withBrand = w.brand && !w.title.toLowerCase().startsWith(w.brand.toLowerCase()) ? `${w.brand} ${w.title}` : w.title;
    const head = `${n}. ${withBrand}${w.top ? " ⭐" : ""}`;
    const spec = [w.size && `Size: ${w.size}`, w.color && `Color: ${w.color}`, w.price && `Price: ${w.price}`].filter(Boolean).join(" · ");
    const lines = [head];
    if (spec) lines.push(`   ${spec}`);
    if (w.notes) lines.push(`   ${w.notes.replace(/\s*\n\s*/g, " ")}`);
    w.links.forEach((u, i) => lines.push(`   ${i === 0 ? "Buy it" : "Also at"}: ${u}`));
    return lines.join("\n");
  };

  const exact = wishes.filter((w) => w.kind === "exact").sort((a, b) => Number(b.top) - Number(a.top));
  const ideas = wishes.filter((w) => w.kind === "idea").sort((a, b) => Number(b.top) - Number(a.top));

  if (exact.length) {
    out.push(exact.some((w) => w.top) ? "MY LIST (⭐ = top wish)" : "MY LIST");
    out.push(exact.map((w, i) => item(w, i + 1)).join("\n\n"), "");
  }
  if (ideas.length) {
    out.push("GIFT IDEAS (surprise me!)");
    out.push(ideas.map((w, i) => item(w, i + 1)).join("\n\n"), "");
  }
  if (!wishes.length) out.push("(No wishes yet)", "");
  if (siteUrl) out.push(`Made with Christmas HQ: ${siteUrl}`);
  return out.join("\n").trim() + "\n";
}

/** Copies text, falling back to a hidden textarea where the async Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
