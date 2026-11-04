import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { COMMERCE_MODELS, isCommerceModel } from "@/lib/commerce-model";
import { readableError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import {
  getBookingSettingsFn,
  saveBusinessClosuresFn,
  saveBusinessHoursFn,
  setCommerceModelFn,
} from "@/lib/services.functions";

export const Route = createFileRoute("/_authenticated/settings/business")({
  head: () => ({ meta: [{ title: "Business | Kwetuu" }] }),
  component: BusinessSettings,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function defaultHours() {
  return WEEKDAYS.map((_, weekday) => ({
    weekday,
    isClosed: weekday === 0,
    openTime: "09:00",
    closeTime: "17:00",
  }));
}

function BusinessSettings() {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const canEdit = hasPermission(workspace.data, "business.settings");
  const loadSettings = useServerFn(getBookingSettingsFn);
  const saveHours = useServerFn(saveBusinessHoursFn);
  const saveModel = useServerFn(setCommerceModelFn);
  const saveClosures = useServerFn(saveBusinessClosuresFn);

  const settings = useQuery({
    queryKey: ["booking-settings", businessId],
    enabled: Boolean(businessId),
    queryFn: () => loadSettings({ data: { businessId: businessId! } }),
  });

  const [model, setModel] = useState("products");
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [hours, setHours] = useState(defaultHours());
  const [closures, setClosures] = useState<{ closedOn: string; reason: string }[]>([]);
  const [newClosedOn, setNewClosedOn] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    if (isCommerceModel(settings.data.commerceModel)) setModel(settings.data.commerceModel);
    setAutoConfirm(settings.data.autoConfirmBookings);
    if (settings.data.hours.length === 7) {
      setHours(
        settings.data.hours.map((row) => ({
          weekday: row.weekday,
          isClosed: row.isClosed,
          openTime: row.openTime,
          closeTime: row.closeTime,
        })),
      );
    }
    setClosures(
      (settings.data.closures ?? []).map((row) => ({
        closedOn: row.closedOn,
        reason: row.reason ?? "",
      })),
    );
  }, [settings.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await saveModel({
        data: {
          businessId: businessId!,
          commerceModel: model as "products" | "services" | "hybrid",
        },
      });
      await saveHours({
        data: {
          businessId: businessId!,
          autoConfirmBookings: autoConfirm,
          hours,
        },
      });
      await saveClosures({
        data: { businessId: businessId!, dates: closures },
      });
    },
    onSuccess: async () => {
      toast.success("Business settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["booking-settings", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save settings.")),
  });

  return (
    <AppShell
      businessName={workspace.data?.business.name ?? ""}
      role={workspace.data?.role ?? ""}
      plan={workspace.data?.plan ?? ""}
      isReadOnly={workspace.data?.isReadOnly ?? false}
      billingEnabled={workspace.data?.billingEnabled ?? false}
      title="Business"
      subtitle="What you sell, opening hours, and booking rules."
    >
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">Your role cannot change these settings.</p>
      ) : (
        <div className="max-w-2xl space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">What you sell</h2>
            <p className="text-sm text-muted-foreground">
              This changes which screens are emphasised. You can still add products or services
              later.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {COMMERCE_MODELS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setModel(option.value)}
                  className={
                    model === option.value
                      ? "rounded-xl border-2 border-primary bg-accent px-3 py-3 text-left"
                      : "rounded-xl border border-border px-3 py-3 text-left hover:bg-muted"
                  }
                >
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Confirm bookings automatically</h2>
                <p className="text-sm text-muted-foreground">
                  Off means online requests stay pending until you approve them.
                </p>
              </div>
              <Switch checked={autoConfirm} onCheckedChange={setAutoConfirm} />
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Opening hours</h2>
            <div className="space-y-2">
              {hours.map((row) => (
                <div
                  key={row.weekday}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <p className="w-28 text-sm font-medium">{WEEKDAYS[row.weekday]}</p>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={row.isClosed}
                      onChange={(event) =>
                        setHours((prev) =>
                          prev.map((item) =>
                            item.weekday === row.weekday
                              ? { ...item, isClosed: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    Closed
                  </label>
                  {!row.isClosed ? (
                    <>
                      <Label className="sr-only">Opens</Label>
                      <input
                        type="time"
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                        value={row.openTime}
                        onChange={(event) =>
                          setHours((prev) =>
                            prev.map((item) =>
                              item.weekday === row.weekday
                                ? { ...item, openTime: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <input
                        type="time"
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                        value={row.closeTime}
                        onChange={(event) =>
                          setHours((prev) =>
                            prev.map((item) =>
                              item.weekday === row.weekday
                                ? { ...item, closeTime: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Closed days</h2>
            <p className="text-sm text-muted-foreground">
              Public holidays or days you are not taking bookings.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                value={newClosedOn}
                onChange={(event) => setNewClosedOn(event.target.value)}
                className="w-auto"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!newClosedOn) return;
                  setClosures((prev) =>
                    prev.some((row) => row.closedOn === newClosedOn)
                      ? prev
                      : [...prev, { closedOn: newClosedOn, reason: "" }].sort((a, b) =>
                          a.closedOn.localeCompare(b.closedOn),
                        ),
                  );
                  setNewClosedOn("");
                }}
              >
                Add day
              </Button>
            </div>
            {closures.length > 0 ? (
              <ul className="space-y-2">
                {closures.map((row) => (
                  <li
                    key={row.closedOn}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <p className="w-32 text-sm font-medium">{row.closedOn}</p>
                    <Input
                      placeholder="Reason (optional)"
                      value={row.reason}
                      onChange={(event) =>
                        setClosures((prev) =>
                          prev.map((item) =>
                            item.closedOn === row.closedOn
                              ? { ...item, reason: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setClosures((prev) => prev.filter((item) => item.closedOn !== row.closedOn))
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </AppShell>
  );
}
