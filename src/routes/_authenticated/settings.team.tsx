import { Fragment, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, MessageCircle, Plus, Trash2, Users } from "lucide-react";
import { AppShell, ROLE_LABEL } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { getCurrentUser } from "@/lib/auth/auth.functions";
import {
  createInviteFn,
  createStaffAccountFn,
  getPendingInvitesFn,
  getPermissionCatalogFn,
  getRolePermissionsFn,
  getTeamMembersFn,
  removeTeamMemberFn,
  resetStaffPasswordFn,
  revokeInviteFn,
  setRolePermissionFn,
  setStaffPasswordFn,
  updateTeamMemberRoleFn,
} from "@/lib/business.functions";
import { friendlyDate, readableError } from "@/lib/format";
import { buildInviteWhatsAppMessage } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/settings/team")({
  head: () => ({
    meta: [{ title: "Team — BusinessOS AI" }],
  }),
  component: Team,
});

const TEAM_ROLES = ["owner", "admin", "manager", "cashier", "accountant"] as const;
// Owner is deliberately excluded — always has every permission, not editable.
const PERMISSION_ROLES = ["admin", "manager", "cashier", "accountant"] as const;

function Team() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const businessName = workspace.data?.business.name ?? "";
  const canManage = hasPermission(workspace.data, "users.view");
  const canManagePermissions = hasPermission(workspace.data, "roles.manage");

  const [section, setSection] = useState<"team" | "permissions">("team");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"link" | "staff">("link");
  const [inviteRole, setInviteRole] = useState<(typeof TEAM_ROLES)[number]>("cashier");
  const [inviteLink, setInviteLink] = useState<{ link: string; role: string } | null>(null);
  const [createdStaff, setCreatedStaff] = useState<{ name: string; role: string } | null>(null);
  const [staffName, setStaffName] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [shopPasswordOpen, setShopPasswordOpen] = useState(false);
  const [shopPassword, setShopPassword] = useState("");

  const fetchMembers = useServerFn(getTeamMembersFn);
  const fetchInvites = useServerFn(getPendingInvitesFn);
  const fetchCurrentUser = useServerFn(getCurrentUser);
  const createInvite = useServerFn(createInviteFn);
  const createStaff = useServerFn(createStaffAccountFn);
  const resetStaffPw = useServerFn(resetStaffPasswordFn);
  const setShopPasswordFn = useServerFn(setStaffPasswordFn);
  const revokeInvite = useServerFn(revokeInviteFn);
  const updateRole = useServerFn(updateTeamMemberRoleFn);
  const removeMember = useServerFn(removeTeamMemberFn);
  const fetchPermissionCatalog = useServerFn(getPermissionCatalogFn);
  const fetchRolePermissions = useServerFn(getRolePermissionsFn);
  const setPermission = useServerFn(setRolePermissionFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  useEffect(() => {
    fetchCurrentUser().then((user) => setCurrentUserId(user?.userId ?? null));
  }, [fetchCurrentUser]);

  const members = useQuery({
    queryKey: ["team-members", businessId],
    enabled: Boolean(businessId) && canManage,
    queryFn: () => fetchMembers({ data: { businessId: businessId! } }),
  });

  const invites = useQuery({
    queryKey: ["team-invites", businessId],
    enabled: Boolean(businessId) && canManage,
    queryFn: () => fetchInvites({ data: { businessId: businessId! } }),
  });

  const permissionCatalog = useQuery({
    queryKey: ["permission-catalog"],
    enabled: canManagePermissions,
    queryFn: () => fetchPermissionCatalog(),
  });

  const rolePermissions = useQuery({
    queryKey: ["role-permissions", businessId],
    enabled: Boolean(businessId) && canManagePermissions,
    queryFn: () => fetchRolePermissions({ data: { businessId: businessId! } }),
  });

  function linkFor(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  const inviteMutation = useMutation({
    mutationFn: () => createInvite({ data: { businessId: businessId!, role: inviteRole } }),
    onSuccess: async (result) => {
      setInviteLink({ link: linkFor(result.token), role: inviteRole });
      await queryClient.invalidateQueries({ queryKey: ["team-invites"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't create that invite.")),
  });

  const createStaffMutation = useMutation({
    mutationFn: () =>
      createStaff({
        data: {
          businessId: businessId!,
          displayName: staffName.trim(),
          password: staffPassword,
          role: inviteRole,
        },
      }),
    onSuccess: async () => {
      toast.success(`${staffName.trim()} was added.`);
      setCreatedStaff({ name: staffName.trim(), role: inviteRole });
      await queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't create that account.")),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () =>
      resetStaffPw({
        data: {
          businessId: businessId!,
          memberUserId: resetTarget!.userId,
          newPassword: resetPassword,
        },
      }),
    onSuccess: () => {
      toast.success("Password updated.");
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't reset that password.")),
  });

  const shopPasswordMutation = useMutation({
    mutationFn: () =>
      setShopPasswordFn({ data: { businessId: businessId!, password: shopPassword } }),
    onSuccess: () => {
      toast.success("Shop password set.");
      setShopPasswordOpen(false);
      setShopPassword("");
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't set the shop password.")),
  });

  const togglePermissionMutation = useMutation({
    mutationFn: (vars: { role: string; permissionKey: string; granted: boolean }) =>
      setPermission({
        data: {
          businessId: businessId!,
          role: vars.role as never,
          permissionKey: vars.permissionKey,
          granted: vars.granted,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["role-permissions", businessId] });
    },
    onError: (error: Error) => {
      toast.error(readableError(error, "Couldn't change that permission."));
      queryClient.invalidateQueries({ queryKey: ["role-permissions", businessId] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revokeInvite({ data: { businessId: businessId!, inviteId } }),
    onSuccess: async () => {
      toast.success("Invite cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["team-invites"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't cancel that invite.")),
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberUserId, newRole }: { memberUserId: string; newRole: string }) =>
      updateRole({ data: { businessId: businessId!, memberUserId, role: newRole as never } }),
    onSuccess: async () => {
      toast.success("Role updated.");
      await queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't change that role.")),
  });

  const removeMutation = useMutation({
    mutationFn: (memberUserId: string) =>
      removeMember({ data: { businessId: businessId!, memberUserId } }),
    onSuccess: async () => {
      toast.success("Team member removed.");
      await queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't remove that member.")),
  });

  function closeInviteDialog() {
    setInviteOpen(false);
    setInviteLink(null);
    setCreatedStaff(null);
    setInviteMode("link");
    setInviteRole("cashier");
    setStaffName("");
    setStaffPassword("");
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    toast.success("Link copied.");
  }

  if (workspace.isLoading || !workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Team" subtitle="Manage who has access.">
        <Skeleton className="h-64" />
      </AppShell>
    );
  }

  if (!canManage) {
    return (
      <AppShell
        businessName={workspace.data.business.name}
        role={workspace.data.role}
        plan={workspace.data.plan}
        isReadOnly={workspace.data.isReadOnly}
        billingEnabled={workspace.data.billingEnabled}
        title="Team"
        subtitle="Manage who has access to this business."
      >
        <div className="surface px-6 py-16 text-center">
          <Users className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Your role can't manage the team</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Ask an owner or admin to invite or manage team members.
          </p>
        </div>
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
      title="Team"
      subtitle="Invite people to your business and manage what they can do."
      actions={
        <Button className="gap-1.5" onClick={() => setInviteOpen(true)}>
          <Plus className="size-4" aria-hidden="true" /> Add team member
        </Button>
      }
    >
      <div className="surface mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">Shop sign-in</p>
          <p className="text-[13px] text-muted-foreground">
            Everyone on your team, including you, signs in with your business name (
            <span className="font-medium text-foreground">{businessName}</span>), the shop password,
            then their own name and password.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShopPasswordOpen(true)}>
            Set shop password
          </Button>
        </div>
      </div>

      {canManagePermissions ? (
        <Tabs
          value={section}
          onValueChange={(v) => setSection(v as typeof section)}
          className="mb-4"
        >
          <TabsList>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {section === "team" ? (
        <>
          <div className="surface overflow-hidden">
            <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">Team members</h2>
            {members.isLoading ? (
              <div className="space-y-3 p-5">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(members.data ?? []).map((m) => {
                  const isSelf = m.user_id === currentUserId;
                  const displayName = m.staff_name || m.full_name || m.email;
                  return (
                    <li
                      key={m.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {displayName}
                          {isSelf ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {m.staff_name ? "Signs in with business name" : m.email}
                        </p>
                      </div>
                      <Select
                        value={m.role}
                        onValueChange={(newRole) =>
                          roleMutation.mutate({ memberUserId: m.user_id, newRole })
                        }
                      >
                        <SelectTrigger className="w-36" aria-label={`Role for ${displayName}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r] ?? r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {m.staff_name ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setResetTarget({ userId: m.user_id, name: displayName })}
                          aria-label={`Reset password for ${displayName}`}
                        >
                          <KeyRound className="size-4" aria-hidden="true" />
                        </Button>
                      ) : (
                        <span />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={isSelf || removeMutation.isPending}
                        onClick={() => removeMutation.mutate(m.user_id)}
                        aria-label={`Remove ${displayName}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {(invites.data ?? []).length > 0 ? (
            <div className="surface mt-4 overflow-hidden">
              <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
                Pending invites
              </h2>
              <ul className="divide-y divide-border">
                {(invites.data ?? []).map((invite) => (
                  <li
                    key={invite.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {ROLE_LABEL[invite.role] ?? invite.role}
                      </p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        Expires {friendlyDate(invite.expires_at)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => copyLink(linkFor(invite.token))}
                    >
                      <Copy className="size-3.5" aria-hidden="true" /> Copy link
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(invite.id)}
                      aria-label="Cancel invite"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {section === "permissions" && canManagePermissions ? (
        <div className="surface overflow-hidden">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">
            Role permissions
          </h2>
          <p className="border-b border-border px-5 py-2.5 text-[13px] text-muted-foreground">
            Owner always has full access. Changes apply immediately.
          </p>
          {permissionCatalog.isLoading || rolePermissions.isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-2.5 text-[13px] font-medium text-muted-foreground">
                      Permission
                    </th>
                    {PERMISSION_ROLES.map((r) => (
                      <th
                        key={r}
                        className="px-3 py-2.5 text-center text-[13px] font-medium text-muted-foreground"
                      >
                        {ROLE_LABEL[r] ?? r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(
                    (permissionCatalog.data ?? []).reduce<
                      Record<string, typeof permissionCatalog.data>
                    >((groups, p) => {
                      (groups[p.category] ??= []).push(p);
                      return groups;
                    }, {}),
                  ).map(([category, perms]) => (
                    <Fragment key={category}>
                      <tr className="bg-muted/40">
                        <td
                          colSpan={PERMISSION_ROLES.length + 1}
                          className="px-5 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {category}
                        </td>
                      </tr>
                      {(perms ?? []).map((perm) => (
                        <tr key={perm.key}>
                          <td className="px-5 py-2.5">{perm.label}</td>
                          {PERMISSION_ROLES.map((r) => {
                            const granted = (rolePermissions.data ?? []).some(
                              (g) => g.role === r && g.permission_key === perm.key,
                            );
                            return (
                              <td key={r} className="px-3 py-2.5 text-center">
                                <Switch
                                  checked={granted}
                                  disabled={togglePermissionMutation.isPending}
                                  onCheckedChange={(checked) =>
                                    togglePermissionMutation.mutate({
                                      role: r,
                                      permissionKey: perm.key,
                                      granted: checked,
                                    })
                                  }
                                  aria-label={`${perm.label} for ${ROLE_LABEL[r] ?? r}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <Dialog
        open={inviteOpen}
        onOpenChange={(next) => (next ? setInviteOpen(true) : closeInviteDialog())}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              Send a link for someone with an email, or set up a name+password account for someone
              who doesn't have one.
            </DialogDescription>
          </DialogHeader>

          {!inviteLink && !createdStaff ? (
            <div className="space-y-4">
              <Tabs value={inviteMode} onValueChange={(v) => setInviteMode(v as typeof inviteMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="link">Send a link</TabsTrigger>
                  <TabsTrigger value="staff">Create staff account</TabsTrigger>
                </TabsList>
              </Tabs>

              {inviteMode === "staff" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="staff-name-input">Name</Label>
                  <Input
                    id="staff-name-input"
                    name="new-staff-member-name"
                    autoComplete="off"
                    // Chrome/Firefox otherwise treat the text field ahead of
                    // a password field as a "username" and autofill it with
                    // your own saved login — confirmed happening here since
                    // this form looks just like a sign-in form to the
                    // browser. off + a non-standard name field defeats that.
                    data-1p-ignore
                    data-lpignore="true"
                    maxLength={80}
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="John"
                  />
                  <Label htmlFor="staff-password-input" className="mt-3 block">
                    Password
                  </Label>
                  <Input
                    id="staff-password-input"
                    type="password"
                    autoComplete="new-password"
                    data-1p-ignore
                    data-lpignore="true"
                    minLength={8}
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as (typeof TEAM_ROLES)[number])}
                >
                  <SelectTrigger aria-label="Role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r] ?? r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={closeInviteDialog}>
                  Cancel
                </Button>
                {inviteMode === "link" ? (
                  <Button
                    className="gap-1.5"
                    disabled={inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate()}
                  >
                    {inviteMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Generate link
                  </Button>
                ) : (
                  <Button
                    className="gap-1.5"
                    disabled={
                      createStaffMutation.isPending ||
                      staffName.trim().length === 0 ||
                      staffPassword.length < 8
                    }
                    onClick={() => createStaffMutation.mutate()}
                  >
                    {createStaffMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Create account
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : inviteLink ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{ROLE_LABEL[inviteLink.role] ?? inviteLink.role}</Badge>
              </div>
              <div className="surface break-all p-3 text-[13px] text-muted-foreground">
                {inviteLink.link}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyLink(inviteLink.link)}
                >
                  <Copy className="size-3.5" aria-hidden="true" /> Copy link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const message = buildInviteWhatsAppMessage(
                      businessName,
                      ROLE_LABEL[inviteLink.role] ?? inviteLink.role,
                      inviteLink.link,
                    );
                    // No specific phone number to prefill for a general team
                    // invite (unlike customer/supplier orders) — this opens
                    // WhatsApp's own contact picker instead of a fixed chat.
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(message)}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  <MessageCircle className="size-3.5" aria-hidden="true" /> Share via WhatsApp
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeInviteDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : createdStaff ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{createdStaff.name}</span>
                <Badge variant="outline">
                  {ROLE_LABEL[createdStaff.role] ?? createdStaff.role}
                </Badge>
              </div>
              <p className="text-[13px] text-muted-foreground">
                {createdStaff.name} signs in at <strong>/staff-login</strong> with your business
                name and the shop password set at the top of this page, then their own name and
                password.
              </p>
              <DialogFooter>
                <Button onClick={closeInviteDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetTarget)} onOpenChange={(next) => !next && setResetTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password for {resetTarget?.name}</DialogTitle>
            <DialogDescription>
              They'll need this new password next time they sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reset-password-input">New password</Label>
            <Input
              id="reset-password-input"
              type="password"
              minLength={8}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              className="gap-1.5"
              disabled={resetPasswordMutation.isPending || resetPassword.length < 8}
              onClick={() => resetPasswordMutation.mutate()}
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={shopPasswordOpen}
        onOpenChange={(next) => {
          setShopPasswordOpen(next);
          if (!next) setShopPassword("");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set the shop password</DialogTitle>
            <DialogDescription>
              Required, along with your business name, before anyone can even see the staff list at
              /staff-login. Anyone with physical access to your till needs this.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="shop-password-input">New shop password</Label>
            <Input
              id="shop-password-input"
              type="password"
              minLength={8}
              value={shopPassword}
              onChange={(e) => setShopPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShopPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-1.5"
              disabled={shopPasswordMutation.isPending || shopPassword.length < 8}
              onClick={() => shopPasswordMutation.mutate()}
            >
              {shopPasswordMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
