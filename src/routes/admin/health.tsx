import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminHealthFn } from "@/lib/admin/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/health")({
  component: AdminHealthPage,
});

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border py-3 text-sm last:border-0">
      <span className="font-medium">{label}</span>
      <div className="text-right">
        <Badge variant={ok ? "default" : "outline"}>{ok ? "OK" : "Check"}</Badge>
        {detail ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

function AdminHealthPage() {
  const fetch = useServerFn(getAdminHealthFn);
  const health = useQuery({ queryKey: ["admin-health"], queryFn: () => fetch() });

  return (
    <AdminShell title="Ops health">
      <p className="text-sm text-muted-foreground">
        Read-only checks for this Cloud Run revision. Secrets are never shown — only whether they
        appear to be set.
      </p>
      {health.isLoading ? <Skeleton className="h-48" /> : null}
      {health.data ? (
        <div className="surface divide-y p-4">
          <StatusRow label="APP_URL configured" ok={health.data.appUrlSet} />
          <StatusRow
            label="BILLING_ENABLED env"
            ok={health.data.billingEnabledEnv}
            detail="Works with platform_runtime.billing_enforced in System."
          />
          <StatusRow
            label="Resend email"
            ok={health.data.resend.configured}
            detail={health.data.resend.reason}
          />
          <StatusRow label="Paynow USD (Kwetuu billing)" ok={health.data.paynowUsd} />
          <StatusRow label="Paynow ZiG (Kwetuu billing)" ok={health.data.paynowZig} />
          <StatusRow
            label="MAIL_FLUSH_SECRET"
            ok={health.data.mailFlushSecretSet}
            detail="Needed for scheduled outbox flush via GitHub Actions."
          />
          <StatusRow
            label="Redis workspace cache"
            ok={health.data.redisConfigured}
            detail="Optional Upstash. Fail-open to Postgres when unset."
          />
          <StatusRow
            label="Groq API key"
            ok={health.data.groqConfigured}
            detail="AI features only. Core commerce does not need this."
          />
          <StatusRow
            label="Gemini API key"
            ok={health.data.geminiConfigured}
            detail="Optional second provider."
          />
          <StatusRow
            label="AI kill switch"
            ok={!health.data.aiDisabled}
            detail={
              health.data.aiDisabled
                ? "AI_DISABLED or AI_PROVIDER=off — shops and POS stay up."
                : "AI is allowed within daily quotas."
            }
          />
        </div>
      ) : null}
    </AdminShell>
  );
}
