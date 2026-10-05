import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { formatMoney, statusLabels, type ServicoStatus } from "@/lib/servico";
import type { Servico, Aviso } from "@/lib/types";
import { deveAparecerNaTelaInicial, getUrgenciaAviso, formatarDataBR } from "@/lib/avisos";
import { toast } from "sonner";
import {
  CalendarClock,
  Loader2,
  ClipboardCheck,
  Wallet,
  CheckCircle2,
  ArrowRight,
  Clock,
  UserCheck,
  BellRing,
  Calendar,
  Phone,
  MessageCircle,
} from "lucide-react";
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
  const qc = useQueryClient();
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

  // Consulta avisos ativos para exibir na tela inicial
  const { data: todosAvisos = [] } = useQuery({
    queryKey: ["avisos-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("*, rel_clientes:clientes(id, nome, telefone, cidade, bairro)")
        .order("data_aviso", { ascending: true });
      if (error) return [];
      return (data || []) as unknown as Aviso[];
    },
    refetchInterval: 15000,
  });

  const avisosAtivos = todosAvisos.filter(deveAparecerNaTelaInicial);

  const resolverMutation = useMutation({
    mutationFn: async (avisoId: string) => {
      const { error } = await supabase
        .from("avisos")
        .update({
          status: "resolvido",
          resolvido_em: new Date().toISOString(),
        })
        .eq("id", avisoId);
      if (error) throw error;
      return avisoId;
    },
    onSuccess: () => {
      toast.success("Aviso marcado como resolvido!");
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["avisos-entrada"] });
      qc.invalidateQueries({ queryKey: ["avisos-dashboard"] });
      qc.invalidateQueries({ queryKey: ["avisos-count-badge"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao resolver aviso: ${err.message || err}`);
    },
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
            <Link to="/avisos">
              <BellRing className="mr-2 h-4 w-4 text-amber-600" /> Avisos
              {avisosAtivos.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {avisosAtivos.length}
                </span>
              )}
            </Link>
          </Button>
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

      {/* Seção de Avisos Ativos na Tela Inicial */}
      {avisosAtivos.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
                <BellRing className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                  <span>Avisos e Lembretes Ativos</span>
                  <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    {avisosAtivos.length} {avisosAtivos.length === 1 ? "aviso" : "avisos"}
                  </span>
                </h3>
                <p className="text-xs text-amber-800/80">
                  Lembretes agendados para hoje, amanhã ou dias anteriores aguardando resolução:
                </p>
              </div>
            </div>

            <Button asChild variant="ghost" size="sm" className="text-xs text-amber-900 hover:text-amber-950 hover:bg-amber-200/50">
              <Link to="/avisos">
                Ver todos os avisos <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {avisosAtivos.slice(0, 4).map((aviso) => {
              const urg = getUrgenciaAviso(aviso);
              const cliente = aviso.rel_clientes || aviso.clientes;
              const telLimpo = cliente?.telefone?.replace(/\D/g, "");

              return (
                <div
                  key={aviso.id}
                  className="rounded-lg border border-amber-200 bg-white p-3 shadow-2xs flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${urg.badgeClass}`}>
                        {urg.label}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatarDataBR(aviso.data_aviso)}
                      </span>
                    </div>

                    {aviso.titulo && (
                      <h4 className="text-xs font-bold text-slate-900">
                        {aviso.titulo}
                      </h4>
                    )}

                    <p className="text-xs text-slate-700 whitespace-pre-line line-clamp-3 bg-slate-50 p-2 rounded border border-slate-100">
                      {aviso.mensagem}
                    </p>

                    {cliente && (
                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
                        <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                          {cliente.nome}
                        </span>
                        {cliente.telefone && (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${telLimpo}`}
                              className="text-slate-500 hover:text-slate-800"
                            >
                              <Phone className="w-3 h-3" />
                            </a>
                            <a
                              href={`https://wa.me/55${telLimpo}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 font-medium"
                            >
                              <MessageCircle className="w-3 h-3" /> WhatsApp
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolverMutation.mutate(aviso.id)}
                      disabled={resolverMutation.isPending}
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white border-none gap-1 font-medium cursor-pointer shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Marcar como Resolvido
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
