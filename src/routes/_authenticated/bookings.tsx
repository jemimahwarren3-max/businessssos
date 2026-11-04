import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { getTeamMembersFn } from "@/lib/business.functions";
import { friendlyDateTime, readableError } from "@/lib/format";
import {
  createBookingFn,
  getStaffHoursFn,
  listBookingSlotsFn,
  listBookingsFn,
  listServiceRequestsFn,
  listServicesFn,
  rescheduleBookingFn,
  saveStaffHoursFn,
  setBookingStatusFn,
  setServiceRequestStatusFn,
} from "@/lib/services.functions";
import { bookingSchema, bookingStatusSchema } from "@/lib/services.schemas";
import type { BookingRow } from "@/lib/services.server";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings | Kwetuu" },
      { name: "description", content: "Appointments, walk-ins, and quotation requests." },
    ],
  }),
  component: BookingsPage,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const REQUEST_LABEL: Record<string, string> = {
  pending: "Pending",
  quoted: "Quoted",
  accepted: "Accepted",
  declined: "Declined",
  converted: "Converted",
};

type View = "day" | "week" | "month";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeFor(view: View, anchor: Date) {
  const day = startOfDay(anchor);
  if (view === "day") return { from: day, to: addDays(day, 1) };
  if (view === "week") {
    const start = addDays(day, -day.getDay());
    return { from: start, to: addDays(start, 7) };
  }
  const start = new Date(day.getFullYear(), day.getMonth(), 1);
  const to = new Date(day.getFullYear(), day.getMonth() + 1, 1);
  return { from: start, to };
}

function defaultHours() {
  return WEEKDAYS.map((_, weekday) => ({
    weekday,
    isClosed: weekday === 0,
    openTime: "09:00",
    closeTime: "17:00",
  }));
}

function BookingsPage() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const canManage = hasPermission(workspace.data, "bookings.manage");

  const [section, setSection] = useState<"calendar" | "requests" | "staff">("calendar");
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [reschedule, setReschedule] = useState<BookingRow | null>(null);
  const [form, setForm] = useState({
    serviceId: "",
    memberId: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    on: isoDate(new Date()),
    startsAt: "",
    notes: "",
    source: "walk_in" as "walk_in" | "phone" | "pos",
  });
  const [rescheduleOn, setRescheduleOn] = useState("");
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [hoursMember, setHoursMember] = useState("");
  const [staffHours, setStaffHours] = useState(defaultHours());

  const fetchBookings = useServerFn(listBookingsFn);
  const fetchServices = useServerFn(listServicesFn);
  const fetchTeam = useServerFn(getTeamMembersFn);
  const fetchSlots = useServerFn(listBookingSlotsFn);
  const createBooking = useServerFn(createBookingFn);
  const setStatus = useServerFn(setBookingStatusFn);
  const rescheduleFn = useServerFn(rescheduleBookingFn);
  const fetchRequests = useServerFn(listServiceRequestsFn);
  const setRequestStatus = useServerFn(setServiceRequestStatusFn);
  const loadStaffHours = useServerFn(getStaffHoursFn);
  const saveStaffHours = useServerFn(saveStaffHoursFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const { from, to } = rangeFor(view, anchor);
  const bookings = useQuery({
    queryKey: ["bookings", businessId, from.toISOString(), to.toISOString(), statusFilter],
    enabled: Boolean(businessId),
    queryFn: () =>
      fetchBookings({
        data: {
          businessId: businessId!,
          from: from.toISOString(),
          to: to.toISOString(),
          ...(statusFilter !== "all" ? { status: bookingStatusSchema.parse(statusFilter) } : {}),
        },
      }),
  });
  const services = useQuery({
    queryKey: ["services", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchServices({ data: { businessId: businessId!, includeArchived: false } }),
  });
  const team = useQuery({
    queryKey: ["team", businessId],
    enabled: Boolean(businessId) && hasPermission(workspace.data, "users.view"),
    queryFn: () => fetchTeam({ data: { businessId: businessId! } }),
  });
  const requests = useQuery({
    queryKey: ["service-requests", businessId],
    enabled: Boolean(businessId) && section === "requests",
    queryFn: () => fetchRequests({ data: { businessId: businessId! } }),
  });
  const createSlots = useQuery({
    queryKey: ["booking-slots", businessId, form.serviceId, form.on, form.memberId],
    enabled: Boolean(businessId) && Boolean(form.serviceId) && createOpen,
    queryFn: () =>
      fetchSlots({
        data: {
          businessId: businessId!,
          serviceId: form.serviceId,
          on: form.on,
          memberId: form.memberId,
        },
      }),
  });
  const rescheduleSlots = useQuery({
    queryKey: [
      "booking-slots",
      businessId,
      reschedule?.serviceId,
      rescheduleOn,
      reschedule?.memberId,
    ],
    enabled: Boolean(businessId) && Boolean(reschedule) && Boolean(rescheduleOn),
    queryFn: () =>
      fetchSlots({
        data: {
          businessId: businessId!,
          serviceId: reschedule!.serviceId,
          on: rescheduleOn,
          memberId: reschedule?.memberId ?? "",
        },
      }),
  });

  useEffect(() => {
    if (!hoursMember || !businessId) return;
    void loadStaffHours({ data: { businessId, memberId: hoursMember } }).then((hours) => {
      if (hours.length === 7) {
        setStaffHours(
          hours.map((row) => ({
            weekday: row.weekday,
            isClosed: row.isClosed,
            openTime: row.openTime,
            closeTime: row.closeTime,
          })),
        );
      } else {
        setStaffHours(defaultHours());
      }
    });
  }, [hoursMember, businessId, loadStaffHours]);

  const grouped = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const row of bookings.data ?? []) {
      const key = isoDate(new Date(row.startsAt));
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [bookings.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = bookingSchema.parse({
        businessId,
        serviceId: form.serviceId,
        memberId: form.memberId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail,
        startsAt: form.startsAt,
        notes: form.notes,
        source: form.source,
      });
      return createBooking({ data: parsed });
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setForm({
        serviceId: "",
        memberId: "",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        on: isoDate(new Date()),
        startsAt: "",
        notes: "",
        source: "walk_in",
      });
      toast.success("Appointment saved.");
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save that booking.")),
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { bookingId: string; status: string }) =>
      setStatus({
        data: {
          businessId: businessId!,
          bookingId: input.bookingId,
          status: bookingStatusSchema.parse(input.status),
        },
      }),
    onSuccess: async () => {
      toast.success("Booking updated.");
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not update that booking.")),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!reschedule) throw new Error("No booking selected");
      await rescheduleFn({
        data: {
          businessId: businessId!,
          bookingId: reschedule.id,
          startsAt: rescheduleAt,
          memberId: reschedule.memberId ?? "",
        },
      });
    },
    onSuccess: async () => {
      setReschedule(null);
      toast.success("Booking moved.");
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not reschedule.")),
  });

  const requestMutation = useMutation({
    mutationFn: async (input: { requestId: string; status: string }) =>
      setRequestStatus({
        data: {
          businessId: businessId!,
          requestId: input.requestId,
          status: input.status as "pending" | "quoted" | "accepted" | "declined" | "converted",
        },
      }),
    onSuccess: async () => {
      toast.success("Request updated.");
      await queryClient.invalidateQueries({ queryKey: ["service-requests", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not update that request.")),
  });

  const hoursMutation = useMutation({
    mutationFn: async () => {
      if (!hoursMember) throw new Error("Pick a staff member.");
      await saveStaffHours({
        data: { businessId: businessId!, memberId: hoursMember, hours: staffHours },
      });
    },
    onSuccess: () => toast.success("Staff hours saved."),
    onError: (error: Error) => toast.error(readableError(error, "Could not save staff hours.")),
  });

  const rangeLabel =
    view === "day"
      ? anchor.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
      : view === "week"
        ? `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(to, -1).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Bookings"
      subtitle="Appointments, walk-ins, and quotation requests."
      actions={
        canManage ? (
          <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> New appointment
          </Button>
        ) : null
      }
    >
      <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)}>
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="staff">Staff hours</TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "calendar" ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={(value) => setView(value as View)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setAnchor(addDays(anchor, view === "month" ? -28 : view === "week" ? -7 : -1))
              }
              aria-label="Previous"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <p className="min-w-40 text-sm font-medium">{rangeLabel}</p>
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setAnchor(addDays(anchor, view === "month" ? 28 : view === "week" ? 7 : 1))
              }
              aria-label="Next"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>
              Today
            </Button>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {bookings.isLoading ? (
            <Skeleton className="h-48" />
          ) : grouped.length === 0 ? (
            <div className="surface px-6 py-16 text-center">
              <CalendarDays className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">No appointments in this range</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                Create a walk-in, or wait for a customer booking from your storefront.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([day, rows]) => (
                <section key={day} className="surface p-4">
                  <h2 className="text-sm font-semibold">
                    {new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                  </h2>
                  <ul className="mt-3 divide-y divide-border">
                    {rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-start justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {friendlyDateTime(row.startsAt)} · {row.serviceName}
                          </p>
                          <p className="text-[13px] text-muted-foreground">
                            {row.customerName}
                            {row.customerPhone ? ` · ${row.customerPhone}` : ""}
                            {row.staffName ? ` · ${row.staffName}` : ""}
                            {` · ${STATUS_LABEL[row.status] ?? row.status}`}
                          </p>
                        </div>
                        {canManage ? (
                          <div className="flex flex-wrap gap-1.5">
                            {row.status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    statusMutation.mutate({
                                      bookingId: row.id,
                                      status: "confirmed",
                                    })
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    statusMutation.mutate({
                                      bookingId: row.id,
                                      status: "cancelled",
                                    })
                                  }
                                >
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            {row.status === "confirmed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  statusMutation.mutate({
                                    bookingId: row.id,
                                    status: "in_progress",
                                  })
                                }
                              >
                                Start
                              </Button>
                            ) : null}
                            {row.status === "in_progress" || row.status === "confirmed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  statusMutation.mutate({ bookingId: row.id, status: "completed" })
                                }
                              >
                                Complete
                              </Button>
                            ) : null}
                            {row.status === "confirmed" || row.status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReschedule(row);
                                    setRescheduleOn(isoDate(new Date(row.startsAt)));
                                    setRescheduleAt(row.startsAt);
                                  }}
                                >
                                  Reschedule
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    statusMutation.mutate({ bookingId: row.id, status: "no_show" })
                                  }
                                >
                                  No-show
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    statusMutation.mutate({
                                      bookingId: row.id,
                                      status: "cancelled",
                                    })
                                  }
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : null}
                            {row.status === "completed" && !row.saleId ? (
                              <Button asChild size="sm" variant="outline">
                                <Link to="/sales">Take payment</Link>
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {section === "requests" ? (
        <div className="mt-4">
          {requests.isLoading ? (
            <Skeleton className="h-40" />
          ) : (requests.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Quotation and walk-in style requests from your storefront will show here.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {(requests.data ?? []).map((row) => (
                <li key={row.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {row.customerName}
                        {row.serviceName ? ` · ${row.serviceName}` : ""}
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        {row.customerPhone ?? ""}
                        {row.preferredDate ? ` · preferred ${row.preferredDate}` : ""}
                        {` · ${REQUEST_LABEL[row.status] ?? row.status}`}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            requestMutation.mutate({ requestId: row.id, status: "quoted" })
                          }
                        >
                          Mark quoted
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            requestMutation.mutate({ requestId: row.id, status: "accepted" })
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            requestMutation.mutate({ requestId: row.id, status: "declined" })
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{row.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {section === "staff" ? (
        <div className="mt-4 max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Staff records stay on this business. If someone has no hours saved, bookings use the
            shop opening hours.
          </p>
          <div className="space-y-1.5">
            <Label>Staff member</Label>
            <Select
              value={hoursMember || "__none"}
              onValueChange={(value) => setHoursMember(value === "__none" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Choose staff</SelectItem>
                {(team.data ?? []).map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.staff_name || member.full_name || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hoursMember ? (
            <>
              <div className="space-y-2">
                {staffHours.map((row) => (
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
                          setStaffHours((prev) =>
                            prev.map((item) =>
                              item.weekday === row.weekday
                                ? { ...item, isClosed: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      Off
                    </label>
                    {!row.isClosed ? (
                      <>
                        <input
                          type="time"
                          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          value={row.openTime}
                          onChange={(event) =>
                            setStaffHours((prev) =>
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
                            setStaffHours((prev) =>
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
              <Button onClick={() => hoursMutation.mutate()} disabled={hoursMutation.isPending}>
                {hoursMutation.isPending ? "Saving…" : "Save hours"}
              </Button>
            </>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Invite or name staff on{" "}
            <Link to="/settings/team" className="font-medium text-primary underline">
              Team
            </Link>
            . Opening hours live under{" "}
            <Link to="/settings/business" className="font-medium text-primary underline">
              Business settings
            </Link>
            .
          </p>
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New appointment</DialogTitle>
            <DialogDescription>
              Walk-in, phone, or till bookings. Online requests arrive pending unless auto-confirm
              is on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select
                value={form.serviceId || "__none"}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    serviceId: value === "__none" ? "" : value,
                    startsAt: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Choose a service</SelectItem>
                  {(services.data ?? [])
                    .filter((row) => row.isActive)
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Staff (optional)</Label>
              <Select
                value={form.memberId || "__none"}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    memberId: value === "__none" ? "" : value,
                    startsAt: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Anyone available" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Anyone available</SelectItem>
                  {(team.data ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.staff_name || member.full_name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="booking-name">Customer name</Label>
                <Input
                  id="booking-name"
                  value={form.customerName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, customerName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-phone">Phone</Label>
                <Input
                  id="booking-phone"
                  value={form.customerPhone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, customerPhone: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="booking-date">Date</Label>
              <Input
                id="booking-date"
                type="date"
                value={form.on}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, on: event.target.value, startsAt: "" }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Available time</Label>
              {createSlots.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading times…</p>
              ) : (createSlots.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No free slots that day. Check opening hours or pick another date.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(createSlots.data ?? []).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, startsAt: slot }))}
                      className={
                        form.startsAt === slot
                          ? "rounded-md border-2 border-primary bg-accent px-2 py-1 text-xs font-medium"
                          : "rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                      }
                    >
                      {new Date(slot).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Africa/Harare",
                      })}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select
                value={form.source}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, source: value as typeof prev.source }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="pos">Till</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="booking-notes">Notes</Label>
              <Textarea
                id="booking-notes"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reschedule)} onOpenChange={() => setReschedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule</DialogTitle>
            <DialogDescription>{reschedule?.customerName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="date"
              value={rescheduleOn}
              onChange={(event) => {
                setRescheduleOn(event.target.value);
                setRescheduleAt("");
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {(rescheduleSlots.data ?? []).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setRescheduleAt(slot)}
                  className={
                    rescheduleAt === slot
                      ? "rounded-md border-2 border-primary bg-accent px-2 py-1 text-xs font-medium"
                      : "rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  }
                >
                  {new Date(slot).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Harare",
                  })}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedule(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => rescheduleMutation.mutate()}
              disabled={!rescheduleAt || rescheduleMutation.isPending}
            >
              Move booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
