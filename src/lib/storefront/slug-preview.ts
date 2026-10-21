/** Rough public slug from a shop name — real slug is assigned server-side on publish. */
export function previewShopSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
  return slug || "yourshop";
}
