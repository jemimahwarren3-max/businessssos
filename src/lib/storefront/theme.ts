import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const coverUrlSchema = z
  .string()
  .max(500)
  .refine((value) => !value || value.startsWith("https://"), "Use an HTTPS image URL.");

export const STOREFRONT_THEME_DEFAULTS = {
  primary: "#1F2937",
  accent: "#1F2937",
  background: "#FFFFFF",
  surface: "#F8FAFC",
  text: "#171717",
  button: "#1F2937",
  buttonText: "#FFFFFF",
  link: "#1D4ED8",
  fontPair: "system",
  coverUrl: "",
  sections: {
    hero: true,
    categories: true,
    featured: true,
    about: true,
  },
} as const;

export const STOREFRONT_THEME_SCHEMA = z.object({
  primary: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.primary),
  accent: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.accent),
  background: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.background),
  surface: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.surface),
  text: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.text),
  button: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.button),
  buttonText: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.buttonText),
  link: hexColorSchema.default(STOREFRONT_THEME_DEFAULTS.link),
  fontPair: z
    .enum(["system", "editorial", "humanist", "geometric", "rounded", "mono"])
    .default(STOREFRONT_THEME_DEFAULTS.fontPair),
  coverUrl: coverUrlSchema.default(STOREFRONT_THEME_DEFAULTS.coverUrl),
  sections: z
    .object({
      hero: z.boolean().default(true),
      categories: z.boolean().default(true),
      featured: z.boolean().default(true),
      about: z.boolean().default(true),
    })
    .default(STOREFRONT_THEME_DEFAULTS.sections),
});

export type StorefrontTheme = z.infer<typeof STOREFRONT_THEME_SCHEMA>;

export const STORE_PALETTES = [
  {
    id: "linen",
    name: "Linen & ink",
    colors: {
      primary: "#3F2E2A",
      accent: "#A45A3A",
      background: "#FAF7F2",
      surface: "#F0E9DE",
      text: "#241D19",
      button: "#3F2E2A",
      buttonText: "#FFFFFF",
      link: "#7C3F2C",
    },
  },
  {
    id: "botanical",
    name: "Botanical",
    colors: {
      primary: "#244D3C",
      accent: "#668B62",
      background: "#F8FAF6",
      surface: "#EAF1E8",
      text: "#18251D",
      button: "#244D3C",
      buttonText: "#FFFFFF",
      link: "#24543C",
    },
  },
  {
    id: "rose",
    name: "Rosewater",
    colors: {
      primary: "#713B52",
      accent: "#B96B83",
      background: "#FFF9FA",
      surface: "#F8EDEF",
      text: "#2A1B22",
      button: "#713B52",
      buttonText: "#FFFFFF",
      link: "#713B52",
    },
  },
  {
    id: "cobalt",
    name: "Cobalt & cloud",
    colors: {
      primary: "#173F74",
      accent: "#3478C9",
      background: "#F7FAFE",
      surface: "#EAF1F9",
      text: "#172235",
      button: "#173F74",
      buttonText: "#FFFFFF",
      link: "#174E91",
    },
  },
  {
    id: "market",
    name: "Market fresh",
    colors: {
      primary: "#245C36",
      accent: "#9A5C19",
      background: "#FBFCF7",
      surface: "#EEF3E8",
      text: "#20251D",
      button: "#245C36",
      buttonText: "#FFFFFF",
      link: "#245C36",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    colors: {
      primary: "#17233A",
      accent: "#557AB8",
      background: "#F7F8FC",
      surface: "#E9EDF5",
      text: "#172033",
      button: "#17233A",
      buttonText: "#FFFFFF",
      link: "#1F4D91",
    },
  },
  {
    id: "plum",
    name: "Plum & lilac",
    colors: {
      primary: "#51355F",
      accent: "#84659A",
      background: "#FBF9FC",
      surface: "#F0EAF4",
      text: "#261D2B",
      button: "#51355F",
      buttonText: "#FFFFFF",
      link: "#51355F",
    },
  },
  {
    id: "mono",
    name: "High contrast",
    colors: {
      primary: "#111111",
      accent: "#4B5563",
      background: "#FFFFFF",
      surface: "#F3F4F6",
      text: "#111111",
      button: "#111111",
      buttonText: "#FFFFFF",
      link: "#111111",
    },
  },
] as const;

export type StorePalette = (typeof STORE_PALETTES)[number];

export function themeFromPalette(paletteId: string, templateAccent?: string): StorefrontTheme {
  const palette =
    STORE_PALETTES.find((candidate) => candidate.id === paletteId) ?? STORE_PALETTES[0];
  return STOREFRONT_THEME_SCHEMA.parse({
    ...palette.colors,
    accent: templateAccent || palette.colors.accent,
    fontPair: "system",
    coverUrl: "",
    sections: STOREFRONT_THEME_DEFAULTS.sections,
  });
}

function rgb(hex: string): [number, number, number] {
  const value = hex.slice(1);
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  return rgb(hex)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
}

export function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

export function themeContrastWarnings(theme: StorefrontTheme): string[] {
  const checks: [string, string, string][] = [
    ["Text", theme.text, theme.background],
    ["Text on surfaces", theme.text, theme.surface],
    ["Primary headings", theme.primary, theme.background],
    ["Button label", theme.buttonText, theme.button],
    ["Links", theme.link, theme.background],
    ["Links on surfaces", theme.link, theme.surface],
  ];
  return checks
    .filter(([, foreground, background]) => contrastRatio(foreground, background) < 4.5)
    .map(([name]) => `${name} contrast is below WCAG AA's 4.5:1 guidance.`);
}
