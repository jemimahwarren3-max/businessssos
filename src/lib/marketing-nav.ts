export const MARKETING_NAV = [
  { to: "/stores" as const, label: "Browse stores" },
  { to: "/templates" as const, label: "Store designs" },
  { to: "/pricing" as const, label: "Pricing" },
  { to: "/faq" as const, label: "FAQ" },
] as const;

export const MARKETING_EXISTING_STORE_PROMPT =
  "Already have a Kwetuu store? Sign in to manage your business.";
