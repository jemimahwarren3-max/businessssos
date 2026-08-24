import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ROLE_LABEL } from "@/components/app-shell";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/auth.functions";
import { acceptInviteFn, getInvitePreviewFn } from "@/lib/business.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "You're invited — BusinessOS AI" }, { name: "robots", content: "noindex" }],
  }),
  component: InvitePage,
});

const REASON_MESSAGE: Record<string, string> = {
  not_found: "This invite link isn't valid.",
  revoked: "This invite has been cancelled by the business.",
  accepted: "This invite has already been used.",
  expired: "This invite link has expired. Ask for a new one.",
};

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchPreview = useServerFn(getInvitePreviewFn);
  const fetchCurrentUser = useServerFn(getCurrentUser);
  const acceptFn = useServerFn(acceptInviteFn);

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{
    business_name: string | null;
    role: string | null;
    valid: boolean;
    reason: string | null;
  } | null>(null);
  const [user, setUser] = useState<Awaited<ReturnType<typeof fetchCurrentUser>>>(null);

  useEffect(() => {
    Promise.all([fetchPreview({ data: { token } }), fetchCurrentUser()]).then(
      ([previewResult, userResult]) => {
        setPreview(previewResult);
        setUser(userResult);
        setLoading(false);
      },
    );
  }, [token, fetchPreview, fetchCurrentUser]);

  const acceptMutation = useMutation({
    mutationFn: () => acceptFn({ data: { token } }),
    onSuccess: async () => {
      toast.success("You're in!");
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Couldn't accept that invite. Please try again.")),
  });

  const redirectSearch = { mode: "signin" as const, redirect: `/invite/${token}` as const };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-4">
        <Logo to="/" />
      </header>
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-14">
        <div className="surface p-6 text-center">
          {loading ? (
            <Loader2
              className="mx-auto size-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : !preview?.valid ? (
            <>
              <AlertTriangle
                className="mx-auto size-6 text-warning-foreground"
                aria-hidden="true"
              />
              <h1 className="mt-3 text-xl font-bold tracking-tight">Invite not available</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {REASON_MESSAGE[preview?.reason ?? "not_found"] ?? "This invite link isn't valid."}
              </p>
              <Button asChild variant="outline" className="mt-5 w-full">
                <Link to="/auth" search={{ mode: "signin" }}>
                  Go to sign in
                </Link>
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold tracking-tight">You're invited</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Join <span className="font-medium text-foreground">{preview.business_name}</span> as{" "}
                <span className="font-medium text-foreground">
                  {ROLE_LABEL[preview.role ?? ""] ?? preview.role}
                </span>
                .
              </p>

              {!user ? (
                <div className="mt-5 flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link to="/auth" search={redirectSearch}>
                      Sign in to accept
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/auth" search={{ mode: "signup", redirect: redirectSearch.redirect }}>
                      Create an account
                    </Link>
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-5 w-full gap-1.5"
                  disabled={acceptMutation.isPending}
                  onClick={() => acceptMutation.mutate()}
                >
                  {acceptMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Accept and join
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
