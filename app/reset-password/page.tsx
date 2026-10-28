"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Where the recovery email link lands (via /auth/callback). The callback exchanges
// the link for a recovery session, so by the time this loads the user has a
// session and can set a new password. `ready` is null while we confirm that.
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  // Inline errors: the confirmation doesn't match, or the update failed.
  const [mismatch, setMismatch] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // The fields are disabled until the recovery link is verified, so focus the
  // first one once they're usable (autoFocus on a disabled input does nothing).
  useEffect(() => {
    if (ready && window.matchMedia("(pointer: fine)").matches) {
      passwordRef.current?.focus();
    }
  }, [ready]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      // Only fall to "invalid" if we're still checking — an auth event may have
      // already established the recovery session.
      setReady((prev) => (data.session ? true : prev === null ? false : prev));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        setReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return;
    if (password !== confirm) {
      setMismatch(true);
      confirmRef.current?.focus();
      return;
    }
    const supabase = createClient();
    setBusy(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated", {
        description: "You’re signed in — taking you to your list…",
      });
      window.location.assign("/"); // full reload so the proxy re-evaluates
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "You seem to be offline"
          : (err as Error).message.replace(/\.$/, "");
      setFormError(
        `${message}. Try again, or go back to sign in and request a new reset link if this one has expired.`
      );
      setBusy(false);
      passwordRef.current?.focus();
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-1 text-xl font-semibold tracking-tight">
            <span lang="ja" translate="no" className="jp">日本語</span>{" "}
            <span className="text-muted-foreground font-normal">Vocab</span>
          </div>
          <CardTitle>
            <h1>
              Set a new password
            </h1>
          </CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ready === false ? (
            <Alert>
              <AlertTitle>Reset link invalid or expired</AlertTitle>
              <AlertDescription>
                Please{" "}
                <a
                  className="font-medium text-primary underline underline-offset-4 hover:decoration-2"
                  href="/login"
                >
                  go back to sign in
                </a>{" "}
                and request a new reset link.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="password">New password</FieldLabel>
                  <Input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setMismatch(false);
                    }}
                    placeholder="••••••••"
                    minLength={6}
                    aria-describedby="new-password-hint"
                    required
                    disabled={ready === null}
                  />
                  <FieldDescription id="new-password-hint">
                    At least 6 characters.
                  </FieldDescription>
                </Field>
                <Field data-invalid={mismatch || undefined}>
                  <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
                  <Input
                    ref={confirmRef}
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setMismatch(false);
                    }}
                    placeholder="••••••••"
                    minLength={6}
                    aria-invalid={mismatch || undefined}
                    aria-describedby={mismatch ? "confirm-error" : undefined}
                    required
                    disabled={ready === null}
                  />
                  <FieldError id="confirm-error">
                    {mismatch
                      ? "The passwords don’t match. Type the same password in both fields."
                      : undefined}
                  </FieldError>
                </Field>
                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy || ready !== true}
                  className="w-full"
                >
                  {busy && <Spinner data-icon="inline-start" aria-hidden />}
                  {busy
                    ? "Updating password…"
                    : ready === null
                      ? "Verifying link…"
                      : "Update password"}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
