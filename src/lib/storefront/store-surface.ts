import type { StoreLayout } from "@/lib/storefront/templates";

export type StoreSurface = {
  page: string;
  header: string;
  inner: string;
  name: string;
  footer: string;
  centered: boolean;
};

/** Visual personality for each layout. Same catalogue; different shop site. */
export function storeSurface(layout: StoreLayout): StoreSurface {
  const mark = `store-layout-${layout}`;
  switch (layout) {
    case "editorial":
      return {
        page: `${mark} bg-[#f6f1ea] text-neutral-900`,
        header: "border-b-0 bg-[#f6f1ea]/90 backdrop-blur",
        inner: "mx-auto flex max-w-6xl items-end justify-between gap-4 px-4 py-6",
        name: "text-2xl font-semibold tracking-tight",
        footer: "mt-24 border-t-0 bg-[#ece4d8]",
        centered: false,
      };
    case "soft":
      return {
        page: `${mark} bg-rose-50/50 text-neutral-900`,
        header: "border-b border-rose-100 bg-white/80 backdrop-blur",
        inner: "mx-auto flex max-w-5xl items-center gap-3 px-4 py-4",
        name: "text-lg font-semibold tracking-tight",
        footer: "mt-16 border-t border-rose-100 bg-white/60",
        centered: false,
      };
    case "dense":
      return {
        page: `${mark} bg-white text-neutral-900`,
        header: "border-b border-neutral-200 bg-white",
        inner: "mx-auto flex max-w-6xl items-center gap-2 px-3 py-2",
        name: "text-base font-bold",
        footer: "mt-10 border-t border-neutral-200",
        centered: false,
      };
    case "menu":
      return {
        page: `${mark} bg-amber-50/40 text-neutral-900`,
        header: "border-b border-amber-200/80 bg-amber-50/80",
        inner: "mx-auto flex max-w-3xl items-center gap-3 px-4 py-4",
        name: "font-serif text-xl font-semibold",
        footer: "mt-16 border-t border-amber-200/80",
        centered: false,
      };
    case "luxury":
      return {
        page: `${mark} bg-[#faf9f7] text-stone-900`,
        header: "border-b-0 bg-[#faf9f7]",
        inner: "mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-10 text-center",
        name: "text-sm font-medium uppercase tracking-[0.35em]",
        footer: "mt-24 border-t border-stone-200",
        centered: true,
      };
    case "showcase":
      return {
        page: `${mark} bg-stone-100 text-stone-900`,
        header: "border-b border-stone-200 bg-stone-100/90 backdrop-blur",
        inner: "mx-auto flex max-w-6xl items-center gap-3 px-4 py-5",
        name: "text-xl font-semibold tracking-tight",
        footer: "mt-20 border-t border-stone-300",
        centered: false,
      };
    case "wholesale":
      return {
        page: `${mark} bg-slate-50 text-slate-900`,
        header: "border-b border-slate-300 bg-white",
        inner: "mx-auto flex max-w-6xl items-center gap-3 px-4 py-3",
        name: "text-sm font-semibold uppercase tracking-wide",
        footer: "mt-12 border-t border-slate-300 bg-white",
        centered: false,
      };
    case "social":
      return {
        page: `${mark} bg-white text-neutral-900`,
        header: "border-b border-neutral-100 bg-white",
        inner: "mx-auto flex max-w-lg items-center gap-2 px-3 py-3",
        name: "text-base font-bold",
        footer: "mt-12 border-t border-neutral-100",
        centered: false,
      };
    case "services":
      return {
        page: `${mark} bg-indigo-50/40 text-neutral-900`,
        header: "border-b border-indigo-100 bg-white/90 backdrop-blur",
        inner: "mx-auto flex max-w-4xl items-center gap-3 px-4 py-4",
        name: "text-lg font-semibold",
        footer: "mt-16 border-t border-indigo-100",
        centered: false,
      };
    default:
      return {
        page: `${mark} bg-white text-neutral-900`,
        header: "border-b border-neutral-200 bg-white/95 backdrop-blur",
        inner: "mx-auto flex max-w-6xl items-center gap-3 px-4 py-3",
        name: "text-lg font-semibold",
        footer: "mt-16 border-t border-neutral-200",
        centered: false,
      };
  }
}
