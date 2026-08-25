import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, roleLabels, type AppRole } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  CalendarClock,
  ClipboardCheck,
  CircleDollarSign,
  Wallet,
  Boxes,
  Receipt,
  FileText,
  ArrowLeftRight,
  MessageCircle,
  Users,
  UserCog,
  LogOut,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BoletosHoje } from "@/components/BoletosHoje";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

type NavItem = { to: string; label: string; icon: typeof Users; roles: AppRole[] };

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "atendente", "campo", "financeiro"] },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarClock, roles: ["admin", "atendente", "campo"] },
  { to: "/clientes", label: "Clientes", icon: Users, roles: ["admin", "atendente"] },
  { to: "/prontos", label: "Serviços prontos", icon: ClipboardCheck, roles: ["admin", "atendente", "campo", "financeiro"] },
  { to: "/a-cobrar", label: "A cobrar", icon: CircleDollarSign, roles: ["admin", "atendente"] },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, roles: ["admin", "financeiro"] },
  { to: "/caixa", label: "Entradas/Saídas", icon: ArrowLeftRight, roles: ["admin", "financeiro"] },
  { to: "/boletos", label: "Boletos", icon: Receipt, roles: ["admin", "financeiro"] },
  { to: "/notas-fiscais", label: "Notas Fiscais", icon: FileText, roles: ["admin", "financeiro"] },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin", "atendente"] },
  { to: "/estoque", label: "Estoque", icon: Boxes, roles: ["admin", "atendente", "campo", "financeiro"] },
  { to: "/usuarios", label: "Usuários", icon: UserCog, roles: ["admin"] },
];

function AppLayout() {
  const { role, nome, user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const items = navItems.filter((i) => (role ? i.roles.includes(role) : false));

  const sair = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-sidebar-border px-5 py-5">
          <p className="text-sm font-semibold tracking-tight">Nascimento Sistemas de Segurança</p>
          <p className="mt-1 truncate text-xs text-sidebar-foreground/70">
             {nome || user?.email} {/* · {role ? roleLabels[role] : "Sem função"} */}
          </p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={sair}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-foreground/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium">Equipe de Campo</span>
        </header>

        <main className="flex-1 p-4 md:p-8">
          {loading && !role ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <BoletosHoje />
              <Outlet />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
