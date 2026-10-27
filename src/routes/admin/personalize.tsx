import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminRuntimeFn, updateAdminRuntimeFn } from "@/lib/admin/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readableError } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/personalize")({
  component: AdminPersonalizePage,
});

function AdminPersonalizePage() {
  const queryClient = useQueryClient();
  const fetchRuntime = useServerFn(getAdminRuntimeFn);
  const saveRuntime = useServerFn(updateAdminRuntimeFn);
  const runtime = useQuery({
    queryKey: ["admin-runtime"],
    queryFn: () => fetchRuntime(),
  });
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [reason, setReason] = useState("");
  const [marketingReason, setMarketingReason] = useState("");

  useEffect(() => {
    if (runtime.data) {
      setMessage(runtime.data.public_announcement ?? "");
      setEnabled(runtime.data.announcement_enabled ?? false);
      setHeroTitle(runtime.data.marketing_hero_title ?? "");
      setHeroSubtitle(runtime.data.marketing_hero_subtitle ?? "");
    }
  }, [runtime.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveRuntime({
        data: {
          publicAnnouncement: message,
          announcementEnabled: enabled,
          reason,
        },
      }),
    onSuccess: async () => {
      toast.success("Merchant banner updated.");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-runtime"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-announcement"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save.")),
  });

  const saveMarketingMutation = useMutation({
    mutationFn: () =>
      saveRuntime({
        data: {
          marketingHeroTitle: heroTitle,
          marketingHeroSubtitle: heroSubtitle,
          reason: marketingReason,
        },
      }),
    onSuccess: async () => {
      toast.success("Public homepage copy updated.");
      setMarketingReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-runtime"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save.")),
  });

  return (
    <AdminShell title="Personalize">
      <p className="text-sm text-muted-foreground">
        Brand colours and logos live in code (`src/lib/brand.ts` and `src/styles.css`). Here you can
        broadcast a short message to every signed-in merchant.
      </p>
      {runtime.isLoading ? <Skeleton className="h-32" /> : null}
      <div className="surface max-w-xl space-y-4 p-5">
        <h2 className="text-sm font-semibold">Merchant app banner</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Show banner in the business dashboard shell
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="announcement">Message</Label>
          <Textarea
            id="announcement"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="e.g. Paynow maintenance tonight 22:00–23:00 Harare time."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason (audit)</Label>
          <Input id="reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <Button
          type="button"
          disabled={saveMutation.isPending || reason.trim().length < 3}
          onClick={() => saveMutation.mutate()}
        >
          Save banner
        </Button>
      </div>
      <div className="surface max-w-xl space-y-4 p-5">
        <h2 className="text-sm font-semibold">Public homepage hero</h2>
        <p className="text-xs text-muted-foreground">
          Leave blank to use the default marketing copy on kwetuu.com. HTML is not supported.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="hero-title">Headline</Label>
          <Input
            id="hero-title"
            maxLength={500}
            value={heroTitle}
            onChange={(e) => setHeroTitle(e.target.value)}
            placeholder="Run your business. Sell online. All in one place."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hero-sub">Subhead</Label>
          <Textarea
            id="hero-sub"
            rows={3}
            maxLength={800}
            value={heroSubtitle}
            onChange={(e) => setHeroSubtitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-reason">Reason (audit)</Label>
          <Input
            id="m-reason"
            value={marketingReason}
            onChange={(e) => setMarketingReason(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={saveMarketingMutation.isPending || marketingReason.trim().length < 3}
          onClick={() => saveMarketingMutation.mutate()}
        >
          Save homepage copy
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Pricing copy and ZiG display rate:{" "}
        <Link to="/admin/billing" className="font-medium text-primary underline">
          Billing & FX
        </Link>
        .
      </p>
    </AdminShell>
  );
}
