import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
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

  const fetchProfileData = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      return { role: null, nome: "" };
    }
    try {
      const [{ data: roleRow }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
        supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
      ]);
      return {
        role: ((roleRow?.role as AppRole) ?? null) as AppRole | null,
        nome: profile?.nome ?? "",
      };
    } catch {
      return { role: null, nome: "" };
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetchProfileData(data.session?.user?.id);
      setSession(data.session);
      setRole(res.role);
      setNome(res.nome);
    } catch (err) {
      console.error("Erro ao atualizar perfil:", err);
    }
  }, [fetchProfileData]);

  useEffect(() => {
    let isMounted = true;

    // O onAuthStateChange do Supabase dispara automaticamente o evento INITIAL_SESSION
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      if (newSession?.user) {
        const res = await fetchProfileData(newSession.user.id);
        if (!isMounted) return;
        setRole(res.role);
        setNome(res.nome);
      } else {
        setRole(null);
        setNome("");
      }
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfileData]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        nome,
        loading,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const canSeeValues = (role: AppRole | null) => role === "admin" || role === "financeiro";
