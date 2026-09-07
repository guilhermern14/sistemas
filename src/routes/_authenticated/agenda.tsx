import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Filter,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Search,
  User,
  Wrench,
} from "lucide-react";
import { formatMoney, statusBadgeClass, statusLabels, tipoLabels } from "@/lib/servico";
import type { Servico } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Agenda de serviços, atendimentos e clientes em formato linear por dia, semana, mês e ano." },
      { property: "og:title", content: "Agenda — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Agenda e compromissos por dia, semana, mês e ano." },
    ],
  }),
  component: AgendaPage,
});

type TipoFiltroPeriodo = "hoje" | "dia_semana" | "data_especifica" | "semana" | "mes" | "ano" | "todos";

const DIAS_SEMANA = [
  { valor: 1, nome: "Segunda", nomeCompleto: "Segunda-feira" },
  { valor: 2, nome: "Terça", nomeCompleto: "Terça-feira" },
  { valor: 3, nome: "Quarta", nomeCompleto: "Quarta-feira" },
  { valor: 4, nome: "Quinta", nomeCompleto: "Quinta-feira" },
  { valor: 5, nome: "Sexta", nomeCompleto: "Sexta-feira" },
  { valor: 6, nome: "Sábado", nomeCompleto: "Sábado" },
];

const NOMES_DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function formatarDataHora(dataIso: string | null | undefined) {
  if (!dataIso) return { dataFormatada: "--/--/----", horaFormatada: "--:--", diaSemana: "", dataObj: null };
  const d = new Date(dataIso);
  if (isNaN(d.getTime())) return { dataFormatada: "--/--/----", horaFormatada: "--:--", diaSemana: "", dataObj: null };

  const pad = (n: number) => String(n).padStart(2, "0");
  const dataFormatada = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const horaFormatada = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diaSemana = NOMES_DIAS[d.getDay()] || "";

  return { dataFormatada, horaFormatada, diaSemana, dataObj: d };
}

function AgendaPage() {
  const { role, user } = useAuth();
  const verValores = canSeeValues(role);
  const ehCampo = role === "campo";

  const [busca, setBusca] = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState<TipoFiltroPeriodo>("hoje");
  const [diaSemanaSelecionado, setDiaSemanaSelecionado] = useState<number>(() => {
    const hojeDia = new Date().getDay();
    return hojeDia === 0 ? 1 : hojeDia; // Se domingo, seleciona segunda por padrão
  });
  const [dataEspecifica, setDataEspecifica] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [mesSelecionado, setMesSelecionado] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [anoSelecionado, setAnoSelecionado] = useState<number>(() => new Date().getFullYear());
  const [statusFiltro, setStatusFiltro] = useState<"pendentes" | "todos">("pendentes");
  const [detalhesServico, setDetalhesServico] = useState<Servico | null>(null);

  // Consulta de serviços agendados
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["agenda-servicos", role, user?.id, statusFiltro],
    queryFn: async () => {
      let q = supabase
        .from("servicos")
        .select("*, clientes(nome, telefone, endereco, numero, bairro, cidade)")
        .not("data_agendada", "is", null)
        .order("data_agendada", { ascending: true });

      if (statusFiltro === "pendentes") {
        q = q.in("status", ["agendado", "em_andamento"]);
      }

      if (ehCampo && user?.id) {
        q = q.eq("tecnico_id", user.id);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Servico[];
    },
    refetchInterval: 5000,
  });

  // Consulta de perfis para mostrar nome do técnico
  const { data: profiles = [] } = useQuery({
    queryKey: ["agenda-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) return [];
      return data as { id: string; nome: string }[];
    },
  });

  const profilesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) {
      if (p.id && p.nome) map.set(p.id, p.nome);
    }
    return map;
  }, [profiles]);

  // Ordenação rigorosa por data e hora cronológica
  const servicosOrdenados = useMemo(() => {
    return [...servicos].sort((a, b) => {
      const timeA = a.data_agendada ? new Date(a.data_agendada).getTime() : 0;
      const timeB = b.data_agendada ? new Date(b.data_agendada).getTime() : 0;
      return timeA - timeB;
    });
  }, [servicos]);

  // Filtragem dos serviços por período e busca
  const servicosFiltrados = useMemo(() => {
    const agora = new Date();

    return servicosOrdenados.filter((s) => {
      // 1. Filtro de Texto
      const termo = busca.trim().toLowerCase();
      if (termo) {
        const strBusca = `${s.numero_pedido ?? ""} ${s.clientes?.nome ?? ""} ${s.clientes?.telefone ?? ""} ${s.clientes?.cidade ?? ""} ${s.clientes?.bairro ?? ""} ${s.tipo ?? ""} ${s.descricao ?? ""} ${s.status ?? ""}`.toLowerCase();
        if (!strBusca.includes(termo)) return false;
      }

      if (!s.data_agendada) return filtroPeriodo === "todos";
      const dataS = new Date(s.data_agendada);
      if (isNaN(dataS.getTime())) return filtroPeriodo === "todos";

      // 2. Filtro de Período
      if (filtroPeriodo === "hoje") {
        return (
          dataS.getFullYear() === agora.getFullYear() &&
          dataS.getMonth() === agora.getMonth() &&
          dataS.getDate() === agora.getDate()
        );
      }

      if (filtroPeriodo === "dia_semana") {
        return dataS.getDay() === diaSemanaSelecionado;
      }

      if (filtroPeriodo === "data_especifica" && dataEspecifica) {
        const [ano, mes, dia] = dataEspecifica.split("-").map(Number);
        return (
          dataS.getFullYear() === ano &&
          dataS.getMonth() + 1 === mes &&
          dataS.getDate() === dia
        );
      }

      if (filtroPeriodo === "semana") {
        const diaSemanaHoje = agora.getDay();
        const distSegunda = diaSemanaHoje === 0 ? -6 : 1 - diaSemanaHoje;
        const inicioSemana = new Date(agora);
        inicioSemana.setDate(agora.getDate() + distSegunda);
        inicioSemana.setHours(0, 0, 0, 0);

        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(inicioSemana.getDate() + 6);
        fimSemana.setHours(23, 59, 59, 999);

        return dataS.getTime() >= inicioSemana.getTime() && dataS.getTime() <= fimSemana.getTime();
      }

      if (filtroPeriodo === "mes") {
        if (mesSelecionado) {
          const [ano, mes] = mesSelecionado.split("-").map(Number);
          return dataS.getFullYear() === ano && dataS.getMonth() + 1 === mes;
        }
        return (
          dataS.getFullYear() === agora.getFullYear() &&
          dataS.getMonth() === agora.getMonth()
        );
      }

      if (filtroPeriodo === "ano") {
        return dataS.getFullYear() === Number(anoSelecionado);
      }

      return true;
    });
  }, [servicosOrdenados, busca, filtroPeriodo, diaSemanaSelecionado, dataEspecifica, mesSelecionado, anoSelecionado]);

  // Contadores para os botões de filtro
  const contadores = useMemo(() => {
    const agora = new Date();
    let hoje = 0;
    let semana = 0;
    let mes = 0;
    let ano = 0;

    const diaSemanaHoje = agora.getDay();
    const distSegunda = diaSemanaHoje === 0 ? -6 : 1 - diaSemanaHoje;
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() + distSegunda);
    inicioSemana.setHours(0, 0, 0, 0);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    fimSemana.setHours(23, 59, 59, 999);

    for (const s of servicosOrdenados) {
      if (!s.data_agendada) continue;
      const d = new Date(s.data_agendada);
      if (isNaN(d.getTime())) continue;

      if (d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth() && d.getDate() === agora.getDate()) {
        hoje++;
      }
      if (d.getTime() >= inicioSemana.getTime() && d.getTime() <= fimSemana.getTime()) {
        semana++;
      }
      if (d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth()) {
        mes++;
      }
      if (d.getFullYear() === Number(anoSelecionado)) {
        ano++;
      }
    }

    return { todos: servicosOrdenados.length, hoje, semana, mes, ano };
  }, [servicosOrdenados, anoSelecionado]);

  // Função para copiar a lista no formato de texto: "07/09/2026 - 08:00 - Guilherme Nascimento"
  const copiarListaTexto = () => {
    if (servicosFiltrados.length === 0) {
      toast.error("Nenhum agendamento na lista para copiar.");
      return;
    }

    const linhas = servicosFiltrados.map((s) => {
      const { dataFormatada, horaFormatada } = formatarDataHora(s.data_agendada);
      const clienteNome = s.clientes?.nome || "Cliente sem nome";
      const tipo = tipoLabels[s.tipo] || s.tipo;
      const fone = s.clientes?.telefone ? ` - ${s.clientes.telefone}` : "";
      const cidade = s.clientes?.cidade ? ` (${s.clientes.cidade})` : "";
      return `${dataFormatada} - ${horaFormatada} - ${clienteNome}${cidade} - ${tipo}${fone}`;
    });

    const textoCompleto = `*AGENDA - NASCIMENTO SISTEMAS DE SEGURANÇA*\n\n${linhas.join("\n")}`;

    navigator.clipboard.writeText(textoCompleto);
    toast.success("Agenda copiada para a área de transferência!");
  };

  const imprimirAgenda = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visualização linear da agenda de atendimentos (1 cliente por linha) com filtros por dia, semana, mês e ano.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copiarListaTexto}
            className="gap-1.5 text-xs font-medium"
            title="Copiar lista de agendamentos para o WhatsApp"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar Texto
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={imprimirAgenda}
            className="gap-1.5 text-xs font-medium"
            title="Imprimir visualização da agenda"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 text-sm"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar por cliente, telefone, cidade ou serviço na agenda..."
            />
          </div>

          {/* Seletores específicos de acordo com o filtro ativo */}
          <div className="flex flex-wrap items-center gap-2">
            {filtroPeriodo === "data_especifica" && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Data:</Label>
                <Input
                  type="date"
                  className="w-auto h-9 text-xs"
                  value={dataEspecifica}
                  onChange={(e) => setDataEspecifica(e.target.value)}
                />
              </div>
            )}

            {filtroPeriodo === "mes" && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Mês:</Label>
                <Input
                  type="month"
                  className="w-auto h-9 text-xs"
                  value={mesSelecionado}
                  onChange={(e) => setMesSelecionado(e.target.value)}
                />
              </div>
            )}

            {filtroPeriodo === "ano" && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Ano:</Label>
                <Input
                  type="number"
                  min="2020"
                  max="2035"
                  className="w-24 h-9 text-xs"
                  value={anoSelecionado}
                  onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                />
              </div>
            )}

            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-md border text-xs">
              <button
                type="button"
                className={`px-2 py-1 rounded transition-colors ${statusFiltro === "pendentes" ? "bg-background font-semibold shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setStatusFiltro("pendentes")}
              >
                Agendados
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded transition-colors ${statusFiltro === "todos" ? "bg-background font-semibold shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setStatusFiltro("todos")}
              >
                Todos
              </button>
            </div>
          </div>
        </div>

        {/* Botões de Filtro Principal: Dia / Semana / Mês / Ano */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-lg border text-xs">
          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "hoje" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("hoje")}
          >
            <Calendar className="h-3.5 w-3.5" />
            Hoje ({contadores.hoje})
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "dia_semana" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("dia_semana")}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Por Dia da Semana
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "data_especifica" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("data_especifica")}
          >
            <Filter className="h-3.5 w-3.5" />
            Data específica
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "semana" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("semana")}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Semana ({contadores.semana})
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "mes" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("mes")}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Mês ({contadores.mes})
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "ano" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("ano")}
          >
            <Calendar className="h-3.5 w-3.5" />
            Ano ({contadores.ano})
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "todos" ? "default" : "ghost"}
            className="h-8 px-3 text-xs"
            onClick={() => setFiltroPeriodo("todos")}
          >
            Todos ({contadores.todos})
          </Button>
        </div>

        {/* Sub-filtro de Dias da Semana (Segunda a Sábado) */}
        {filtroPeriodo === "dia_semana" && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-primary/5 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-1">
            <span className="text-xs font-semibold text-primary mr-1">Dia da semana:</span>
            {DIAS_SEMANA.map((dia) => {
              const ativo = diaSemanaSelecionado === dia.valor;
              const countDia = servicosOrdenados.filter((s) => {
                if (!s.data_agendada) return false;
                const d = new Date(s.data_agendada);
                return !isNaN(d.getTime()) && d.getDay() === dia.valor;
              }).length;

              return (
                <Button
                  key={dia.valor}
                  type="button"
                  size="sm"
                  variant={ativo ? "default" : "outline"}
                  className={`h-7 px-2.5 text-xs ${ativo ? "" : "bg-background"}`}
                  onClick={() => setDiaSemanaSelecionado(dia.valor)}
                >
                  {dia.nome} ({countDia})
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista da Agenda em Linha (1 Cliente por Linha) */}
      {isLoading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          Carregando agenda de atendimentos...
        </div>
      ) : servicosFiltrados.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-2">
          <CalendarClock className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
          <p className="font-semibold text-base">Nenhum agendamento encontrado</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Não há clientes agendados para o filtro selecionado. Tente mudar o período ou a busca.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground px-2 flex justify-between items-center">
            <span>
              Mostrando <strong className="text-foreground">{servicosFiltrados.length}</strong> {servicosFiltrados.length === 1 ? "agendamento" : "agendamentos"}
            </span>
            <span className="hidden sm:inline font-mono text-[11px] text-muted-foreground">
              Formato: DATA - HORA - NOME DO CLIENTE
            </span>
          </div>

          <div className="surface-card divide-y overflow-hidden rounded-xl border shadow-xs">
            {servicosFiltrados.map((s, index) => {
              const { dataFormatada, horaFormatada, diaSemana } = formatarDataHora(s.data_agendada);
              const clienteNome = s.clientes?.nome || "Cliente sem nome";
              const foneLimpo = s.clientes?.telefone ? s.clientes.telefone.replace(/\D/g, "") : null;
              const foneWhatsapp = foneLimpo ? (foneLimpo.startsWith("55") ? foneLimpo : `55${foneLimpo}`) : null;
              const tecnicoNome = s.tecnico_id ? profilesMap.get(s.tecnico_id) : null;

              return (
                <div
                  key={s.id}
                  className="p-3.5 hover:bg-muted/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                >
                  {/* Linha Principal: DATA - HORA - NOME DO CLIENTE */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono text-xs font-bold text-muted-foreground/70 w-6 shrink-0 text-right hidden sm:block">
                      {index + 1}.
                    </span>

                    {/* Bloco de Data e Hora em destaque linear */}
                    <div className="flex items-center gap-1.5 shrink-0 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-md text-primary">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="font-mono font-bold text-xs sm:text-sm tracking-tight">
                        {dataFormatada} - {horaFormatada}
                      </span>
                    </div>

                    {/* Separador e Nome do Cliente */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                          {clienteNome}
                        </span>

                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass[s.status]}`}>
                          {statusLabels[s.status]}
                        </span>

                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border">
                          <Wrench className="h-3 w-3" />
                          {tipoLabels[s.tipo]}
                        </span>
                      </div>

                      {/* Informações complementares sutis em uma linha abaixo ou junto */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {diaSemana && (
                          <span className="font-medium text-foreground/80">{diaSemana}</span>
                        )}

                        {s.numero_pedido && (
                          <span>OS #{s.numero_pedido}</span>
                        )}

                        {s.clientes?.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {s.clientes.telefone}
                          </span>
                        )}

                        {(s.clientes?.bairro || s.clientes?.cidade) && (
                          <span className="flex items-center gap-1 truncate max-w-xs">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {[s.clientes.bairro, s.clientes.cidade].filter(Boolean).join(" - ")}
                          </span>
                        )}

                        {tecnicoNome && (
                          <span className="flex items-center gap-1 text-primary/90 font-medium">
                            <User className="h-3 w-3" />
                            Técnico: {tecnicoNome}
                          </span>
                        )}

                        {s.duracao_estimada_minutos && (
                          <span>({s.duracao_estimada_minutos} min)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações Rápidas na Linha */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pt-1 sm:pt-0">
                    {foneWhatsapp && (
                      <a
                        href={`https://wa.me/${foneWhatsapp}?text=${encodeURIComponent(
                          `Olá! Tudo bem? 😊\n\nPassando para confirmar o seu atendimento com a Nascimento Sistemas de Segurança.\n\n📅 Data: ${dataFormatada}\n🕐 Horário: ${horaFormatada}\n\nPodemos confirmar o agendamento nesse dia e horário? Ficamos no aguardo da sua confirmação. 😊`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                        title="Enviar mensagem de confirmação no WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">WhatsApp</span>
                      </a>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2.5 text-xs gap-1"
                      onClick={() => setDetalhesServico(s)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Detalhes
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Detalhes Rápidos do Agendamento */}
      <Dialog open={!!detalhesServico} onOpenChange={(open) => !open && setDetalhesServico(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Detalhes do Agendamento
            </DialogTitle>
          </DialogHeader>

          {detalhesServico && (() => {
            const { dataFormatada, horaFormatada, diaSemana } = formatarDataHora(detalhesServico.data_agendada);
            const tecnico = detalhesServico.tecnico_id ? profilesMap.get(detalhesServico.tecnico_id) : "Não atribuído";
            const foneLimpo = detalhesServico.clientes?.telefone ? detalhesServico.clientes.telefone.replace(/\D/g, "") : null;
            const foneWhatsapp = foneLimpo ? (foneLimpo.startsWith("55") ? foneLimpo : `55${foneLimpo}`) : null;

            return (
              <div className="space-y-4 text-sm">
                {/* Linha Principal Destacada */}
                <div className="p-3 bg-muted/50 rounded-lg border font-mono text-sm space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-sans font-semibold">Linha da Agenda:</p>
                  <p className="font-bold text-foreground">
                    {dataFormatada} - {horaFormatada} - {detalhesServico.clientes?.nome || "Cliente"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="surface-card p-3 space-y-1">
                    <span className="text-muted-foreground">Data & Horário:</span>
                    <p className="font-semibold text-sm">{dataFormatada} às {horaFormatada}</p>
                    <p className="text-muted-foreground">{diaSemana} · {detalhesServico.duracao_estimada_minutos || 60} min</p>
                  </div>

                  <div className="surface-card p-3 space-y-1">
                    <span className="text-muted-foreground">Tipo & Status:</span>
                    <p className="font-semibold text-sm">{tipoLabels[detalhesServico.tipo]}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass[detalhesServico.status]}`}>
                      {statusLabels[detalhesServico.status]}
                    </span>
                  </div>
                </div>

                <div className="surface-card p-3 space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Cliente:</span>
                    <p className="font-bold text-sm">{detalhesServico.clientes?.nome}</p>
                  </div>

                  {detalhesServico.clientes?.telefone && (
                    <div>
                      <span className="text-muted-foreground">Telefone:</span>
                      <p className="font-medium">{detalhesServico.clientes.telefone}</p>
                    </div>
                  )}

                  {detalhesServico.clientes?.endereco && (
                    <div>
                      <span className="text-muted-foreground">Endereço:</span>
                      <p className="font-medium">
                        {detalhesServico.clientes.endereco}
                        {detalhesServico.clientes.numero ? `, ${detalhesServico.clientes.numero}` : ""}
                        {detalhesServico.clientes.bairro ? ` - ${detalhesServico.clientes.bairro}` : ""}
                        {detalhesServico.clientes.cidade ? ` (${detalhesServico.clientes.cidade})` : ""}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-muted-foreground">Técnico Responsável:</span>
                    <p className="font-medium text-primary">{tecnico}</p>
                  </div>

                  {detalhesServico.descricao && (
                    <div className="border-t pt-2 mt-2">
                      <span className="text-muted-foreground">Descrição do problema / serviço:</span>
                      <p className="mt-0.5 whitespace-pre-wrap">{detalhesServico.descricao}</p>
                    </div>
                  )}

                  {verValores && detalhesServico.valor && (
                    <div className="border-t pt-2 mt-2 flex justify-between font-semibold text-sm">
                      <span>Valor Previsto:</span>
                      <span className="text-primary">{formatMoney(detalhesServico.valor)}</span>
                    </div>
                  )}
                </div>

                {foneWhatsapp && (
                  <div className="pt-2 flex justify-end">
                    <a
                      href={`https://wa.me/${foneWhatsapp}?text=${encodeURIComponent(
                        `Olá! Tudo bem? 😊\n\nPassando para confirmar o seu atendimento com a Nascimento Sistemas de Segurança.\n\n📅 Data: ${dataFormatada}\n🕐 Horário: ${horaFormatada}\n\nPodemos confirmar o agendamento nesse dia e horário? Ficamos no aguardo da sua confirmação. 😊`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Confirmar no WhatsApp
                    </a>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
