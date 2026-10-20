import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
          patterns: [
            {
              group: [
                "*/client.server",
                "*/client.server.ts",
                "@/integrations/supabase/client.server",
              ],
              message:
                "supabaseAdmin bypasses RLS entirely — it's allowlisted for exactly the files that need it (see src/integrations/supabase/client.server.ts's header comment). Adding a new caller means widening that allowlist below, deliberately, not importing it here.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Allowlist for supabaseAdmin (service-role, bypasses RLS) — see the
    // restricted-imports message above. Keep this list exactly as long as it
    // needs to be, no longer.
    files: [
      "src/server.ts",
      "src/lib/payments/paynow.server.ts",
      "src/lib/payments/shop-paynow.server.ts",
      "src/lib/admin/admin.server.ts",
      "src/lib/account-deletion.server.ts",
      "src/lib/legal-acceptance.server.ts",
      "src/lib/team.server.ts",
      "src/lib/notifications.mail.server.ts",
      "src/integrations/supabase/client.server.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
