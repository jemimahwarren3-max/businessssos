import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Clock, Loader2, LogIn, LogOut, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  adjustTimeEntryFn,
  clockInFn,
  clockOutFn,
  deleteTimeEntryFn,
  getMyActiveShiftFn,
  getMyRecentShiftsFn,
  getTimeEntriesFn,
} from "@/lib/business.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/time-clock")({
  head: () => ({
    meta: [
      { title: "Time clock — BusinessOS AI" },
      { name: "description", content: "Clock in and out, and see the team's hours." },
    ],
  }),
  component: TimeClock,
});

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "14", label: "14 days" },
  { key: "30", label: "30 days" },
];

function friendlyTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toLocalInputValue(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function durationLabel(start: string, end: string | null) {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function TimeClock() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const canViewTeam = hasPermission(workspace.data, "roles.manage");

  const [note, setNote] = useState("");
  const [range, setRange] = useState("14");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [, forceTick] = useState(0);

  const fetchActive = useServerFn(getMyActiveShiftFn);
  const fetchRecent = useServerFn(getMyRecentShiftsFn);
  const fetchTeam = useServerFn(getTimeEntriesFn);
  const clockInServerFn = useServerFn(clockInFn);
  const clockOutServerFn = useServerFn(clockOutFn);
  const adjustFn = useServerFn(adjustTimeEntryFn);
  const removeFn = useServerFn(deleteTimeEntryFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  // Ticks the elapsed-time display for an open shift once a minute.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const active = useQuery({
    queryKey: ["my-active-shift", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchActive({ data: { businessId: businessId! } }),
  });

  const recent = useQuery({
    queryKey: ["my-shifts", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchRecent({ data: { businessId: businessId! } }),
  });

  const team = useQuery({
    queryKey: ["team-timesheets", businessId, range],
    enabled: Boolean(businessId) && canViewTeam,
    queryFn: () => fetchTeam({ data: { businessId: businessId!, days: Number(range) } }),
  });

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-active-shift", businessId] }),
      queryClient.invalidateQueries({ queryKey: ["my-shifts", businessId] }),
      queryClient.invalidateQueries({ queryKey: ["team-timesheets", businessId] }),
    ]);
  }

  const clockInMutation = useMutation({
    mutationFn: () => clockInServerFn({ data: { businessId: businessId!, note } }),
    onSuccess: async () => {
      toast.success("Clocked in.");
      setNote("");
      await refreshAll();
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't clock in.")),
  });

  const clockOutMutation = useMutation({
    mutationFn: () => clockOutServerFn({ data: { businessId: businessId! } }),
    onSuccess: async () => {
      toast.success("Clocked out.");
      await refreshAll();
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't clock out.")),
  });

  const adjustMutation = useMutation({
    mutationFn: (input: { entryId: string; clockIn: string; clockOut: string }) =>
      adjustFn({
        data: {
          businessId: businessId!,
          entryId: input.entryId,
          clockIn: new Date(input.clockIn).toISOString(),
          clockOut: new Date(input.clockOut).toISOString(),
        },
      }),
    onSuccess: async () => {
      toast.success("Entry updated.");
      setEditingId(null);
      await refreshAll();
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't update that entry.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => removeFn({ data: { businessId: businessId!, entryId } }),
    onSuccess: async () => {
      toast.success("Entry deleted.");
      await refreshAll();
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't delete that entry.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const shift = active.data ?? null;

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Time clock"
      subtitle="Clock in and out, and see the team's hours."
    >
      <div className="surface mb-4 max-w-xl p-6 text-center">
        {active.isLoading ? (
          <Skeleton className="mx-auto h-24 w-full" />
        ) : shift ? (
          <>
            <Clock className="mx-auto size-8 text-success" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              Clocked in since {friendlyTime(shift.clock_in)}
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {durationLabel(shift.clock_in, null)}
            </p>
            <Button
              variant="destructive"
              className="mt-4 gap-1.5"
              disabled={clockOutMutation.isPending}
              onClick={() => clockOutMutation.mutate()}
            >
              {clockOutMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="size-4" aria-hidden="true" />
              )}
              Clock out
            </Button>
          </>
        ) : (
          <>
            <Clock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">You're clocked out.</p>
            <div className="mx-auto mt-4 max-w-xs space-y-1.5 text-left">
              <Label htmlFor="clock-note">Note (optional)</Label>
              <Input
                id="clock-note"
                placeholder="e.g. Morning shift"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button
              className="mt-4 gap-1.5"
              disabled={clockInMutation.isPending}
              onClick={() => clockInMutation.mutate()}
            >
              {clockInMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="size-4" aria-hidden="true" />
              )}
              Clock in
            </Button>
          </>
        )}
      </div>

      <div className="surface mb-6 max-w-xl overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Your recent shifts</h2>
        </div>
        {recent.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (recent.data ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No shifts recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(recent.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-muted-foreground">
                  {friendlyTime(s.clock_in)}
                  {s.clock_out ? ` – ${friendlyTime(s.clock_out)}` : " (in progress)"}
                  {s.note ? ` · ${s.note}` : ""}
                </span>
                <span className="tabular-nums font-medium">
                  {durationLabel(s.clock_in, s.clock_out)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canViewTeam ? (
        <div className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Team timesheets</h2>
            <Tabs value={range} onValueChange={setRange}>
              <TabsList>
                {RANGES.map((r) => (
                  <TabsTrigger key={r.key} value={r.key} className="text-[12px]">
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {team.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (team.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No shifts in this period.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Team member</th>
                  <th className="px-5 py-3 font-medium">Shift</th>
                  <th className="px-5 py-3 font-medium">Hours</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(team.data ?? []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-3 font-medium">{entry.display_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {editingId === entry.id ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Input
                            type="datetime-local"
                            value={editIn}
                            onChange={(e) => setEditIn(e.target.value)}
                            className="h-8 w-44"
                          />
                          <span>–</span>
                          <Input
                            type="datetime-local"
                            value={editOut}
                            onChange={(e) => setEditOut(e.target.value)}
                            className="h-8 w-44"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            disabled={adjustMutation.isPending}
                            onClick={() =>
                              adjustMutation.mutate({
                                entryId: entry.id,
                                clockIn: editIn,
                                clockOut: editOut,
                              })
                            }
                          >
                            {adjustMutation.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Check className="size-3.5" aria-hidden="true" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span>
                          {friendlyTime(entry.clock_in)}
                          {entry.clock_out ? ` – ${friendlyTime(entry.clock_out)}` : " (open)"}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums">
                      {durationLabel(entry.clock_in, entry.clock_out)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        {entry.clock_out ? (
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-8"
                            aria-label="Edit"
                            onClick={() => {
                              setEditingId(entry.id);
                              setEditIn(toLocalInputValue(entry.clock_in));
                              setEditOut(toLocalInputValue(entry.clock_out!));
                            }}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-8"
                          aria-label="Delete"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm("Delete this time entry? This can't be undone.")) {
                              deleteMutation.mutate(entry.id);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </AppShell>
  );
}
