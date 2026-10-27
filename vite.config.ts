import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

const appUrl = (
  process.env["APP_URL"] ||
  process.env["VITE_APP_URL"] ||
  "http://localhost:8080"
).replace(/\/+$/, "");
const shopHostsFlag = (process.env["SHOP_HOSTS"] || process.env["VITE_SHOP_HOSTS"] || "").trim();

export default defineConfig(({ command }) => {
  return {
    define: {
      "import.meta.env.VITE_APP_URL": JSON.stringify(appUrl),
      "import.meta.env.VITE_SHOP_HOSTS": JSON.stringify(shopHostsFlag),
    },
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: {
      host: "::",
      port: 8080,
      // Shop addresses in dev are http://{slug}.localhost:8080.
      allowedHosts: true,
      watch: { awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 } },
    },
    plugins: [
      tailwindcss(),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        server: { entry: "server" },
      }),
      // Node target: deployable with `node .output/server/index.mjs`, Docker, or any Node host.
      ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
      viteReact(),
      // Offline support: only the authenticated app (dashboard, sales, inventory —
      // all client-rendered, see _authenticated/route.tsx's ssr:false) is covered.
      // The public site and auth pages always need a live connection.
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png", "icon-512-maskable.png"],
        // Nitro's node-server preset writes the client bundle to
        // .output/public, not Vite's nominal `dist` — without this the
        // plugin precaches nothing and drops sw.js where nothing serves it.
        outDir: "./.output/public",
        manifest: {
          name: "BusinessOS AI",
          short_name: "BusinessOS",
          description: "Run your business, not your spreadsheets.",
          theme_color: "#4F46E5",
          background_color: "#F8FAFC",
          display: "standalone",
          start_url: "/dashboard",
          // SVG covers browser installs; the PNGs exist for Android — the
          // TWA/Bubblewrap build (Play Store packaging) needs real raster
          // icons, and a dedicated maskable one so Android's circle/squircle
          // icon masks don't clip it (padded so the glyph sits in the safe
          // zone — see scripts that generated public/icon-*.png).
          icons: [
            { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,ico,svg}"],
          navigateFallback: "/staff-login",
          navigateFallbackDenylist: [
            /^\/$/,
            /^\/auth/,
            /^\/reset-password/,
            /^\/market/,
            /^\/store/,
            /^\/legal/,
            /^\/health/,
            /^\/api/,
            /^\/sitemap/,
            /^\/invite/,
            /^\/admin/,
          ],
        },
      }),
    ],
  };
});
