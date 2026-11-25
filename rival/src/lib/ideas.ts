/** Gift Finder idea bank. Ideas are starting points, priced as typical US ranges. */

export type Interest =
  | "sports" | "gaming" | "music" | "cooking" | "reading" | "fashion" | "beauty" | "outdoors"
  | "tech" | "art" | "home" | "fitness" | "travel" | "pets" | "movies" | "coffee";

export const INTERESTS: { key: Interest; label: string }[] = [
  { key: "sports", label: "Sports" },
  { key: "fitness", label: "Gym & fitness" },
  { key: "gaming", label: "Gaming" },
  { key: "music", label: "Music" },
  { key: "tech", label: "Tech" },
  { key: "fashion", label: "Fashion" },
  { key: "beauty", label: "Beauty & self-care" },
  { key: "cooking", label: "Cooking & baking" },
  { key: "coffee", label: "Coffee & tea" },
  { key: "reading", label: "Reading" },
  { key: "art", label: "Art & crafts" },
  { key: "outdoors", label: "Outdoors" },
  { key: "home", label: "Home & cozy" },
  { key: "travel", label: "Travel" },
  { key: "pets", label: "Pets" },
  { key: "movies", label: "Movies & TV" },
];

export type Vibe = "practical" | "fun" | "sentimental" | "experience";
export const VIBES: { key: Vibe; label: string }[] = [
  { key: "practical", label: "Useful every day" },
  { key: "fun", label: "Fun surprise" },
  { key: "sentimental", label: "Meaningful" },
  { key: "experience", label: "An experience" },
];

export type Idea = { title: string; why: string; low: number; high: number; tags: Interest[]; vibe: Vibe[]; search: string };

const I = (title: string, why: string, low: number, high: number, tags: Interest[], vibe: Vibe[], search?: string): Idea => ({
  title, why, low, high, tags, vibe, search: search ?? title,
});

export const IDEAS: Idea[] = [
  I("Team jersey or hat", "Their favorite team, in their size.", 30, 120, ["sports"], ["fun", "practical"], "official team jersey"),
  I("Tickets to a game", "Make a day of it together.", 40, 250, ["sports"], ["experience", "sentimental"], "game tickets"),
  I("Quality basketball or football", "An indoor/outdoor ball they'll actually use.", 25, 60, ["sports"], ["practical"]),
  I("Insulated water bottle", "Keeps drinks cold all day at the gym.", 20, 45, ["fitness", "sports", "outdoors"], ["practical"]),
  I("Gym bag with shoe pocket", "Keeps sneakers away from clean clothes.", 30, 80, ["fitness"], ["practical"]),
  I("Lifting straps and chalk", "Small upgrades lifters love.", 15, 35, ["fitness"], ["practical"]),
  I("Massage gun", "Recovery after workouts.", 40, 150, ["fitness", "sports"], ["practical"], "mini massage gun"),
  I("Wireless earbuds", "For workouts, commutes and calls.", 50, 250, ["tech", "music", "fitness"], ["practical", "fun"]),
  I("Bluetooth speaker", "Music anywhere in the house.", 30, 150, ["music", "tech", "outdoors"], ["fun"]),
  I("Vinyl of a favorite album", "Even better if it's one that means something to you both.", 25, 45, ["music"], ["sentimental"], "vinyl record"),
  I("Concert tickets", "See a favorite artist live.", 50, 300, ["music"], ["experience"]),
  I("Gaming gift card", "Lets them pick the next game.", 20, 100, ["gaming"], ["practical"], "PlayStation Xbox Nintendo gift card"),
  I("Controller charging dock", "No more dead controllers mid-game.", 20, 40, ["gaming"], ["practical"]),
  I("Gaming headset", "Clear chat and better sound.", 40, 150, ["gaming", "tech"], ["fun"]),
  I("LED light strip", "Easy glow-up for a room or setup.", 15, 40, ["gaming", "home"], ["fun"]),
  I("Portable charger", "A battery pack for the phone that's always at 5%.", 20, 60, ["tech", "travel"], ["practical"]),
  I("Phone tripod with remote", "For photos, videos and FaceTime.", 15, 40, ["tech", "art"], ["practical"]),
  I("Smartwatch band", "A new look for a watch they already have.", 15, 50, ["tech", "fashion"], ["practical"]),
  I("Cozy hoodie in their color", "Check the About Me sizes first.", 40, 110, ["fashion", "home"], ["practical"]),
  I("Fresh sneakers", "Use their shoe size from About Me.", 70, 180, ["fashion", "sports"], ["fun"]),
  I("Beanie and gloves set", "Warm and wearable all winter.", 20, 50, ["fashion", "outdoors"], ["practical"]),
  I("Wallet or card holder", "A slim everyday upgrade.", 20, 80, ["fashion"], ["practical"]),
  I("Skincare set", "A simple routine in a nice box.", 20, 70, ["beauty"], ["practical"]),
  I("Fuzzy slippers", "Cozy mornings guaranteed.", 20, 50, ["home", "beauty"], ["practical"]),
  I("Weighted or sherpa blanket", "The best part of a movie night.", 30, 90, ["home", "movies"], ["practical"]),
  I("Scented candle", "A seasonal scent for their space.", 15, 40, ["home"], ["fun"]),
  I("Custom photo book", "Your favorite photos together this year.", 25, 70, ["home"], ["sentimental"], "custom photo book"),
  I("Framed family photo", "Print and frame a picture they love.", 20, 60, ["home"], ["sentimental"]),
  I("Handwritten letter + small gift", "Tell them what they mean to you.", 5, 30, [], ["sentimental"]),
  I("Cooking class for two", "Learn a new dish together.", 60, 200, ["cooking"], ["experience"]),
  I("Cast iron skillet", "Lasts forever, gets better with time.", 25, 60, ["cooking"], ["practical"]),
  I("Baking kit with fun cutters", "Holiday cookies, done right.", 20, 45, ["cooking"], ["fun"]),
  I("Hot sauce sampler", "For anyone who likes heat.", 20, 45, ["cooking"], ["fun"]),
  I("Pour-over coffee set", "Café coffee at home.", 25, 70, ["coffee"], ["practical"]),
  I("Specialty coffee or tea sampler", "Try something new each morning.", 20, 50, ["coffee"], ["fun"]),
  I("Favorite café gift card", "Treat their daily habit.", 15, 50, ["coffee"], ["practical"]),
  I("Book by an author they love", "Check what they're into lately.", 15, 30, ["reading"], ["sentimental", "practical"]),
  I("Kindle or e-reader", "Their whole library in a pocket.", 100, 180, ["reading", "tech", "travel"], ["practical"]),
  I("Book light and bookmark set", "For reading late.", 12, 30, ["reading"], ["practical"]),
  I("Sketchbook and quality pens", "For doodles and big ideas.", 20, 50, ["art"], ["practical", "fun"]),
  I("Paint-and-sip night", "A creative night out.", 35, 70, ["art"], ["experience"]),
  I("DIY craft kit", "Candle, embroidery or pottery kits.", 20, 60, ["art"], ["fun"]),
  I("Hammock or camp chair", "For trips and backyards.", 30, 90, ["outdoors", "travel"], ["practical"]),
  I("National park pass", "A year of adventures.", 80, 80, ["outdoors", "travel"], ["experience"], "America the Beautiful pass"),
  I("Packing cubes", "Turns any suitcase into order.", 20, 40, ["travel"], ["practical"]),
  I("Scratch-off travel map", "Track every place they've been.", 15, 35, ["travel"], ["sentimental", "fun"]),
  I("Weekend day trip", "Plan a surprise day out together.", 50, 300, ["travel"], ["experience", "sentimental"]),
  I("Pet portrait", "Their pet, as art.", 30, 120, ["pets"], ["sentimental"], "custom pet portrait"),
  I("Treat box for their pet", "Spoil the pet, win the owner.", 20, 45, ["pets"], ["fun"]),
  I("Streaming subscription", "A few months of their favorite service.", 30, 90, ["movies"], ["practical"]),
  I("Movie night box", "Popcorn, candy and a movie pick.", 20, 40, ["movies", "home"], ["fun"]),
  I("Movie theater gift card", "For the next big release.", 25, 60, ["movies"], ["experience"]),
];

/** Scores ideas for a person: interests and vibe match, inside budget, plus a nudge from words in their About Me. */
export function findIdeas(opts: { interests: Interest[]; vibe: Vibe | null; max: number; aboutText?: string }) {
  const about = (opts.aboutText ?? "").toLowerCase();
  return IDEAS.map((idea) => {
    let score = 0;
    for (const t of idea.tags) if (opts.interests.includes(t)) score += 3;
    if (opts.vibe && idea.vibe.includes(opts.vibe)) score += 2;
    for (const t of idea.tags) if (about.includes(t) || (t === "fitness" && about.includes("gym"))) score += 1;
    if (idea.low > opts.max) score = -1;
    if (!idea.tags.length && opts.vibe === "sentimental") score += 1;
    return { idea, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.idea.low - b.idea.low)
    .slice(0, 9)
    .map((x) => x.idea);
}
