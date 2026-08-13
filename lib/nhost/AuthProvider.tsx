"use client";

import { nhost } from "./client";
import type { Session } from "@nhost/nhost-js/auth";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type AuthContextValue = {
  nhost: typeof nhost;
  user: Session["user"] | null;
  loading: boolean;
  hydrated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // IMPORTANT:
  // Start with null so the server and first client render are identical.
  const [user, setUser] = useState<Session["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Only access the Nhost session after hydration.
    const session = nhost.getUserSession();

    setUser(session?.user ?? null);
    setLoading(false);
    setHydrated(true);

    return nhost.sessionStorage.onChange((session) => {
      setUser(session?.user ?? null);
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        nhost,
        user,
        loading,
        hydrated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be inside AuthProvider");
  }

  return ctx;
}