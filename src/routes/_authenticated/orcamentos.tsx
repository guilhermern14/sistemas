import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Calculator,
  Plus,
  Search,
  Download,
  CheckCircle2,
  Clock,
  FileText,
  Trash2,
  Eye,
  Filter,
  Package,
  Calendar,
  User,
  ArrowRight,
  Pencil,
} from "lucide-react";
import { NovoOrcamentoDialog } from "@/components/NovoOrcamentoDialog";
import { AprovarOrcamentoDialog } from "@/components/AprovarOrcamentoDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { gerarPropostaOrcamentoPdf } from "@/lib/pdf-orcamento";
import { formatMoney } from "@/lib/servico";
import { useAuth } from "@/hooks/useAuth";
import type { Orcamento, OrcamentoItem } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({
    meta: [
      {
        title: "Orçamentos - Nascimento Sistemas",
      },
    ],
  }),
  component: OrcamentosPage,
});

function OrcamentosPage() {
  const qc = useQueryClient();
  const { role } = useAuth();

  const [dialogNovoAberto, setDialogNovoAberto] = useState(false);
  const [orcamentoParaEditar, setOrcamentoParaEditar] = useState<Orcamento | null>(null);
  const [orcamentoParaAprovar, setOrcamentoParaAprovar] = useState<Orcamento | null>(null);
  const [orcamentoParaVer, setOrcamentoParaVer] = useState<Orcamento | null>(null);
  const [orcamentoParaExcluir, setOrcamentoParaExcluir] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendente" | "aprovado">("todos");
  const [gerandoPdfId, setGerandoPdfId] = useState<string | null>(null);

  // Buscar lista de orçamentos com clientes vinculados
  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ["orcamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orcamentos")
        .select(
          `
          *,
          clientes:cliente_id (id, nome, telefone, endereco, bairro, cidade)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Orcamento[];
    },
  });

  // Buscar itens do orçamento selecionado para visualização
  const { data: itensDoOrcamentoVer = [] } = useQuery({
    queryKey: ["orcamento-itens", orcamentoParaVer?.id],
    queryFn: async () => {
      if (!orcamentoParaVer?.id) return [];
      const { data, error } = await supabase
        .from("orcamento_itens")
        .select("*")
        .eq("orcamento_id", orcamentoParaVer.id);
      if (error) throw error;
      return (data || []) as OrcamentoItem[];
    },
    enabled: !!orcamentoParaVer?.id,
  });

  // Filtragem dos orçamentos
  const orcamentosFiltrados = useMemo(() => {
    let list = orcamentos;

    if (filtroStatus !== "todos") {
      list = list.filter((o) => o.status === filtroStatus);
    }

    if (busca.trim()) {
      const term = busca.toLowerCase();
      list = list.filter((o) => {
        const nomeCliente = o.clientes?.nome?.toLowerCase() || "";
        const num = String(o.numero || "");
        const desc = o.descricao?.toLowerCase() || "";
        return nomeCliente.includes(term) || num.includes(term) || desc.includes(term);
      });
    }

    return list;
  }, [orcamentos, filtroStatus, busca]);

  // Estatísticas do topo
  const stats = useMemo(() => {
    const total = orcamentos.length;
    const pendentes = orcamentos.filter((o) => o.status === "pendente");
    const aprovados = orcamentos.filter((o) => o.status === "aprovado");

    const valorAprovado = aprovados.reduce((acc, o) => acc + Number(o.valor_total || 0), 0);
    const valorPendente = pendentes.reduce((acc, o) => acc + Number(o.valor_total || 0), 0);

    return {
      total,
      qtdPendentes: pendentes.length,
      valorPendente,
      qtdAprovados: aprovados.length,
      valorAprovado,
    };
  }, [orcamentos]);

  // Função para baixar o PDF da proposta comercial
  const handleBaixarPdf = async (orc: Orcamento) => {
    try {
      setGerandoPdfId(orc.id);
      toast.loading("Gerando PDF do orçamento...", { id: "pdf-toast" });

      // Buscar itens atualizados do orçamento
      const { data: itens, error } = await supabase
        .from("orcamento_itens")
        .select("*")
        .eq("orcamento_id", orc.id);

      if (error) throw error;

      const ok = await gerarPropostaOrcamentoPdf(orc, (itens || []) as OrcamentoItem[]);
      if (ok) {
        toast.success("PDF baixado com sucesso!", { id: "pdf-toast" });
      } else {
        toast.error("Não foi possível gerar o PDF.", { id: "pdf-toast" });
      }
    } catch (err: any) {
      toast.error(`Erro ao gerar PDF: ${err.message || err}`, { id: "pdf-toast" });
    } finally {
      setGerandoPdfId(null);
    }
  };

  // Exclusão de orçamento
  const mutationExcluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orcamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
      toast.success("Orçamento excluído.");
      setOrcamentoParaExcluir(null);
    },
    onError: (err: any) => {
      toast.error(`Erro ao excluir: ${err.message || err}`);
    },
  });

  return (
    <div className="space-y-6 pb-12" id="pagina-orcamentos">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-7 h-7 text-blue-600" />
            Orçamentos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Crie propostas comerciais com produtos do estoque, emita o PDF para o cliente e aprove
            orçamentos para agendamento.
          </p>
        </div>

        <Button
          onClick={() => setDialogNovoAberto(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 shadow-sm h-11 px-5"
          id="btn-criar-novo-orcamento"
        >
          <Plus className="w-4 h-4" />
          Criar Novo Orçamento
        </Button>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Total de Orçamentos</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-amber-600 font-medium">Pendentes (Em Aberto)</div>
              <div className="text-2xl font-bold text-amber-700 mt-1">{stats.qtdPendentes}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {formatMoney(stats.valorPendente)}
              </div>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-600 font-medium">Aprovados</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.qtdAprovados}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {formatMoney(stats.valorAprovado)}
              </div>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Faturamento Aprovado</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {formatMoney(stats.valorAprovado)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {stats.total > 0
                  ? `${Math.round((stats.qtdAprovados / stats.total) * 100)}% de conversão`
                  : "0% conversão"}
              </div>
            </div>
            <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
              <Calculator className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtro e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <Input
            placeholder="Buscar por cliente, número ou descrição..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 h-10 text-sm bg-slate-50 border-slate-200"
            id="busca-orcamento-input"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium w-full md:w-auto">
            <button
              type="button"
              onClick={() => setFiltroStatus("todos")}
              className={`flex-1 md:flex-initial px-3 py-1.5 rounded-md transition-colors ${
                filtroStatus === "todos"
                  ? "bg-white text-slate-900 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todos ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setFiltroStatus("pendente")}
              className={`flex-1 md:flex-initial px-3 py-1.5 rounded-md transition-colors ${
                filtroStatus === "pendente"
                  ? "bg-white text-amber-700 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pendentes ({stats.qtdPendentes})
            </button>
            <button
              type="button"
              onClick={() => setFiltroStatus("aprovado")}
              className={`flex-1 md:flex-initial px-3 py-1.5 rounded-md transition-colors ${
                filtroStatus === "aprovado"
                  ? "bg-white text-emerald-700 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Aprovados ({stats.qtdAprovados})
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Orçamentos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Carregando lista de orçamentos...
          </div>
        ) : orcamentosFiltrados.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Calculator className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-base font-semibold text-slate-700">
              Nenhum orçamento encontrado
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {busca || filtroStatus !== "todos"
                ? "Nenhum orçamento corresponde aos filtros selecionados."
                : "Você ainda não criou nenhum orçamento. Clique no botão acima para começar."}
            </p>
            {!busca && filtroStatus === "todos" && (
              <Button
                onClick={() => setDialogNovoAberto(true)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                + Criar Primeiro Orçamento
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3.5 w-24">Nº / Data</th>
                  <th className="p-3.5">Cliente</th>
                  <th className="p-3.5 hidden md:table-cell">Descrição / Escopo</th>
                  <th className="p-3.5 text-center hidden lg:table-cell">Mão de Obra</th>
                  <th className="p-3.5 text-right">Valor Total</th>
                  <th className="p-3.5 text-center w-28">Status</th>
                  <th className="p-3.5 text-right w-72">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orcamentosFiltrados.map((orc) => {
                  const dataCriacao = new Date(orc.data || orc.created_at);
                  const dataFormatada = isNaN(dataCriacao.getTime())
                    ? "—"
                    : dataCriacao.toLocaleDateString("pt-BR");

                  const isAprovado = orc.status === "aprovado";

                  return (
                    <tr
                      key={orc.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isAprovado ? "bg-emerald-50/20" : ""
                      }`}
                    >
                      {/* Nº e Data */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <span className="text-blue-600">#{orc.numero}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {dataFormatada}
                        </div>
                      </td>

                      {/* Nome do Cliente */}
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 text-sm">
                          {orc.clientes?.nome || "Cliente Não Vinculado"}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          {orc.clientes?.telefone && <span>{orc.clientes.telefone}</span>}
                          {orc.clientes?.cidade && (
                            <span className="text-slate-400">· {orc.clientes.cidade}</span>
                          )}
                        </div>
                      </td>

                      {/* Descrição */}
                      <td className="p-3.5 hidden md:table-cell max-w-xs">
                        <p className="text-slate-600 truncate" title={orc.descricao || ""}>
                          {orc.descricao || "—"}
                        </p>
                      </td>

                      {/* Mão de Obra */}
                      <td className="p-3.5 text-center hidden lg:table-cell">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium text-[11px]">
                          {orc.horas_mao_obra || 0}h ({formatMoney(orc.valor_mao_obra)})
                        </span>
                      </td>

                      {/* Valor Total */}
                      <td className="p-3.5 text-right">
                        <div className="text-sm font-bold text-slate-900">
                          {formatMoney(orc.valor_total)}
                        </div>
                        {Number(orc.desconto || 0) > 0 && (
                          <div className="text-[10px] text-red-600 font-medium">
                            Desc: -{formatMoney(orc.desconto)}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        {isAprovado ? (
                          <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 gap-1 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Aprovado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 border border-amber-200 gap-1 font-semibold text-[11px]">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Pendente
                          </Badge>
                        )}
                      </td>

                      {/* Ações: PDF, Editar, APROVADO, Detalhes, Excluir */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão Baixar PDF */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleBaixarPdf(orc)}
                            disabled={gerandoPdfId === orc.id}
                            className="h-8 px-2.5 text-xs font-semibold text-blue-700 bg-blue-50/50 border-blue-200 hover:bg-blue-100/70 gap-1"
                            title="Baixar PDF do Orçamento para enviar ao cliente"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">PDF</span>
                          </Button>

                          {/* Botão Editar Orçamento */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setOrcamentoParaEditar(orc)}
                            className="h-8 px-2.5 text-xs font-semibold text-slate-700 bg-slate-50/80 border-slate-200 hover:bg-slate-100 gap-1"
                            title="Editar este orçamento"
                            id={`btn-editar-orcamento-${orc.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-600" />
                            <span className="hidden md:inline">Editar</span>
                          </Button>

                          {/* BOTÃO 'APROVADO' SOLICITADO PELO USUÁRIO */}
                          {!isAprovado ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setOrcamentoParaAprovar(orc)}
                              className="h-8 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-sm transition-all"
                              title="Aprovar orçamento e agendar serviço"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              APROVADO
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setOrcamentoParaAprovar(orc)}
                              className="h-8 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50 gap-1"
                              title="Reabrir agendamento do orçamento aprovado"
                            >
                              <Calendar className="w-3 h-3" />
                              Agendado
                            </Button>
                          )}

                          {/* Ver Detalhes */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setOrcamentoParaVer(orc)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            title="Visualizar itens e detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>

                          {/* Excluir (somente admin) */}
                          {role === "admin" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setOrcamentoParaExcluir(orc.id)}
                              className="h-8 w-8 p-0 text-slate-300 hover:text-red-600 hover:bg-red-50"
                              title="Excluir orçamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Criar Novo Orçamento ou Editar Existente */}
      {(dialogNovoAberto || orcamentoParaEditar) && (
        <NovoOrcamentoDialog
          open={dialogNovoAberto || !!orcamentoParaEditar}
          orcamentoParaEditar={orcamentoParaEditar}
          onClose={() => {
            setDialogNovoAberto(false);
            setOrcamentoParaEditar(null);
          }}
        />
      )}

      {/* Modal Aprovar Orçamento (Agendamento) */}
      {orcamentoParaAprovar && (
        <AprovarOrcamentoDialog
          orcamento={orcamentoParaAprovar}
          open={!!orcamentoParaAprovar}
          onClose={() => setOrcamentoParaAprovar(null)}
        />
      )}

      {/* Modal Visualizar Detalhes do Orçamento */}
      {orcamentoParaVer && (
        <Dialog open={!!orcamentoParaVer} onOpenChange={(v) => !v && setOrcamentoParaVer(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-6">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-lg font-bold text-slate-900">
                    Detalhes do Orçamento #{orcamentoParaVer.numero}
                  </DialogTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cliente: <strong>{orcamentoParaVer.clientes?.nome}</strong> · Criado em{" "}
                    {new Date(
                      orcamentoParaVer.data || orcamentoParaVer.created_at,
                    ).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge
                  className={
                    orcamentoParaVer.status === "aprovado"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }
                >
                  {orcamentoParaVer.status === "aprovado" ? "Aprovado" : "Pendente"}
                </Badge>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              {orcamentoParaVer.descricao && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="font-semibold text-slate-700 mb-1">Objeto da Proposta:</div>
                  <div className="text-slate-600">{orcamentoParaVer.descricao}</div>
                </div>
              )}

              {/* Tabela de Itens */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 p-2.5 font-semibold text-slate-700 flex items-center justify-between">
                  <span>Equipamentos e Materiais ({itensDoOrcamentoVer.length} itens)</span>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <tr>
                      <th className="p-2.5">Produto</th>
                      <th className="p-2.5 text-center">Qtd</th>
                      <th className="p-2.5 text-right">Valor Venda Unit.</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itensDoOrcamentoVer.map((it) => (
                      <tr key={it.id}>
                        <td className="p-2.5 font-medium text-slate-800">
                          {it.produto}
                          {it.codigo && (
                            <span className="text-[10px] text-slate-400 ml-1.5">({it.codigo})</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {it.quantidade} {it.unidade}
                        </td>
                        <td className="p-2.5 text-right text-blue-700 font-medium">
                          {formatMoney(it.valor_venda)}
                        </td>
                        <td className="p-2.5 text-right font-semibold text-slate-900">
                          {formatMoney((it.quantidade || 0) * (it.valor_venda || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totais */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Mão de Obra:</span>
                  <span className="font-medium text-slate-800">
                    {formatMoney(orcamentoParaVer.valor_mao_obra)}
                  </span>
                </div>
                {Number(orcamentoParaVer.custo_adicional || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>
                      {orcamentoParaVer.descricao_custo_adicional || "Despesas adicionais"}:
                    </span>
                    <span className="font-medium text-slate-800">
                      {formatMoney(orcamentoParaVer.custo_adicional)}
                    </span>
                  </div>
                )}
                {Number(orcamentoParaVer.desconto || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Desconto comercial:</span>
                    <span className="font-semibold">
                      - {formatMoney(orcamentoParaVer.desconto)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200 text-sm font-bold text-slate-900">
                  <span>Valor Total:</span>
                  <span className="text-blue-700">{formatMoney(orcamentoParaVer.valor_total)}</span>
                </div>
              </div>

              {orcamentoParaVer.forma_pagamento && (
                <div className="text-slate-600">
                  <strong>Condição de Pagamento:</strong> {orcamentoParaVer.forma_pagamento}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const orc = orcamentoParaVer;
                  setOrcamentoParaVer(null);
                  setOrcamentoParaEditar(orc);
                }}
                className="gap-1 text-slate-700 border-slate-300 hover:bg-slate-100"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar Orçamento
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBaixarPdf(orcamentoParaVer)}
                className="gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar PDF da Proposta
              </Button>
              {orcamentoParaVer.status !== "aprovado" && (
                <Button
                  size="sm"
                  onClick={() => {
                    const orc = orcamentoParaVer;
                    setOrcamentoParaVer(null);
                    setOrcamentoParaAprovar(orc);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  APROVADO
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação de Exclusão */}
      <ConfirmDeleteDialog
        open={!!orcamentoParaExcluir}
        onOpenChange={(v) => !v && setOrcamentoParaExcluir(null)}
        title="Excluir Orçamento"
        description="Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita."
        onConfirm={() => {
          if (orcamentoParaExcluir) mutationExcluir.mutate(orcamentoParaExcluir);
        }}
        isLoading={mutationExcluir.isPending}
      />
    </div>
  );
}
