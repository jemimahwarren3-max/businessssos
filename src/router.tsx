import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import {
  configuredPlatformRoot,
  rewriteStoreInputUrl,
  rewriteStoreOutputUrl,
} from "./lib/storefront/host";
import { captureError, initSentry } from "./lib/monitoring/sentry";

// Browser-only — the server side of error reporting is error-capture.ts,
// which is specifically about recovering h3-swallowed SSR errors and has no
// equivalent concept client-side. This just catches whatever a global
// window listener can: uncaught throws and unhandled promise rejections
// that happen after hydration.
let clientListenersInstalled = false;
function installClientErrorListeners() {
  if (clientListenersInstalled || typeof window === "undefined") return;
  clientListenersInstalled = true;
  void initSentry();
  window.addEventListener("error", (event) => void captureError(event.error ?? event));
  window.addEventListener("unhandledrejection", (event) => void captureError(event.reason));
}

export const getRouter = () => {
  installClientErrorListeners();
  const queryClient = new QueryClient();

  const platform = configuredPlatformRoot();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(platform
      ? {
          rewrite: {
            input: ({ url }) => rewriteStoreInputUrl(url, platform.hostname),
            output: ({ url }) => rewriteStoreOutputUrl(url, platform.hostname),
          },
        }
      : {}),
  });

  return router;
};
