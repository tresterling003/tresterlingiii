import ogs from "open-graph-scraper";

export type ScrapedGift = {
  title: string | null;
  imageUrl: string | null;
  price: string | null;
};

export async function scrapeGiftLink(url: string): Promise<ScrapedGift | null> {
  try {
    const { result, error } = await ogs({
      url,
      timeout: 8000,
      fetchOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      },
    });

    if (error || !result.success) return null;

    const priceAmount =
      (result as Record<string, unknown>).ogPriceAmount ??
      (result as Record<string, unknown>).twitterLabel1 === "Price"
        ? (result as Record<string, unknown>).twitterData1
        : undefined;
    const priceCurrency = (result as Record<string, unknown>).ogPriceCurrency;

    return {
      title: result.ogTitle ?? null,
      imageUrl: result.ogImage?.[0]?.url ?? null,
      price:
        typeof priceAmount === "string"
          ? `${priceCurrency ?? ""} ${priceAmount}`.trim()
          : null,
    };
  } catch {
    return null;
  }
}
