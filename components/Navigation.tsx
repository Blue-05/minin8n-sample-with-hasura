"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/nhost/AuthProvider";

export default function Navigation() {
  const { user, nhost, hydrated } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
  try {
    const session = nhost.getUserSession();

    if (session?.refreshToken) {
      await nhost.auth.signOut({
        refreshToken: session.refreshToken,
      });
    }
  } catch (error) {
    console.error("Sign out failed:", error);
  } finally {
    router.push("/login");
  }
}

  return (
    <nav className="nav">
      <Link className="brand" href="/">
        AgentFlow
      </Link>

      <div className="navlinks">
        {!hydrated ? (
          // Important: don't render auth-dependent UI until
          // the browser has restored the Nhost session.
          null
        ) : user ? (
          <>
            <Link href="/workflows">Workflows</Link>

            <button className="btn" onClick={handleSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </nav>
  );
}