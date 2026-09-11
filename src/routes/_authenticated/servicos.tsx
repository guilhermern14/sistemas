import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Wrench,
  Search,
  Download,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  Copy,
  Camera,
  Cpu,
  Package,
  Eye,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { gerarOrcamentoPdf } from "@/lib/pdf-orcamento";
import {
  formatDateTime,
  formatMoney,
  statusBadgeClass,
  statusLabels,
  tipoLabels,
  type ServicoStatus,
  type ServicoTipo,
} from "@/lib/servico";
import {
  enderecoCompleto,
  mapsUrl,
  type Cliente,
  type Servico,
  type ServicoCentral,
  type ServicoFoto,
  type ServicoProduto,
} from "@/lib/types";

export const Route = createFileRoute("/_authenticated/servicos")({
  head: () => ({
    meta: [
      {
        title: "Serviços Realizados - Nascimento Sistemas",
      },
    ],
  }),
  component: ServicosHistoricoPage,
});

function ServicosHistoricoPage() {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<"todos" | "hoje" | "semana" | "mes">("todos");

  // Detalhes e Visualização
  const [servicoDetalhe, setServicoDetalhe] = useState<Servico | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [gerandoPdfId, setGerandoPdfId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  // Buscar todos os serviços que foram concluídos / prontos / a cobrar / pagos
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos-historico-pagina"],
    queryFn: async () => {
      // Busca todos os serviços que já passaram ou estão em estado pronto, a_cobrar ou pago
      const { data, error } = await supabase
        .from("servicos")
        .select(`
          *,
          clientes:cliente_id (id, nome, telefone, endereco, numero, bairro, cidade)
        `)
        .in("status", ["pronto", "a_cobrar", "pago"])
        .order("concluido_em", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Servico[];
    },
  });

  // Query para buscar fotos, centrais e produtos do serviço aberto no modal de detalhes
  const { data: produtosDoDetalhe = [] } = useQuery({
    queryKey: ["servico-produtos-detalhe", servicoDetalhe?.id],
    queryFn: async () => {
      if (!servicoDetalhe?.id) return [];
      const { data, error } = await supabase
        .from("servico_produtos")
        .select("*")
        .eq("servico_id", servicoDetalhe.id);
      if (error) throw error;
      return (data || []) as ServicoProduto[];
    },
    enabled: !!servicoDetalhe?.id,
  });

  const { data: fotosDoDetalhe = [] } = useQuery({
    queryKey: ["servico-fotos-detalhe", servicoDetalhe?.id],
    queryFn: async () => {
      if (!servicoDetalhe?.id) return [];
      const { data, error } = await supabase
        .from("servico_fotos")
        .select("*")
        .eq("servico_id", servicoDetalhe.id)
        .order("created_at");
      if (error) throw error;
      return (data || []) as ServicoFoto[];
    },
    enabled: !!servicoDetalhe?.id,
  });

  const { data: centraisDoDetalhe = [] } = useQuery({
    queryKey: ["servico-centrais-detalhe", servicoDetalhe?.id],
    queryFn: async () => {
      if (!servicoDetalhe?.id) return [];
      const { data, error } = await supabase
        .from("servico_centrais")
        .select("*")
        .eq("servico_id", servicoDetalhe.id);
      if (error) throw error;
      return (data || []) as ServicoCentral[];
    },
    enabled: !!servicoDetalhe?.id,
  });

  // Filtragem dos serviços
  const servicosFiltrados = useMemo(() => {
    let list = servicos;

    // Filtro por status
    if (filtroStatus !== "todos") {
      list = list.filter((s) => s.status === filtroStatus);
    }

    // Filtro por tipo
    if (filtroTipo !== "todos") {
      list = list.filter((s) => s.tipo === filtroTipo);
    }

    // Filtro por período
    if (filtroPeriodo !== "todos") {
      const agora = new Date();
      list = list.filter((s) => {
        const dataConclusao = new Date(s.concluido_em || s.data_agendada || s.created_at);
        if (isNaN(dataConclusao.getTime())) return true;

        if (filtroPeriodo === "hoje") {
          return (
            dataConclusao.getDate() === agora.getDate() &&
            dataConclusao.getMonth() === agora.getMonth() &&
            dataConclusao.getFullYear() === agora.getFullYear()
          );
        }

        if (filtroPeriodo === "semana") {
          const diffDays = (agora.getTime() - dataConclusao.getTime()) / (1000 * 3600 * 24);
          return diffDays >= 0 && diffDays <= 7;
        }

        if (filtroPeriodo === "mes") {
          return (
            dataConclusao.getMonth() === agora.getMonth() &&
            dataConclusao.getFullYear() === agora.getFullYear()
          );
        }

        return true;
      });
    }

    // Busca textual
    if (busca.trim()) {
      const term = busca.toLowerCase();
      list = list.filter((s) => {
        const clienteNome = s.clientes?.nome?.toLowerCase() || "";
        const tel = s.clientes?.telefone || "";
        const cid = s.clientes?.cidade?.toLowerCase() || "";
        const num = String(s.numero_pedido || "");
        const rel = s.relatorio?.toLowerCase() || "";
        const desc = s.descricao?.toLowerCase() || "";
        return (
          clienteNome.includes(term) ||
          tel.includes(term) ||
          cid.includes(term) ||
          num.includes(term) ||
          rel.includes(term) ||
          desc.includes(term)
        );
      });
    }

    return list;
  }, [servicos, filtroStatus, filtroTipo, filtroPeriodo, busca]);

  // Estatísticas do topo
  const stats = useMemo(() => {
    const total = servicos.length;
    const prontos = servicos.filter((s) => s.status === "pronto").length;
    const pagos = servicos.filter((s) => s.status === "pago").length;
    const valorTotalExecutado = servicos.reduce((acc, s) => acc + Number(s.valor_total || 0), 0);

    return {
      total,
      prontos,
      pagos,
      valorTotalExecutado,
    };
  }, [servicos]);

  // Baixar PDF da Ordem de Serviço / Serviço Concluído
  const handleBaixarPdf = async (s: Servico) => {
    try {
      setGerandoPdfId(s.id);
      toast.loading("Gerando PDF da Ordem de Serviço...", { id: "pdf-servico-toast" });

      const [{ data: produtos }, { data: fotos }] = await Promise.all([
        supabase.from("servico_produtos").select("*").eq("servico_id", s.id),
        supabase.from("servico_fotos").select("*").eq("servico_id", s.id).order("created_at"),
      ]);

      const ok = await gerarOrcamentoPdf(
        s,
        (produtos || []) as ServicoProduto[],
        (fotos || []) as never
      );

      if (ok) {
        toast.success("PDF da Ordem de Serviço baixado com sucesso!", { id: "pdf-servico-toast" });
      } else {
        toast.error("Não foi possível gerar o PDF.", { id: "pdf-servico-toast" });
      }
    } catch (err: any) {
      toast.error(`Erro ao baixar PDF: ${err.message || err}`, { id: "pdf-servico-toast" });
    } finally {
      setGerandoPdfId(null);
    }
  };

  const copiarTexto = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="space-y-6 pb-12" id="pagina-servicos-historico">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Wrench className="w-7 h-7 text-blue-600" />
            Serviços Realizados
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Histórico permanente de todos os serviços concluídos. Consulte relatórios técnicos, fotos de execução, produtos aplicados e dados de centrais.
          </p>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Total de Serviços Executados</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-600 font-medium">Serviços Prontos</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.prontos}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Aguardando cobrança/fechamento</div>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Serviços Pagos / Faturados</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stats.pagos}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Ciclo financeiro concluído</div>
            </div>
            <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Faturamento Total Executado</div>
              <div className="text-xl font-bold text-blue-700 mt-1">
                {formatMoney(stats.valorTotalExecutado)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Soma de mão de obra e materiais</div>
            </div>
            <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <Input
            placeholder="Buscar por cliente, OS, telefone ou relatório..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 h-10 text-sm bg-slate-50 border-slate-200"
            id="busca-servicos-input"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Filtro Status */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Status: Todos</option>
            <option value="pronto">Pronto</option>
            <option value="a_cobrar">A Cobrar</option>
            <option value="pago">Pago / Finalizado</option>
          </select>

          {/* Filtro Tipo */}
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Tipo: Todos</option>
            <option value="instalacao">Instalação</option>
            <option value="manutencao">Manutenção</option>
            <option value="orcamento">Orçamento</option>
          </select>

          {/* Filtro Período */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            {(["todos", "hoje", "semana", "mes"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFiltroPeriodo(p)}
                className={`px-2.5 py-1.5 rounded-md capitalize transition-colors ${
                  filtroPeriodo === p
                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {p === "todos" ? "Todos" : p === "semana" ? "Semana" : p === "mes" ? "Mês" : "Hoje"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de Serviços Executados */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
            Carregando histórico de serviços...
          </div>
        ) : servicosFiltrados.length === 0 ? (
          <div className="p-12 text-center space-y-3 bg-white rounded-xl border border-slate-200 shadow-sm">
            <Wrench className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-base font-semibold text-slate-700">Nenhum serviço encontrado</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {busca || filtroStatus !== "todos" || filtroTipo !== "todos"
                ? "Nenhum serviço corresponde aos filtros selecionados."
                : "Quando um serviço for marcado como 'Pronto', ele aparecerá automaticamente aqui nesta página para consulta futura."}
            </p>
          </div>
        ) : (
          servicosFiltrados.map((s) => {
            const cliente = s.clientes;
            const end = enderecoCompleto(cliente);
            const dataExec = s.concluido_em || s.data_agendada || s.created_at;
            const isExpandido = expandidoId === s.id;

            return (
              <Card
                key={s.id}
                className="border border-slate-200 shadow-sm hover:shadow transition-shadow overflow-hidden bg-white"
              >
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Cabeçalho do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-blue-700 text-base">
                        OS #{s.numero_pedido || "0000"}
                      </span>
                      <Badge variant="outline" className="text-xs font-semibold bg-slate-50">
                        {tipoLabels[s.tipo as ServicoTipo] || s.tipo}
                      </Badge>
                      <Badge className={`text-xs font-semibold ${statusBadgeClass[s.status as ServicoStatus]}`}>
                        {statusLabels[s.status as ServicoStatus] || s.status}
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Concluído: {formatDateTime(dataExec)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Informações do Cliente e Resumo */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-8 space-y-1.5">
                      <div className="font-bold text-base text-slate-900 flex items-center gap-2">
                        <span>{cliente?.nome || "Cliente Não Identificado"}</span>
                        {cliente?.telefone && (
                          <a
                            href={`https://wa.me/55${cliente.telefone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50"
                            title="Conversar no WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>

                      {end && (
                        <div className="text-xs text-slate-500 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{end}</span>
                          {mapsUrl(cliente) && (
                            <a
                              href={mapsUrl(cliente)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-[11px] ml-1 flex items-center gap-0.5"
                            >
                              Ver mapa <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Relatório Técnico da Execução */}
                      {s.relatorio ? (
                        <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <span className="font-semibold text-slate-700 block mb-0.5">
                            O que foi feito (Relatório Técnico):
                          </span>
                          <p className="text-slate-600 whitespace-pre-line line-clamp-3">
                            {s.relatorio}
                          </p>
                        </div>
                      ) : s.descricao ? (
                        <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <span className="font-semibold text-slate-700 block mb-0.5">
                            Descrição do Serviço:
                          </span>
                          <p className="text-slate-600 whitespace-pre-line line-clamp-3">
                            {s.descricao}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* Valores e Ações à Direita */}
                    <div className="md:col-span-4 flex flex-col md:items-end justify-between gap-3 h-full pt-1">
                      <div className="text-left md:text-right">
                        <div className="text-xs text-slate-400 font-medium">Valor Total do Serviço</div>
                        <div className="text-2xl font-black text-slate-900">
                          {formatMoney(s.valor_total)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Mão de obra: {s.horas_mao_obra || 0}h ({formatMoney(s.valor_mao_obra)})
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Baixar PDF do Serviço */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleBaixarPdf(s)}
                          disabled={gerandoPdfId === s.id}
                          className="h-8 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50 gap-1.5"
                          title="Baixar PDF com relatório técnico e fotos"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar PDF da OS
                        </Button>

                        {/* Ver Detalhes Completos */}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setServicoDetalhe(s)}
                          className="h-8 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver Dossiê
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal Dossiê Completo do Serviço */}
      {servicoDetalhe && (
        <Dialog open={!!servicoDetalhe} onOpenChange={(v) => !v && setServicoDetalhe(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6" id="dossie-servico-dialog">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <span>Ordem de Serviço #{servicoDetalhe.numero_pedido || "0000"}</span>
                    <Badge variant="outline" className="text-xs bg-slate-50">
                      {tipoLabels[servicoDetalhe.tipo as ServicoTipo] || servicoDetalhe.tipo}
                    </Badge>
                  </DialogTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cliente: <strong>{servicoDetalhe.clientes?.nome}</strong> · Concluído em{" "}
                    {formatDateTime(servicoDetalhe.concluido_em || servicoDetalhe.data_agendada)}
                  </p>
                </div>
                <Badge className={`text-xs ${statusBadgeClass[servicoDetalhe.status as ServicoStatus]}`}>
                  {statusLabels[servicoDetalhe.status as ServicoStatus]}
                </Badge>
              </div>
            </DialogHeader>

            <div className="space-y-5 pt-2 text-xs">
              {/* Cliente e Endereço */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-semibold text-slate-800 text-sm flex items-center justify-between">
                  <span>{servicoDetalhe.clientes?.nome}</span>
                  {servicoDetalhe.clientes?.telefone && (
                    <span className="text-xs text-slate-600 font-normal">
                      Telefone: <strong>{servicoDetalhe.clientes.telefone}</strong>
                    </span>
                  )}
                </div>
                {enderecoCompleto(servicoDetalhe.clientes) && (
                  <div className="text-slate-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{enderecoCompleto(servicoDetalhe.clientes)}</span>
                  </div>
                )}
              </div>

              {/* Relatório Técnico da Execução */}
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Relatório Técnico do que foi feito
                </div>
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl text-slate-700 whitespace-pre-line leading-relaxed shadow-sm">
                  {servicoDetalhe.relatorio ||
                    servicoDetalhe.descricao ||
                    "Nenhum relatório técnico cadastrado para esta ordem de serviço."}
                </div>
              </div>

              {/* Centrais Instaladas / Configuradas */}
              {centraisDoDetalhe.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
                    <Cpu className="w-4 h-4 text-indigo-600" />
                    Centrais e Equipamentos Configurados ({centraisDoDetalhe.length})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {centraisDoDetalhe.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-1.5"
                      >
                        <div className="font-bold text-indigo-950 text-xs flex items-center justify-between">
                          <span>{c.nome}</span>
                          {c.mac && (
                            <button
                              type="button"
                              onClick={() => copiarTexto(c.mac!, "MAC")}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                              title="Copiar MAC"
                            >
                              <Copy className="w-3 h-3" /> Copiar MAC
                            </button>
                          )}
                        </div>
                        {c.mac && (
                          <div className="text-slate-600 font-mono text-[11px]">
                            <strong>MAC:</strong> {c.mac}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-indigo-100 text-[11px]">
                          <div>
                            <strong>Usuário:</strong> {c.usuario || "—"}
                          </div>
                          <div>
                            <strong>Senha:</strong> {c.senha || "—"}
                          </div>
                          {c.senha && (
                            <button
                              type="button"
                              onClick={() => copiarTexto(c.senha!, "Senha")}
                              className="text-indigo-600 hover:text-indigo-800"
                              title="Copiar senha"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fotos de Execução */}
              {fotosDoDetalhe.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    Fotos da Execução e Equipamentos ({fotosDoDetalhe.length})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {fotosDoDetalhe.map((foto) => {
                      const imgUrl = foto.url || (foto as any).foto_url || "";
                      return (
                        <div
                          key={foto.id}
                          onClick={() => setFotoAmpliada(imgUrl)}
                          className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100 cursor-pointer shadow-sm"
                        >
                          <img
                            src={imgUrl}
                            alt="Foto da execução"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                            <Eye className="w-4 h-4 mr-1" /> Ampliar
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Produtos e Materiais Utilizados */}
              <div className="space-y-2">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
                  <Package className="w-4 h-4 text-blue-600" />
                  Produtos e Equipamentos Utilizados ({produtosDoDetalhe.length})
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-2.5">Produto</th>
                        <th className="p-2.5 text-center">Qtd</th>
                        <th className="p-2.5 text-right">Unitário</th>
                        <th className="p-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {produtosDoDetalhe.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-400">
                            Nenhum produto registrado para este serviço.
                          </td>
                        </tr>
                      ) : (
                        produtosDoDetalhe.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2.5 font-medium text-slate-800">
                              {p.produto}
                              {p.codigo && (
                                <span className="text-[10px] text-slate-400 ml-1.5">({p.codigo})</span>
                              )}
                            </td>
                            <td className="p-2.5 text-center">{p.quantidade} {p.unidade}</td>
                            <td className="p-2.5 text-right text-slate-600">{formatMoney(p.valor_unitario)}</td>
                            <td className="p-2.5 text-right font-semibold text-slate-900">
                              {formatMoney((p.quantidade || 0) * (p.valor_unitario || 0))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mão de Obra e Valores Finais */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Mão de Obra ({servicoDetalhe.horas_mao_obra || 0}h):
                  </span>
                  <span className="font-semibold text-slate-800">
                    {formatMoney(servicoDetalhe.valor_mao_obra)}
                  </span>
                </div>
                {Number(servicoDetalhe.custo_adicional || 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>
                      {servicoDetalhe.descricao_custo_adicional || "Despesas / Deslocamento"}:
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatMoney(servicoDetalhe.custo_adicional)}
                    </span>
                  </div>
                )}
                {Number(servicoDetalhe.desconto || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Desconto concedido:</span>
                    <span className="font-semibold">- {formatMoney(servicoDetalhe.desconto)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-extrabold text-slate-900">
                  <span>VALOR TOTAL DO SERVIÇO:</span>
                  <span className="text-blue-700 text-base">{formatMoney(servicoDetalhe.valor_total)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={() => setServicoDetalhe(null)}>
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={() => handleBaixarPdf(servicoDetalhe)}
                disabled={gerandoPdfId === servicoDetalhe.id}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar PDF Completo da OS
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Foto Ampliada */}
      {fotoAmpliada && (
        <Dialog open={!!fotoAmpliada} onOpenChange={(v) => !v && setFotoAmpliada(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/95 border-none text-white">
            <div className="relative flex flex-col items-center justify-center p-2">
              <img
                src={fotoAmpliada}
                alt="Foto ampliada da execução"
                className="max-h-[80vh] w-auto object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFotoAmpliada(null)}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white border-white/20"
                >
                  Fechar
                </Button>
                <a
                  href={fotoAmpliada}
                  download="foto-execucao.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Abrir Original
                </a>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
