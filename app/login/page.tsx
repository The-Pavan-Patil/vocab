"use client";

import { useState } from "react";
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

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    const supabase = createClient();
    setBusy(true);
    try {
      if (isSignup) {
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
      toast.error(isSignup ? "Couldn’t create account" : "Couldn’t sign in", {
        description: (err as Error).message,
      });
    } finally {
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
          <CardTitle>{isSignup ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {isSignup
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
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                  />
                </Field>
                <Button type="submit" size="lg" disabled={busy} className="w-full">
                  {busy
                    ? "Please wait…"
                    : isSignup
                      ? "Create account"
                      : "Sign in"}
                </Button>
              </FieldGroup>
            </form>
          )}

          {!checkEmail && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {isSignup ? "Already have an account?" : "New here?"}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode(isSignup ? "signin" : "signup")}
              >
                {isSignup ? "Sign in" : "Create one"}
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
