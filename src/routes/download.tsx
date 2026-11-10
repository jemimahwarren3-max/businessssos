import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Chrome, Download, ShieldCheck, Store, Smartphone } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@/lib/brand";
import { getMerchantApkDownloadFn } from "@/lib/merchant-apk.functions";

export const Route = createFileRoute("/download")({
  loader: async () => {
    const apk = await getMerchantApkDownloadFn();
    return { apk };
  },
  head: () => ({
    meta: [
      { title: `Get Kwetuu for Android | ${BRAND.name}` },
      {
        name: "description",
        content:
          "Install Kwetuu like Telegram: download the Android APK or add the merchant app to your home screen from Chrome.",
      },
      { property: "og:title", content: `Get Kwetuu for Android | ${BRAND.name}` },
    ],
    links: [{ rel: "canonical", href: `${BRAND.appUrl}/download` }],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  const { apk } = Route.useLoaderData();

  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-5 py-12 md:py-16">
        <Intro />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <InstallCard
            title="Download APK"
            subtitle="Same idea as Telegram’s direct installer"
            icon={Download}
            badge="Android"
          >
            {apk.available ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Tap download, open the file, and allow install when Android asks. Good when Play
                  Store is not an option yet.
                </p>
                {apk.version ? <p className="text-sm font-medium">Build {apk.version}</p> : null}
                <Button asChild size="lg" className="mt-2 w-full gap-2">
                  <a href={apk.url} download rel="noopener noreferrer">
                    <Download className="size-4" aria-hidden="true" />
                    Download for Android
                  </a>
                </Button>
                {apk.sha256 ? (
                  <p className="break-all font-mono text-[10px] text-muted-foreground">
                    SHA-256: {apk.sha256}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  The next APK is being built. Use the web app option on the right now, or sign in
                  in Chrome.
                </p>
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link to="/auth" search={{ mode: "signin" }}>
                    Sign in in browser
                  </Link>
                </Button>
              </>
            )}
          </InstallCard>

          <InstallCard
            title="Web app on your phone"
            subtitle="Like opening Telegram in the browser, then pinning it"
            icon={Chrome}
            badge="No download"
          >
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>
                Open{" "}
                <a href={BRAND.appUrl} className="font-medium text-primary">
                  {BRAND.appUrl.replace(/^https?:\/\//, "")}
                </a>{" "}
                in Chrome.
              </li>
              <li>
                Menu (⋮) → <strong className="text-foreground">Add to Home screen</strong> or{" "}
                <strong className="text-foreground">Install app</strong>.
              </li>
              <li>Sign in. Sales, stock, and Quick add work like the desktop dashboard.</li>
            </ol>
            <Button asChild className="mt-4 w-full">
              <Link to="/auth" search={{ mode: "signin" }}>
                Open sign in
              </Link>
            </Button>
          </InstallCard>
        </div>

        <section className="surface mt-6 flex items-start gap-3 p-5 text-sm">
          <Store className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Google Play</p>
            <p className="mt-1 text-muted-foreground">
              Kwetuu on Play Store is planned. Until then, use the APK or the home-screen web app
              above. Both use the same login and live data.
            </p>
          </div>
        </section>

        <section className="mt-6 flex gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">
            Only install APKs from this page or an official Kwetuu release. The packaged app loads{" "}
            <code className="text-foreground">{BRAND.appUrl}/staff-login</code> so sessions stay on
            our servers, not a fake copy.
          </p>
        </section>
      </div>
    </MarketingShell>
  );
}

function Intro() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Smartphone className="size-10 text-primary" aria-hidden="true" />
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Two ways to install
        </h1>
      </div>
      <p className="mt-4 text-base text-muted-foreground">
        Pick what works on your phone: download the Android package, or add Kwetuu to your home
        screen from Chrome. Both are official; both sign in to the same shop.
      </p>
    </div>
  );
}

function InstallCard({
  title,
  subtitle,
  icon: Icon,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  children: ReactNode;
}) {
  return (
    <article className="surface flex h-full flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <Icon className="size-6 text-primary" aria-hidden="true" />
        <Badge variant="secondary">{badge}</Badge>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </article>
  );
}
