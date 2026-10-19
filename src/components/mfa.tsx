import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readableError } from "@/lib/format";

type EnrollResult = { factorId: string; qrCode: string; secret: string };
type ChallengeResult = { challengeId: string };

/** Shared by the (mandatory) admin-panel MFA gate and the (optional)
 * business-account Security section — same TOTP enroll/verify flow either
 * way, just pointed at different server functions and copy. Callers pass
 * the result of their own useServerFn(...) call, not the raw server
 * function — keeps the hook call at the normal top-level call site instead
 * of threading a dynamic prop value into a hook here. */
export function MfaEnroll({
  onDone,
  enrollFn,
  verifyFn,
  title = "Set up two-factor authentication",
  description = "Scan the code below with an authenticator app (Google Authenticator, Authy, 1Password, etc).",
}: {
  onDone: () => void;
  enrollFn: () => Promise<EnrollResult>;
  verifyFn: (input: { data: { factorId: string; code: string } }) => Promise<unknown>;
  title?: string;
  description?: string;
}) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const startMutation = useMutation({
    mutationFn: () => enrollFn(),
    onSuccess: (result: EnrollResult) => {
      setFactorId(result.factorId);
      setQrCode(result.qrCode);
      setSecret(result.secret);
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't start MFA enrollment.")),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyFn({ data: { factorId: factorId!, code: code.trim() } }),
    onSuccess: () => {
      toast.success("MFA enabled.");
      onDone();
    },
    onError: (error: Error) => toast.error(readableError(error, "That code didn't work.")),
  });

  return (
    <div className="space-y-4 text-center">
      <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {!qrCode ? (
        <Button
          className="w-full"
          disabled={startMutation.isPending}
          onClick={() => startMutation.mutate()}
        >
          {startMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Start setup
        </Button>
      ) : (
        <>
          <img
            src={qrCode}
            alt="Scan this QR code with your authenticator app"
            className="mx-auto size-40"
          />
          <p className="break-all text-[11px] text-muted-foreground">
            Or enter manually: <span className="font-mono">{secret}</span>
          </p>
          <div className="space-y-1.5 text-left">
            <Label htmlFor="mfa-code">6-digit code</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              autoFocus
            />
          </div>
          <Button
            className="w-full"
            disabled={verifyMutation.isPending || code.trim().length !== 6}
            onClick={() => verifyMutation.mutate()}
          >
            {verifyMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Confirm
          </Button>
        </>
      )}
    </div>
  );
}

export function MfaChallenge({
  factorId,
  onDone,
  challengeFn,
  verifyFn,
}: {
  factorId: string;
  onDone: () => void;
  challengeFn: (input: { data: { factorId: string } }) => Promise<ChallengeResult>;
  verifyFn: (input: {
    data: { factorId: string; challengeId: string; code: string };
  }) => Promise<unknown>;
}) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const startMutation = useMutation({
    mutationFn: () => challengeFn({ data: { factorId } }),
    onSuccess: (result: ChallengeResult) => setChallengeId(result.challengeId),
    onError: (error: Error) => toast.error(readableError(error, "Couldn't start verification.")),
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      verifyFn({ data: { factorId, challengeId: challengeId!, code: code.trim() } }),
    onSuccess: () => onDone(),
    onError: (error: Error) => toast.error(readableError(error, "That code didn't work.")),
  });

  useEffect(() => {
    startMutation.mutate();
    // Only ever run once, on mount — startMutation is a new object identity
    // every render (useMutation doesn't memoize it), so including it would
    // re-trigger the challenge on every render instead of just once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 text-center">
      <KeyRound className="mx-auto size-8 text-primary" aria-hidden="true" />
      <div>
        <h2 className="text-lg font-bold">Verify it's you</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the code from your authenticator app.
        </p>
      </div>
      {!challengeId && startMutation.isError ? (
        // The initial challenge-start call failed (network blip, a brief
        // session-cookie race right after sign-in, etc), without this,
        // challengeId never gets set and the code field stays permanently
        // disabled with no way out short of a full page reload.
        <Button
          className="w-full gap-1.5"
          disabled={startMutation.isPending}
          onClick={() => startMutation.mutate()}
        >
          {startMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Try again
        </Button>
      ) : (
        <>
          <div className="space-y-1.5 text-left">
            <Label htmlFor="mfa-challenge-code">6-digit code</Label>
            <Input
              id="mfa-challenge-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              autoFocus
              disabled={!challengeId}
            />
          </div>
          <Button
            className="w-full"
            disabled={!challengeId || verifyMutation.isPending || code.trim().length !== 6}
            onClick={() => verifyMutation.mutate()}
          >
            {verifyMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Verify
          </Button>
        </>
      )}
    </div>
  );
}
