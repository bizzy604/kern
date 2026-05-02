import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface AuthDeveloper {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  githubHandle: string | null;
  teamId: number | null;
  teamName: string | null;
  role: string;
  timezone: string;
  createdAt: string;
}

interface AuthContextValue {
  developer: AuthDeveloper | null;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  developer: null,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [developer, setDeveloper] = useState<AuthDeveloper | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      setDeveloper(data.developer ?? null);
    } catch {
      setDeveloper(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setDeveloper(null);
    }
  };

  return (
    <AuthContext.Provider value={{ developer, loading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
