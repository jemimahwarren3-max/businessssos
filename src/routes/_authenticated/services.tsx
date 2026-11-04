import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Briefcase, Loader2, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DeferredImage } from "@/components/deferred-image";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/use-debounce";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { addCategory, getCategories, getTeamMembersFn } from "@/lib/business.functions";
import { formatMoney, readableError } from "@/lib/format";
import { optimizeProductImage } from "@/lib/product-image-optimizer";
import {
  archiveServiceFn,
  createServiceFn,
  listServicesFn,
  updateServiceFn,
  uploadServiceImageFn,
} from "@/lib/services.functions";
import { serviceSchema } from "@/lib/services.schemas";
import type { ServiceRow } from "@/lib/services.server";

export const Route = createFileRoute("/_authenticated/services")({
  head: () => ({
    meta: [
      { title: "Services | Kwetuu" },
      {
        name: "description",
        content: "Create services, prices, durations, and who can deliver them.",
      },
    ],
  }),
  component: ServicesPage,
});

const EMPTY = {
  name: "",
  description: "",
  categoryId: "",
  price: "0",
  durationMinutes: "60",
  pricingType: "fixed" as "fixed" | "quote",
  requiresBooking: true,
  published: false,
  isActive: true,
  staffMemberIds: [] as string[],
};

function ServicesPage() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canManage = hasPermission(workspace.data, "services.manage");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ServiceRow | null>(null);
  const [newCategory, setNewCategory] = useState("");

  const fetchServices = useServerFn(listServicesFn);
  const createService = useServerFn(createServiceFn);
  const updateService = useServerFn(updateServiceFn);
  const archiveService = useServerFn(archiveServiceFn);
  const uploadPhoto = useServerFn(uploadServiceImageFn);
  const fetchCategories = useServerFn(getCategories);
  const createCategoryFn = useServerFn(addCategory);
  const fetchTeam = useServerFn(getTeamMembersFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const services = useQuery({
    queryKey: ["services", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchServices({ data: { businessId: businessId!, includeArchived: false } }),
  });
  const categories = useQuery({
    queryKey: ["categories", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchCategories({ data: { businessId: businessId! } }),
  });
  const team = useQuery({
    queryKey: ["team", businessId],
    enabled: Boolean(businessId) && open && hasPermission(workspace.data, "users.view"),
    queryFn: () => fetchTeam({ data: { businessId: businessId! } }),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setPhoto(null);
    setOpen(true);
  }

  function openEdit(row: ServiceRow) {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description ?? "",
      categoryId: row.categoryId ?? "",
      price: String(row.price),
      durationMinutes: String(row.durationMinutes),
      pricingType: row.pricingType,
      requiresBooking: row.requiresBooking,
      published: row.published,
      isActive: row.isActive,
      staffMemberIds: row.staffMemberIds ?? [],
    });
    setPhoto(null);
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = serviceSchema.parse({
        businessId,
        name: form.name,
        description: form.description,
        categoryId: form.categoryId,
        price: form.price,
        durationMinutes: form.durationMinutes,
        pricingType: form.pricingType,
        requiresBooking: form.requiresBooking,
        published: form.published,
        isActive: form.isActive,
        staffMemberIds: form.staffMemberIds,
      });
      let serviceId = editing?.id;
      if (editing) {
        await updateService({ data: { ...parsed, serviceId: editing.id } });
      } else {
        const created = await createService({ data: parsed });
        serviceId = created.id;
      }
      if (photo && serviceId) {
        const optimized = await optimizeProductImage(photo);
        const payload = new FormData();
        payload.set("businessId", businessId!);
        payload.set("serviceId", serviceId);
        payload.set("file", optimized);
        await uploadPhoto({ data: payload });
      }
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success(editing ? "Service updated." : "Service added.");
      await queryClient.invalidateQueries({ queryKey: ["services", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save that service.")),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!archiveTarget) throw new Error("No service selected");
      await archiveService({ data: { businessId: businessId!, serviceId: archiveTarget.id } });
    },
    onSuccess: async () => {
      setArchiveTarget(null);
      toast.success("Service archived.");
      await queryClient.invalidateQueries({ queryKey: ["services", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not archive that service.")),
  });

  const addCategoryMutation = useMutation({
    mutationFn: async () => {
      const name = newCategory.trim();
      if (!name) throw new Error("Enter a category name.");
      return createCategoryFn({ data: { businessId: businessId!, name } });
    },
    onSuccess: async (created) => {
      setNewCategory("");
      setForm((prev) => ({ ...prev, categoryId: created.id }));
      toast.success("Category added.");
      await queryClient.invalidateQueries({ queryKey: ["categories", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not add category.")),
  });

  const rows = (services.data ?? []).filter((row) => {
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      row.name.toLowerCase().includes(q) ||
      (row.categoryName ?? "").toLowerCase().includes(q) ||
      (row.description ?? "").toLowerCase().includes(q)
    );
  });

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
      title="Services"
      subtitle="What you offer, how long it takes, and who delivers it. Services do not use stock."
      actions={
        canManage ? (
          <Button className="gap-1.5" onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" /> Add service
          </Button>
        ) : null
      }
    >
      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search services"
          className="pl-9"
          aria-label="Search services"
        />
      </div>

      {services.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="surface px-6 py-16 text-center">
          <Briefcase className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">No services yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Add hair, repairs, consultations, or any other offering. They will not reduce stock when
            sold.
          </p>
          {canManage ? (
            <Button className="mt-4 gap-1.5" onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" /> Add your first service
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {row.imageUrl ? (
                  <DeferredImage src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[11px] text-muted-foreground">
                    No photo
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{row.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {row.categoryName ? `${row.categoryName} · ` : ""}
                  {row.durationMinutes} min
                  {row.pricingType === "quote"
                    ? " · Quote"
                    : ` · ${formatMoney(row.price, currency)}`}
                  {row.published ? " · On storefront" : " · Hidden"}
                  {row.isActive ? "" : " · Off"}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(row)}>
                    Archive
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Need opening hours or booking rules?{" "}
        <Link to="/settings/business" className="font-medium text-primary underline">
          Open business settings
        </Link>
        .
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit service" : "Add a service"}</DialogTitle>
            <DialogDescription>
              Services are not inventory. Completing one will not reduce stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="service-name">Service name</Label>
              <Input
                id="service-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-description">Description</Label>
              <Textarea
                id="service-description"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.categoryId || "__none"}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, categoryId: value === "__none" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No category</SelectItem>
                    {(categories.data ?? []).map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input
                    placeholder="New category"
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={addCategoryMutation.isPending}
                    onClick={() => addCategoryMutation.mutate()}
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="service-duration">Duration (minutes)</Label>
                <Input
                  id="service-duration"
                  type="number"
                  min={5}
                  max={1440}
                  value={form.durationMinutes}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pricing</Label>
                <Select
                  value={form.pricingType}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, pricingType: value as "fixed" | "quote" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed price</SelectItem>
                    <SelectItem value="quote">Quotation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="service-price">
                  {form.pricingType === "quote" ? "From price (optional)" : "Price"}
                </Label>
                <Input
                  id="service-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-photo">Photo</Label>
              <Input
                id="service-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
            </div>
            {(team.data ?? []).length > 0 ? (
              <div className="space-y-2">
                <Label>Assigned staff</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {(team.data ?? []).map((member) => {
                    const label = member.staff_name || member.full_name || member.email;
                    const checked = form.staffMemberIds.includes(member.id);
                    return (
                      <label key={member.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              staffMemberIds: event.target.checked
                                ? [...prev.staffMemberIds, member.id]
                                : prev.staffMemberIds.filter((id) => id !== member.id),
                            }))
                          }
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Needs a booking</p>
                <p className="text-xs text-muted-foreground">
                  Off means customers send a request instead of picking a time.
                </p>
              </div>
              <Switch
                checked={form.requiresBooking}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, requiresBooking: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Show on storefront</p>
                <p className="text-xs text-muted-foreground">
                  Only published, active services appear on your shop.
                </p>
              </div>
              <Switch
                checked={form.published}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, published: checked }))}
              />
            </div>
            {editing ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Available</p>
                  <p className="text-xs text-muted-foreground">Turn off to pause new bookings.</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {editing ? "Save" : "Add service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will leave your catalogue. Past bookings stay in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
