"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check them and try again.",
  USER_ALREADY_EXISTS: "There's already an account with that email. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There's already an account with that email. Sign in instead.",
  PASSWORD_TOO_SHORT: "Use a password with at least 8 characters.",
  PASSWORD_TOO_LONG: "That password is too long.",
  INVALID_EMAIL: "That doesn't look like an email address.",
};

function explain(error: { code?: string; status?: number; message?: string }): string {
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return "Too many tries. Wait a minute, then try again.";
  return error.message || "That didn't work. Try again.";
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name: name.trim(), email, password });
    if (result.error) {
      setError(explain(result.error));
      setPending(false);
      return;
    }
    // A full page load on purpose: the whole app re-renders for the signed-in student.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  async function withGoogle() {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    if (result.error) {
      setError(explain(result.error));
      setPending(false);
    }
  }

  const signingUp = mode === "sign-up";

  return (
    <div>
      <h2 className="text-xl">{signingUp ? "Create your account" : "Sign in"}</h2>

      {googleEnabled && (
        <>
          <button type="button" onClick={withGoogle} disabled={pending} className="btn btn-paper mt-5 w-full">
            <GoogleLogo />
            Continue with Google
          </button>
          <p className="my-5 flex items-center gap-3 text-sm text-pencil">
            <span className="h-px flex-1 bg-rule" />
            or use your email
            <span className="h-px flex-1 bg-rule" />
          </p>
        </>
      )}

      <form onSubmit={submit} className={googleEnabled ? "space-y-4" : "mt-5 space-y-4"} noValidate={false}>
        {signingUp && (
          <div>
            <label htmlFor="name" className="field-label">
              Your name
            </label>
            <input
              id="name"
              className="field"
              autoComplete="name"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="field"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="field"
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signingUp && <p className="field-hint">At least 8 characters.</p>}
        </div>

        {error && (
          <p role="alert" className="rounded-[3px] bg-redpen-wash px-3 py-2 text-sm text-redpen">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-ink w-full">
          {pending ? "One moment…" : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-sm">
        {signingUp ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(signingUp ? "sign-in" : "sign-up");
            setError(null);
          }}
        >
          {signingUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
