import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "atendente" | "campo" | "financeiro";

export const roleLabels: Record<AppRole, string> = {
  admin: "Administrador",
  atendente: "Atendente",
  campo: "Equipe de rua",
  financeiro: "Financeiro",
};

type AuthState = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  nome: string;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  role: null,
  nome: "",
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setRole(null);
      setNome("");
      return;
    }
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
    ]);
    setRole((roleRow?.role as AppRole) ?? null);
    setNome(profile?.nome ?? "");
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setTimeout(() => void loadProfile(newSession?.user?.id), 0);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        nome,
        loading,
        refresh: () => loadProfile(session?.user?.id),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const canSeeValues = (role: AppRole | null) => role === "admin" || role === "financeiro";
