"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/nhost/AuthProvider";

export default function Login() {
  const { nhost, user, loading, hydrated} = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydrated && user) {
      router.replace("/workflows");
    }
  }, [hydrated, user, router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setBusy(true);
    setError("");

    try {
      const response = await nhost.auth.signInEmailPassword({
        email,
        password,
      });

      if (response.body.session) {
        router.push("/workflows");
        return;
      }

      setError("Unable to sign in. Please check your email and password.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please check your credentials.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1>Sign in</h1>

        <p className="muted">
          Use one of the Nhost users already created for the assignment.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label className="label">Email</label>

            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </div>

          <div className="field">
            <label className="label">Password</label>

            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button
            className="btn primary"
            disabled={busy}
            style={{ marginTop: 14 }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}