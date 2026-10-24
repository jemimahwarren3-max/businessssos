import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { recordStorefrontEventFn } from "@/lib/storefront/storefront.functions";
import type { StorefrontEventInput } from "@/lib/growth.contract";

type Consent = "unset" | "accepted" | "declined";
type EventType = StorefrontEventInput["eventType"];
type AnalyticsContextValue = {
  track: (eventType: EventType, productSlug?: string) => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue>({
  track: () => undefined,
});

const CONSENT_KEY = (slug: string) => `kwetuu-analytics-consent:${slug}`;
const VISITOR_KEY = (slug: string) => `kwetuu-analytics-visitor:${slug}`;
const ATTRIBUTION_KEY = (slug: string) => `kwetuu-analytics-attribution:${slug}`;
const SESSION_SOURCE_KEY = (slug: string) => `kwetuu-analytics-source:${slug}`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_VALUES = [
  "direct",
  "whatsapp",
  "instagram",
  "facebook",
  "tiktok",
  "google",
  "email",
  "referral",
  "other",
] as const;

function sourceFromHost(host: string) {
  const value = host.toLowerCase();
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook") || value.includes("fb.")) return "facebook";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("google")) return "google";
  return "referral";
}

function readVisitorId(slug: string) {
  try {
    const stored = localStorage.getItem(VISITOR_KEY(slug));
    if (stored && UUID_PATTERN.test(stored)) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY(slug), created);
    return created;
  } catch (error) {
    console.error("[store analytics] anonymous visitor storage unavailable", error);
    return null;
  }
}

function readAttribution(slug: string) {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY(slug));
    if (raw) {
      const value = JSON.parse(raw) as { campaignId?: string; source?: string; expiresAt?: number };
      if (typeof value.expiresAt === "number" && value.expiresAt > Date.now()) {
        return {
          campaignId:
            value.campaignId && UUID_PATTERN.test(value.campaignId) ? value.campaignId : undefined,
          source: SOURCE_VALUES.includes(value.source as (typeof SOURCE_VALUES)[number])
            ? (value.source as StorefrontEventInput["source"])
            : "direct",
        };
      }
      localStorage.removeItem(ATTRIBUTION_KEY(slug));
    }
    const source = sessionStorage.getItem(SESSION_SOURCE_KEY(slug));
    return {
      campaignId: undefined,
      source: SOURCE_VALUES.includes(source as (typeof SOURCE_VALUES)[number])
        ? (source as StorefrontEventInput["source"])
        : "direct",
    };
  } catch (error) {
    console.error("[store analytics] attribution storage unavailable", error);
    return { campaignId: undefined, source: "direct" as const };
  }
}

function captureAttribution(slug: string, searchStr: string) {
  try {
    const params = new URLSearchParams(searchStr);
    const sourceParam = params.get("utm_source")?.toLowerCase();
    const source = SOURCE_VALUES.includes(sourceParam as (typeof SOURCE_VALUES)[number])
      ? (sourceParam as StorefrontEventInput["source"])
      : document.referrer
        ? sourceFromHost(new URL(document.referrer).hostname)
        : "direct";
    sessionStorage.setItem(SESSION_SOURCE_KEY(slug), source);

    const campaignId = params.get("utm_campaign");
    if (campaignId && UUID_PATTERN.test(campaignId)) {
      localStorage.setItem(
        ATTRIBUTION_KEY(slug),
        JSON.stringify({
          campaignId,
          source,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        }),
      );
    }
  } catch (error) {
    console.error("[store analytics] could not capture campaign attribution", error);
  }
}

export function readStoreCampaignId(slug: string) {
  if (typeof window === "undefined") return undefined;
  try {
    if (localStorage.getItem(CONSENT_KEY(slug)) !== "accepted") return undefined;
  } catch (error) {
    console.error("[store analytics] could not read analytics consent", error);
    return undefined;
  }
  return readAttribution(slug).campaignId;
}

export function readStoreAnalyticsVisitorId(slug: string) {
  if (typeof window === "undefined") return undefined;
  try {
    if (localStorage.getItem(CONSENT_KEY(slug)) !== "accepted") return undefined;
    const stored = localStorage.getItem(VISITOR_KEY(slug));
    return stored && UUID_PATTERN.test(stored) ? stored : undefined;
  } catch (error) {
    console.error("[store analytics] could not read anonymous visitor ID", error);
    return undefined;
  }
}

export function StoreAnalyticsProvider({
  slug,
  preview,
  children,
}: {
  slug: string;
  preview: boolean;
  children: React.ReactNode;
}) {
  const recordEvent = useServerFn(recordStorefrontEventFn);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const [consent, setConsent] = useState<Consent>("unset");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY(slug));
      setConsent(stored === "accepted" || stored === "declined" ? stored : "unset");
    } catch (error) {
      console.error("[store analytics] could not load analytics consent", error);
      setConsent("declined");
    }
    setReady(true);
  }, [slug]);

  const track = useCallback(
    (eventType: EventType, productSlug?: string) => {
      if (preview || consent !== "accepted") return;
      const visitorId = readVisitorId(slug);
      if (!visitorId) return;
      const attribution = readAttribution(slug);
      const event: StorefrontEventInput = {
        slug,
        eventKey: crypto.randomUUID(),
        visitorId,
        eventType,
        source: attribution.source,
        ...(productSlug ? { productSlug } : {}),
        ...(attribution.campaignId ? { campaignId: attribution.campaignId } : {}),
      };
      void recordEvent({ data: event }).catch((error: unknown) => {
        console.error("[store analytics] event could not be recorded", error);
      });
    },
    [consent, preview, recordEvent, slug],
  );

  useEffect(() => {
    if (!ready || preview || consent !== "accepted") return;
    captureAttribution(slug, searchStr);
    const productMatch = pathname.match(/\/products\/([^/]+)$/);
    const productSlug = productMatch ? decodeURIComponent(productMatch[1]!) : undefined;
    track("page_view");
    if (productSlug) track("product_view", productSlug);
    if (pathname.endsWith("/checkout")) track("checkout_start");
  }, [consent, pathname, preview, ready, searchStr, slug, track]);

  function chooseConsent(choice: Exclude<Consent, "unset">) {
    try {
      localStorage.setItem(CONSENT_KEY(slug), choice);
      if (choice === "declined") {
        localStorage.removeItem(VISITOR_KEY(slug));
        localStorage.removeItem(ATTRIBUTION_KEY(slug));
        sessionStorage.removeItem(SESSION_SOURCE_KEY(slug));
      }
      setConsent(choice);
    } catch (error) {
      console.error("[store analytics] could not save analytics choice", error);
      setConsent("declined");
    }
  }

  return (
    <AnalyticsContext.Provider value={{ track }}>
      {children}
      {!preview && ready && consent === "unset" ? (
        <aside
          aria-label="Analytics privacy choices"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border border-border bg-background p-4 text-foreground shadow-xl"
        >
          <p className="text-sm font-semibold">Help this shop understand its visitors?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional anonymous analytics count visits and campaign activity. No names, ad pixels, or
            device fingerprints are collected. You can decline.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm"
              onClick={() => chooseConsent("declined")}
            >
              Decline
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              onClick={() => chooseConsent("accepted")}
            >
              Allow anonymous analytics
            </button>
          </div>
        </aside>
      ) : null}
      {!preview && ready && consent !== "unset" ? (
        <button
          type="button"
          className="fixed bottom-3 left-3 z-40 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow"
          onClick={() => {
            setConsent("unset");
          }}
        >
          Analytics privacy
        </button>
      ) : null}
    </AnalyticsContext.Provider>
  );
}

export function useStoreAnalytics() {
  return useContext(AnalyticsContext);
}
