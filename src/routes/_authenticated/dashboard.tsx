import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { formatMoney, statusLabels, type ServicoStatus } from "@/lib/servico";
import type { Servico } from "@/lib/types";
import { CalendarClock, Loader2, ClipboardCheck, Wallet, CheckCircle2, ArrowRight, Clock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Resumo de agendamentos, serviços em andamento, prontos e cobranças." },
      { property: "og:title", content: "Dashboard — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Resumo de agendamentos, serviços e cobranças." },
    ],
  }),
  component: Dashboard,
});

function Card({
  titulo,
  valor,
  icone: Icone,
  cor,
}: {
  titulo: string;
  valor: string | number;
  icone: typeof CalendarClock;
  cor: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-md ${cor}`}>
          <Icone className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{valor}</p>
    </div>
  );
}

function Dashboard() {
  const { role, nome, user } = useAuth();
  const verValores = canSeeValues(role);
  const ehCampo = role === "campo";

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["dashboard-servicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("id, numero_pedido, status, valor, data_agendada, iniciado_em, concluido_em, tecnico_id, rel_clientes:clientes(nome, cidade)")
        .order("data_agendada", { ascending: false });
      if (error) throw error;
      return data as unknown as Servico[];
    },
    refetchInterval: 5000,
  });

  const count = (s: ServicoStatus) => servicos.filter((x) => x.status === s).length;
  const countCampo = (s: ServicoStatus) =>
    servicos.filter((x) => x.status === s && (!x.tecnico_id || x.tecnico_id === user?.id)).length;
  const soma = (filtro: (s: Servico) => boolean) =>
    servicos.filter(filtro).reduce((acc, s) => acc + Number(s.valor ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Olá{nome ? `, ${nome}` : ""}</h1>
          <p className="text-sm text-muted-foreground">
            {ehCampo
              ? "Painel da equipe de campo — visualize seus atendimentos e serviços."
              : "Visão geral dos serviços, agendamentos e faturamento da equipe."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/agendamentos">
              <CalendarClock className="mr-2 h-4 w-4" /> Ver Agendamentos
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/prontos">
              <ClipboardCheck className="mr-2 h-4 w-4" /> Serviços Prontos
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas...
        </p>
      ) : (
        <>
          {ehCampo ? (
            /* Painel limpo e direto para a Equipe de Rua (SEM campo a cobrar) */
            <div className="grid gap-4 sm:grid-cols-3">
              <Card
                titulo="Agendados"
                valor={count("agendado")}
                icone={CalendarClock}
                cor="bg-secondary text-secondary-foreground"
              />
              <Card
                titulo="Em Andamento"
                valor={count("em_andamento")}
                icone={Clock}
                cor="bg-info/15 text-info"
              />
              <Card
                titulo="Serviços Concluídos"
                valor={count("pronto")}
                icone={CheckCircle2}
                cor="bg-primary/15 text-primary"
              />
            </div>
          ) : (
            /* Painel completo para Administrador, Atendente e Financeiro */
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card
                  titulo={statusLabels.agendado}
                  valor={count("agendado")}
                  icone={CalendarClock}
                  cor="bg-secondary text-secondary-foreground"
                />
                <Card
                  titulo={statusLabels.em_andamento}
                  valor={count("em_andamento")}
                  icone={Loader2}
                  cor="bg-info/15 text-info"
                />
                <Card
                  titulo={statusLabels.pronto}
                  valor={count("pronto")}
                  icone={ClipboardCheck}
                  cor="bg-primary/15 text-primary"
                />
                <Card
                  titulo={statusLabels.a_cobrar}
                  valor={count("a_cobrar")}
                  icone={Wallet}
                  cor="bg-warning/25 text-warning-foreground"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card
                  titulo={statusLabels.pago}
                  valor={count("pago")}
                  icone={CheckCircle2}
                  cor="bg-success/20 text-success-foreground"
                />
                {verValores && (
                  <>
                    <Card
                      titulo="Total a receber"
                      valor={formatMoney(soma((s) => s.status === "a_cobrar" || s.status === "pronto"))}
                      icone={Wallet}
                      cor="bg-warning/25 text-warning-foreground"
                    />
                    <Card
                      titulo="Total recebido"
                      valor={formatMoney(soma((s) => s.status === "pago"))}
                      icone={CheckCircle2}
                      cor="bg-success/20 text-success-foreground"
                    />
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
