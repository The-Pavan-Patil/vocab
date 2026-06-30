"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Where the recovery email link lands (via /auth/callback). The callback exchanges
// the link for a recovery session, so by the time this loads the user has a
// session and can set a new password. `ready` is null while we confirm that.
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

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
      toast.error("Passwords don’t match");
      return;
    }
    const supabase = createClient();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated", {
        description: "You’re signed in — taking you to your list…",
      });
      window.location.assign("/"); // full reload so the proxy re-evaluates
    } catch (err) {
      toast.error("Couldn’t update password", {
        description: (err as Error).message,
      });
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-1 text-xl font-semibold tracking-tight">
            <span className="jp">日本語</span>{" "}
            <span className="text-muted-foreground font-normal">Vocab</span>
          </div>
          <CardTitle>Set a new password</CardTitle>
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
                  className="font-medium text-primary hover:underline"
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
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                    autoFocus
                    disabled={ready === null}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                    disabled={ready === null}
                  />
                </Field>
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy || ready !== true}
                  className="w-full"
                >
                  {busy
                    ? "Please wait…"
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
