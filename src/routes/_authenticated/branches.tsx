import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  createLocationFn,
  deactivateLocationFn,
  getLocations,
  setDefaultLocationFn,
  updateLocationFn,
} from "@/lib/business.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [{ title: "Branches & locations | Kwetuu" }, { name: "robots", content: "noindex" }],
  }),
  component: BranchesPage,
});

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  is_default: boolean;
};

function BranchesPage() {
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const canManage = ["owner", "admin"].includes(workspace.data?.role ?? "");
  const queryClient = useQueryClient();
  const fetchLocations = useServerFn(getLocations);
  const createLocation = useServerFn(createLocationFn);
  const updateLocation = useServerFn(updateLocationFn);
  const setDefault = useServerFn(setDefaultLocationFn);
  const deactivate = useServerFn(deactivateLocationFn);

  const locations = useQuery({
    queryKey: ["locations", businessId, "all"],
    enabled: Boolean(businessId),
    queryFn: () =>
      fetchLocations({ data: { businessId: businessId!, includeInactive: true } }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const openCreate = () => {
    setEditing(null);
    setName("");
    setAddress("");
    setPhone("");
    setDialogOpen(true);
  };

  const openEdit = (loc: LocationRow) => {
    setEditing(loc);
    setName(loc.name);
    setAddress(loc.address ?? "");
    setPhone(loc.phone ?? "");
    setDialogOpen(true);
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["locations", businessId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("No business");
      if (editing) {
        await updateLocation({
          data: {
            businessId,
            locationId: editing.id,
            name: name.trim(),
            address,
            phone,
          },
        });
      } else {
        await createLocation({
          data: { businessId, name: name.trim(), address, phone },
        });
      }
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (locationId: string) =>
      setDefault({ data: { businessId: businessId!, locationId } }),
    onSuccess: invalidate,
  });

  const deactivateMutation = useMutation({
    mutationFn: (locationId: string) =>
      deactivate({ data: { businessId: businessId!, locationId } }),
    onSuccess: invalidate,
  });

  if (!workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Branches">
        <Skeleton className="h-32" />
      </AppShell>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Branches & locations"
      subtitle="Add shops or warehouses, set which branch POS uses by default, and track stock per location."
      actions={
        canManage && !workspace.data.isReadOnly ? (
          <Button type="button" onClick={openCreate}>
            Add branch
          </Button>
        ) : null
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        POS sales and stock adjustments use your <strong>default</strong> branch unless you pick a
        location elsewhere. Online collection points are configured in{" "}
        <Link to="/storefront" className="font-medium text-primary underline">
          My Online Store
        </Link>
        .
      </p>
      {locations.isLoading ? <Skeleton className="h-24" /> : null}
      {locations.isError ? (
        <p className="text-sm text-destructive">
          {readableError(locations.error as Error, "Locations could not be loaded.")}
        </p>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {(locations.data ?? []).length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">
            No locations yet. Your first branch is created automatically when you add products.
          </li>
        ) : null}
        {(locations.data ?? []).map((loc) => (
          <li key={loc.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
            <div className="space-y-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {loc.name}
                {loc.is_default ? <Badge variant="secondary">Default (POS)</Badge> : null}
                {!loc.is_active ? <Badge variant="outline">Inactive</Badge> : null}
              </p>
              {loc.address ? <p className="text-muted-foreground">{loc.address}</p> : null}
              {loc.phone ? <p className="text-muted-foreground">{loc.phone}</p> : null}
            </div>
            {canManage && !workspace.data?.isReadOnly && loc.is_active ? (
              <div className="flex flex-wrap gap-2">
                {!loc.is_default ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={defaultMutation.isPending}
                    onClick={() => defaultMutation.mutate(loc.id)}
                  >
                    Make default
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="outline" onClick={() => openEdit(loc)}>
                  Edit
                </Button>
                {!loc.is_default ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={deactivateMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Deactivate "${loc.name}"? Stock rows remain but the branch won't appear in day-to-day lists.`,
                        )
                      ) {
                        deactivateMutation.mutate(loc.id);
                      }
                    }}
                  >
                    Deactivate
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit branch" : "Add branch"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="branch-name">Name</Label>
              <Input
                id="branch-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Harare CBD"
              />
            </div>
            <div>
              <Label htmlFor="branch-address">Address (optional)</Label>
              <Input
                id="branch-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="branch-phone">Phone (optional)</Label>
              <Input
                id="branch-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            {saveMutation.isError ? (
              <p className="text-sm text-destructive">
                {readableError(saveMutation.error as Error, "Could not save branch.")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || name.trim().length < 1}
              onClick={() => saveMutation.mutate()}
            >
              {editing ? "Save" : "Add branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
