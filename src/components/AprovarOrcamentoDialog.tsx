import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Package, UserCheck, Wrench } from "lucide-react";
import { formatMoney, toLocalInputValue, type ServicoTipo } from "@/lib/servico";
import { useAuth } from "@/hooks/useAuth";
import type { Orcamento, OrcamentoItem, Profile } from "@/lib/types";

export function AprovarOrcamentoDialog({
  orcamento,
  open,
  onClose,
  onSuccess,
}: {
  orcamento: Orcamento | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  // Data do agendamento padrão: amanhã às 08:30
  const getDefaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 30, 0, 0);
    return toLocalInputValue(d);
  };

  const [dataAgendada, setDataAgendada] = useState(getDefaultDate);
  const [tecnicoId, setTecnicoId] = useState("");
  const [tipo, setTipo] = useState<ServicoTipo>("instalacao");
  const [duracaoMinutos, setDuracaoMinutos] = useState(() => {
    const horas = Number(orcamento?.horas_mao_obra) || 4;
    return String(Math.round(horas * 60));
  });
  const [descricao, setDescricao] = useState(() => {
    if (!orcamento) return "";
    return (
      orcamento.descricao ||
      `Execução do Orçamento nº ${orcamento.numero} - Instalação aprovada pelo cliente.`
    );
  });

  // Atualiza valores quando o orcamento abre
  useEffect(() => {
    let isMounted = true;
    if (orcamento && isMounted) {
      setDescricao(
        orcamento.descricao ||
          `Execução do Orçamento nº ${orcamento.numero} - Instalação aprovada pelo cliente.`
      );
      const horas = Number(orcamento.horas_mao_obra) || 4;
      setDuracaoMinutos(String(Math.round(horas * 60)));
      setDataAgendada(getDefaultDate());
    }
    return () => {
      isMounted = false;
    };
  }, [orcamento]);

  // Buscar itens do orçamento
  const { data: itens = [] } = useQuery({
    queryKey: ["orcamento-itens-aprovar", orcamento?.id],
    queryFn: async () => {
      if (!orcamento?.id) return [];
      const { data, error } = await supabase
        .from("orcamento_itens")
        .select("*")
        .eq("orcamento_id", orcamento.id);
      if (error) throw error;
      return (data || []) as OrcamentoItem[];
    },
    enabled: open && !!orcamento?.id,
  });

  // Buscar técnicos / perfis
  const { data: tecnicos = [] } = useQuery({
    queryKey: ["perfis-tecnicos-aprovar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, telefone")
        .order("nome");
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: open,
  });

  const totalProdutos = useMemo(() => {
    return itens.reduce(
      (acc, item) => acc + (Number(item.quantidade) || 0) * (Number(item.valor_venda) || 0),
      0
    );
  }, [itens]);

  // Mutation para aprovar o orçamento e gerar o agendamento
  const mutation = useMutation({
    mutationFn: async () => {
      if (!orcamento) throw new Error("Nenhum orçamento selecionado.");
      if (!dataAgendada) throw new Error("Informe a data e horário do agendamento.");

      const dataIso = new Date(dataAgendada).toISOString();
      const durMin = parseInt(duracaoMinutos, 10) || 120;

      // 1. Criar o serviço em 'servicos'
      const { data: novoServico, error: errServico } = await supabase
        .from("servicos")
        .insert({
          cliente_id: orcamento.cliente_id,
          tecnico_id: tecnicoId || null,
          tipo: tipo,
          status: "agendado",
          data_agendada: dataIso,
          duracao_estimada_minutos: durMin,
          descricao: descricao.trim() || `Orçamento nº ${orcamento.numero} aprovado`,
          horas_mao_obra: Number(orcamento.horas_mao_obra) || 0,
          valor_mao_obra: Number(orcamento.valor_mao_obra) || 0,
          custo_adicional: Number(orcamento.custo_adicional) || null,
          descricao_custo_adicional: orcamento.descricao_custo_adicional || null,
          incluir_custo_no_total: Boolean(orcamento.incluir_custo_no_total),
          desconto: Number(orcamento.desconto) || 0,
          valor_bruto: Number(orcamento.valor_bruto) || Number(orcamento.valor_total) || 0,
          valor_total: Number(orcamento.valor_total) || 0,
          created_by: user?.id || null,
        } as any)
        .select()
        .single();

      if (errServico) throw errServico;

      // 2. Transferir todos os produtos do orçamento para servico_produtos
      if (novoServico?.id && itens.length > 0) {
        const produtosServico = itens.map((it) => ({
          servico_id: novoServico.id,
          estoque_id: it.estoque_id || null,
          codigo: it.codigo || null,
          produto: it.produto,
          unidade: it.unidade || "UN",
          quantidade: Number(it.quantidade) || 1,
          valor_unitario: Number(it.valor_venda) || 0,
        }));

        const { error: errProd } = await supabase
          .from("servico_produtos")
          .insert(produtosServico as any);

        if (errProd) throw errProd;
      }

      // 3. Atualizar o status do orçamento para "aprovado"
      // LEMBRETE: O orçamento NUNCA é deletado, permanecendo arquivado e consultável permanentemente!
      const { error: errOrcUpdate } = await supabase
        .from("orcamentos")
        .update({
          status: "aprovado",
          servico_id_gerado: novoServico?.id || null,
          aprovado_em: new Date().toISOString(),
        } as any)
        .eq("id", orcamento.id);

      if (errOrcUpdate) throw errOrcUpdate;

      return novoServico;
    },
    onSuccess: (novoServico) => {
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
      qc.invalidateQueries({ queryKey: ["agendamentos"] });
      qc.invalidateQueries({ queryKey: ["servicos"] });

      toast.success(
        `Orçamento nº ${orcamento?.numero} APROVADO! Agendamento nº ${novoServico?.numero_pedido || ""} criado com sucesso.`,
        {
          description: "Todos os produtos e a mão de obra foram transferidos para a nova ordem de serviço.",
        }
      );
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast.error(`Erro ao aprovar orçamento: ${err.message || err}`);
    },
  });

  if (!orcamento) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6" id="aprovar-orcamento-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                Aprovar Orçamento nº {orcamento.numero}
              </DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Crie o agendamento de execução do serviço. Todos os produtos e mão de obra serão transferidos automaticamente.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Card Resumo do Orçamento */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-900">Cliente:</span>{" "}
                <span className="text-sm font-semibold text-slate-800">
                  {orcamento.clientes?.nome || "Cliente"}
                </span>
                {orcamento.clientes?.telefone && (
                  <span className="text-xs text-slate-500 ml-2">({orcamento.clientes.telefone})</span>
                )}
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
                Total: {formatMoney(orcamento.valor_total)}
              </span>
            </div>

            <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <strong>Produtos vinculados:</strong> {itens.length} {itens.length === 1 ? "item" : "itens"} (
                {formatMoney(totalProdutos)})
              </span>
              <span>
                <strong>Mão de obra:</strong> {orcamento.horas_mao_obra || 0}h (
                {formatMoney(orcamento.valor_mao_obra)})
              </span>
            </div>
          </div>

          {/* Produtos a serem transferidos */}
          {itens.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-600" />
                Produtos do orçamento transferidos para a O.S.:
              </div>
              <div className="border border-slate-200 rounded-lg p-2 max-h-32 overflow-y-auto text-xs bg-slate-50 divide-y divide-slate-200/60">
                {itens.map((it) => (
                  <div key={it.id} className="py-1 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-800">{it.produto}</span>
                      {it.codigo && (
                        <span className="text-[10px] text-slate-500 ml-1.5 bg-white px-1 py-0.5 rounded border border-slate-200">
                          {it.codigo}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600">
                      {it.quantidade} {it.unidade} × {formatMoney(it.valor_venda)} ={" "}
                      <strong className="text-slate-900 font-semibold">
                        {formatMoney((it.quantidade || 0) * (it.valor_venda || 0))}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulário de Agendamento */}
          <div className="space-y-4 pt-1">
            <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-blue-600" />
              Dados do Agendamento da Equipe
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="data-agendada" className="text-xs font-medium text-slate-700">
                  Data e Horário do Serviço <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="data-agendada"
                  type="datetime-local"
                  value={dataAgendada}
                  onChange={(e) => setDataAgendada(e.target.value)}
                  className="h-10 text-sm bg-white"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tipo-servico" className="text-xs font-medium text-slate-700">
                  Tipo de Serviço
                </Label>
                <select
                  id="tipo-servico"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as ServicoTipo)}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="instalacao">Instalação</option>
                  <option value="manutencao">Manutenção</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tecnico-agendado" className="text-xs font-medium text-slate-700">
                  Técnico Responsável (Equipe de Campo)
                </Label>
                <select
                  id="tecnico-agendado"
                  value={tecnicoId}
                  onChange={(e) => setTecnicoId(e.target.value)}
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Selecione o Técnico (Opcional) --</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} {t.telefone ? `(${t.telefone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="duracao-estimada" className="text-xs font-medium text-slate-700">
                  Duração Estimada (Minutos)
                </Label>
                <Input
                  id="duracao-estimada"
                  type="number"
                  step="30"
                  min="30"
                  value={duracaoMinutos}
                  onChange={(e) => setDuracaoMinutos(e.target.value)}
                  className="h-10 text-sm bg-white"
                />
                <span className="text-[11px] text-slate-400">
                  ≈ {(Number(duracaoMinutos) / 60).toFixed(1)} horas de trabalho
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="descricao-execucao" className="text-xs font-medium text-slate-700">
                Instruções / Escopo da Execução
              </Label>
              <Textarea
                id="descricao-execucao"
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Orientações detalhadas para o técnico na data da visita"
                className="text-xs bg-white"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Voltar
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !dataAgendada}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold"
            id="confirmar-aprovacao-btn"
          >
            <CheckCircle2 className="w-4 h-4" />
            {mutation.isPending ? "Aprovando e Agendando..." : "Confirmar e Agendar Serviço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
