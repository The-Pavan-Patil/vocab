"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendPasswordResetEmail } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";
import { useDesktopAutoFocus } from "@/hooks/use-desktop-autofocus";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Mode = "signin" | "signup" | "forgot";

// Supabase error codes that point at one field; anything else marks neither.
const FIELD_FOR_CODE: Record<string, "email" | "password"> = {
  invalid_credentials: "password",
  weak_password: "password",
  same_password: "password",
  email_not_confirmed: "email",
  email_address_invalid: "email",
  email_address_not_authorized: "email",
  user_already_exists: "email",
  email_exists: "email",
  user_not_found: "email",
  over_email_send_rate_limit: "email",
};

// What to do about a failure, per mode — shown under the server's message.
const NEXT_STEP: Record<Mode, string> = {
  signin: "Check your email and password, or reset your password below.",
  signup: "Check the email address, or sign in if you already have an account.",
  forgot: "Check the email address. If you just asked for a link, wait a minute before trying again.",
};

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false); // signup confirmation sent
  const [resetSent, setResetSent] = useState(false); // password-reset email sent
  // The last submit's failure, shown inline under the fields, and the field it
  // is about (null when the error isn't about either one).
  const [formError, setFormError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"email" | "password" | null>(
    null
  );
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // Set by switchMode() so the new form's first field gets focus (not on load).
  const focusEmailRef = useRef(false);
  useDesktopAutoFocus(emailRef);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const notice = checkEmail || resetSent;
  const emailInvalid = formError !== null && errorField === "email";
  const passwordInvalid = formError !== null && errorField === "password";

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

  // A successful sign-in keeps the button busy until the page navigates away.
  // If the browser later restores this page from its back/forward cache, that
  // state comes back too — reset it.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setBusy(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // The form is replaced by a "check your email" notice — move focus onto it
  // so it's read out instead of focus falling to <body>.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  useEffect(() => {
    if (!focusEmailRef.current) return;
    focusEmailRef.current = false;
    emailRef.current?.focus();
  }, [mode, notice]);

  function switchMode(next: Mode) {
    setMode(next);
    setCheckEmail(false);
    setResetSent(false);
    setPassword("");
    setFormError(null);
    setErrorField(null);
    focusEmailRef.current = true;
  }

  function fail(message: string, code?: string) {
    const field = (code && FIELD_FOR_CODE[code]) || null;
    setFormError(`${message.replace(/\.$/, "")}. ${NEXT_STEP[mode]}`);
    setErrorField(field);
    setBusy(false);
    // Focus the field the error is about; otherwise the first field, so the
    // person is back in the form right above the message.
    (field === "password" ? passwordRef : emailRef).current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (!isForgot && !password) return;
    const supabase = createClient();
    setBusy(true);
    setFormError(null);
    setErrorField(null);
    try {
      if (isForgot) {
        const { error } = await sendPasswordResetEmail(email);
        if (error) return fail(error);
        setResetSent(true);
        setBusy(false);
      } else if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return fail(error.message, error.code);
        if (data.session) {
          // Confirmation off → logged in. Stay busy while the page navigates so
          // the button can't be pressed twice.
          window.location.assign("/");
        } else {
          setCheckEmail(true); // confirmation on → verify by email
          setBusy(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return fail(error.message, error.code);
        window.location.assign("/"); // full reload so the proxy re-evaluates
      }
    } catch (err) {
      // Network failure (the request never reached Supabase).
      fail(
        err instanceof TypeError
          ? "You seem to be offline"
          : (err as Error).message
      );
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
              {isForgot
                ? "Reset your password"
                : isSignup
                  ? "Create your account"
                  : "Welcome back"}
            </h1>
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
            <Alert ref={noticeRef} tabIndex={-1} className="outline-none">
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                We sent a confirmation link to <strong className="break-all">{email}</strong>. Click it
                to finish creating your account, then sign in.
              </AlertDescription>
            </Alert>
          ) : resetSent ? (
            <Alert ref={noticeRef} tabIndex={-1} className="outline-none">
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                We sent a password reset link to <strong className="break-all">{email}</strong>. Click
                it to choose a new password.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field data-invalid={emailInvalid || undefined}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    ref={emailRef}
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={emailInvalid || undefined}
                    aria-describedby={formError ? "login-error" : undefined}
                    required
                  />
                </Field>
                {!isForgot && (
                  <Field data-invalid={passwordInvalid || undefined}>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      ref={passwordRef}
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={
                        isSignup ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={6}
                      aria-invalid={passwordInvalid || undefined}
                      aria-describedby={
                        [isSignup && "password-hint", formError && "login-error"]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      required
                    />
                    {isSignup && (
                      <FieldDescription id="password-hint">
                        At least 6 characters.
                      </FieldDescription>
                    )}
                  </Field>
                )}
                {formError && (
                  <Alert id="login-error" variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" size="lg" disabled={busy} className="w-full">
                  {busy && <Spinner data-icon="inline-start" aria-hidden />}
                  {busy
                    ? isForgot
                      ? "Sending link…"
                      : isSignup
                        ? "Creating account…"
                        : "Signing in…"
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
                    className="font-medium text-primary underline underline-offset-4 hover:decoration-2"
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
                      className="font-medium text-primary underline underline-offset-4 hover:decoration-2"
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
                      className="font-medium text-primary underline underline-offset-4 hover:decoration-2"
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
                className="font-medium text-primary underline underline-offset-4 hover:decoration-2"
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
