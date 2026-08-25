import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { formatMoney, statusLabels, type ServicoStatus } from "@/lib/servico";
import type { Servico } from "@/lib/types";
import { CalendarClock, Loader2, ClipboardCheck, Wallet, CheckCircle2 } from "lucide-react";

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
  const { role, nome } = useAuth();
  const verValores = canSeeValues(role);

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["dashboard-servicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("id, status, valor, data_agendada")
        .order("data_agendada", { ascending: false });
      if (error) throw error;
      return data as unknown as Servico[];
    },
  });

  const count = (s: ServicoStatus) => servicos.filter((x) => x.status === s).length;
  const soma = (filtro: (s: Servico) => boolean) =>
    servicos.filter(filtro).reduce((acc, s) => acc + Number(s.valor ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá{nome ? `, ${nome}` : ""}</h1>
        <p className="text-sm text-muted-foreground">Visão geral dos serviços da equipe.</p>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card titulo={statusLabels.agendado} valor={count("agendado")} icone={CalendarClock} cor="bg-secondary text-secondary-foreground" />
            <Card titulo={statusLabels.em_andamento} valor={count("em_andamento")} icone={Loader2} cor="bg-info/15 text-info" />
            <Card titulo={statusLabels.pronto} valor={count("pronto")} icone={ClipboardCheck} cor="bg-primary/15 text-primary" />
            <Card titulo={statusLabels.a_cobrar} valor={count("a_cobrar")} icone={Wallet} cor="bg-warning/25 text-warning-foreground" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card titulo={statusLabels.pago} valor={count("pago")} icone={CheckCircle2} cor="bg-success/20 text-success-foreground" />
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

          {!verValores && (
            <p className="text-xs text-muted-foreground">
              
            </p>
          )}
        </>
      )}
    </div>
  );
}
