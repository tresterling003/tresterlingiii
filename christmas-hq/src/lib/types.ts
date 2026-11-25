export type Person = { id: string; name: string; avatar: string; color: string };
export type About = { note?: string; sizes?: string[]; colors?: string; brands?: string; into?: string; skip?: string };
export type Me = {
  user: Person & { email: string; theme: string; effect: string; coins: number; about: About; budget_cents: number };
  owned: string[];
  families: { id: string; name: string; code: string; members: (Person & { wishes: number })[] }[];
  coinsToday: number;
  dailyCap: number;
};
export type Claim = { mine: boolean; status: string; gift_id: string; by: string | null } | null;
export type WishRow = {
  id: string; kind: "exact" | "idea"; top: boolean; title: string; brand: string; category: string; price: string;
  size: string; color: string; links: string[]; notes: string; image_id: string | null; created_at: string; claim?: Claim;
};
export type GiftRow = {
  id: string; recipient_id: string; wish_id: string | null; title: string; price_cents: number;
  status: "planned" | "bought" | "wrapped" | "given"; link: string; notes: string; created_at: string;
};
export type GiftsData = { gifts: GiftRow[]; people: Person[]; budgets: { recipient_id: string; cents: number }[]; budget_cents: number };
