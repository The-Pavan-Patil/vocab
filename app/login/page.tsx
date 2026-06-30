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

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false); // signup confirmation sent
  const [resetSent, setResetSent] = useState(false); // password-reset email sent

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  // /auth/callback bounces a failed recovery link back here with ?error=auth_link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_link") {
      toast.error("That reset link didn’t work", {
        description: "It may have expired. Request a new one below.",
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setCheckEmail(false);
    setResetSent(false);
    setPassword("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (!isForgot && !password) return;
    const supabase = createClient();
    setBusy(true);
    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
      } else if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          window.location.assign("/"); // confirmation off → logged in
        } else {
          setCheckEmail(true); // confirmation on → verify by email
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.assign("/"); // full reload so the proxy re-evaluates
      }
    } catch (err) {
      toast.error(
        isForgot
          ? "Couldn’t send reset link"
          : isSignup
            ? "Couldn’t create account"
            : "Couldn’t sign in",
        { description: (err as Error).message }
      );
    } finally {
      setBusy(false);
    }
  }

  const notice = checkEmail || resetSent;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-1 text-xl font-semibold tracking-tight">
            <span className="jp">日本語</span>{" "}
            <span className="text-muted-foreground font-normal">Vocab</span>
          </div>
          <CardTitle>
            {isForgot
              ? "Reset your password"
              : isSignup
                ? "Create your account"
                : "Welcome back"}
          </CardTitle>
          <CardDescription>
            {isForgot
              ? "Enter your email and we’ll send you a reset link."
              : isSignup
                ? "Sign up to start your own vocabulary list."
                : "Sign in to your vocabulary list."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkEmail ? (
            <Alert>
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                We sent a confirmation link to <strong>{email}</strong>. Click it
                to finish creating your account, then sign in.
              </AlertDescription>
            </Alert>
          ) : resetSent ? (
            <Alert>
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                We sent a password reset link to <strong>{email}</strong>. Click
                it to choose a new password.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />
                </Field>
                {!isForgot && (
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={
                        isSignup ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={6}
                      required
                    />
                  </Field>
                )}
                <Button type="submit" size="lg" disabled={busy} className="w-full">
                  {busy
                    ? "Please wait…"
                    : isForgot
                      ? "Send reset link"
                      : isSignup
                        ? "Create account"
                        : "Sign in"}
                </Button>
              </FieldGroup>
            </form>
          )}

          {!notice && (
            <div className="mt-4 space-y-2 text-center text-sm text-muted-foreground">
              {mode === "signin" && (
                <p>
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => switchMode("forgot")}
                  >
                    Forgot password?
                  </button>
                </p>
              )}
              <p>
                {isForgot ? (
                  <>
                    Remembered it?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => switchMode("signin")}
                    >
                      Back to sign in
                    </button>
                  </>
                ) : (
                  <>
                    {isSignup ? "Already have an account?" : "New here?"}{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => switchMode(isSignup ? "signin" : "signup")}
                    >
                      {isSignup ? "Sign in" : "Create one"}
                    </button>
                  </>
                )}
              </p>
            </div>
          )}

          {resetSent && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => switchMode("signin")}
              >
                Back to sign in
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
