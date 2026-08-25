import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wrench, Shield, User, HardHat, DollarSign } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Acesse o sistema com o login da sua função." },
      { property: "og:title", content: "Entrar — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Acesse o sistema com o login da sua função." },
    ],
  }),
  component: AuthPage,
});

const DEFAULT_USERS = [
  { role: "Administrador", email: "admin@nascimento.com", senha: "admin123", icon: Shield },
  { role: "Atendente", email: "atendente@nascimento.com", senha: "admin123", icon: User },
  { role: "Técnico (Campo)", email: "campo@nascimento.com", senha: "admin123", icon: HardHat },
  { role: "Financeiro", email: "financeiro@nascimento.com", senha: "admin123", icon: DollarSign },
];

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const handleLogin = async (loginEmail: string, loginSenha: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim().toLowerCase(),
      password: loginSenha,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: "Verifique e-mail e senha." });
      return;
    }
    toast.success("Login efetuado com sucesso!");
    navigate({ to: "/dashboard", replace: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin(email, senha);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="brand-gradient mb-4 flex h-14 w-14 items-center justify-center rounded-xl shadow-md">
            <Wrench className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Nascimento Sistemas de Segurança</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre com o login da sua função para acessar o painel.
          </p>
        </div>

        <form onSubmit={onSubmit} className="surface-card space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="ex: admin@nascimento.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>
          <Button id="btn-entrar" type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>

          <div className="pt-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
              Acesso Rápido de Demonstração
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_USERS.map((u) => {
                const IconComponent = u.icon;
                return (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => {
                      setEmail(u.email);
                      setSenha(u.senha);
                      void handleLogin(u.email, u.senha);
                    }}
                    className="flex flex-col items-start rounded-lg border bg-muted/40 p-2.5 text-left text-xs transition-colors hover:bg-muted hover:border-primary/50"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <IconComponent className="h-3.5 w-3.5 text-primary" />
                      <span>{u.role}</span>
                    </div>
                    <span className="mt-1 text-[11px] text-muted-foreground truncate w-full">{u.email}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Senha padrão para todos os perfis acima: <strong className="text-foreground">admin123</strong>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
