import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { toast } from "sonner";
import { formatDateTime, formatMoney, statusBadgeClass, statusLabels, tipoLabels } from "@/lib/servico";
import { MARGEM_VENDA } from "@/lib/xml-nfe";
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  DollarSign,
  Filter,
  HandCoins,
  Package,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Servico } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Cobrança dos serviços executados, custos de produtos, lucro real e dízimo." },
      { property: "og:title", content: "Financeiro — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Cobrança, custos de produtos, lucro e dízimo." },
    ],
  }),
  component: FinanceiroPage,
});

type TipoFiltroFinanceiro = "todos" | "hoje" | "dia" | "semana" | "mes";

function FinanceiroPage() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<Servico | null>(null);
  const [desconto, setDesconto] = useState("0");
  const [busca, setBusca] = useState("");
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  // Filtros de período
  const [filtroPeriodo, setFiltroPeriodo] = useState<TipoFiltroFinanceiro>("todos");
  const [dataEspecifica, setDataEspecifica] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [mesSelecionado, setMesSelecionado] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: servicos = [], isLoading: isLoadingServicos } = useQuery({
    queryKey: ["financeiro-servicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("*, clientes(nome, telefone, endereco, numero, bairro, cidade)")
        .in("status", ["pronto", "a_cobrar", "pago"])
        .order("concluido_em", { ascending: false });
      if (error) throw error;
      return data as unknown as Servico[];
    },
  });

  const { data: estoque = [] } = useQuery({
    queryKey: ["financeiro-estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque").select("*");
      if (error) throw error;
      return data as unknown as {
        id: string;
        codigo: string | null;
        produto: string;
        valor_custo: number;
        valor_venda: number;
      }[];
    },
  });

  const { data: servicoProdutos = [] } = useQuery({
    queryKey: ["financeiro-servico-produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servico_produtos").select("*");
      if (error) throw error;
      return data as unknown as {
        id: string;
        servico_id: string;
        estoque_id: string | null;
        codigo: string | null;
        produto: string;
        quantidade: number;
        valor_unitario: number;
      }[];
    },
  });

  // Mapeamento de estoque para busca rápida de valor_custo
  const estoqueMap = useMemo(() => {
    const byId = new Map<string, number>();
    const byCodigo = new Map<string, number>();
    const byNome = new Map<string, number>();
    for (const item of estoque) {
      const custo = Number(item.valor_custo || 0);
      byId.set(item.id, custo);
      if (item.codigo) byCodigo.set(item.codigo.trim().toLowerCase(), custo);
      if (item.produto) byNome.set(item.produto.trim().toLowerCase(), custo);
    }
    return { byId, byCodigo, byNome };
  }, [estoque]);

  // Agrupamento dos produtos por servico_id
  const produtosPorServico = useMemo(() => {
    const map = new Map<string, typeof servicoProdutos>();
    for (const sp of servicoProdutos) {
      const list = map.get(sp.servico_id) || [];
      list.push(sp);
      map.set(sp.servico_id, list);
    }
    return map;
  }, [servicoProdutos]);

  // Função para calcular o custo real dos produtos de um serviço
  const calcularCustoServico = (s: Servico) => {
    const itens = produtosPorServico.get(s.id) || [];
    if (itens.length > 0) {
      return itens.reduce((acc, item) => {
        let unitCusto = 0;
        if (item.estoque_id && estoqueMap.byId.has(item.estoque_id)) {
          unitCusto = estoqueMap.byId.get(item.estoque_id)!;
        } else if (item.codigo && estoqueMap.byCodigo.has(item.codigo.trim().toLowerCase())) {
          unitCusto = estoqueMap.byCodigo.get(item.codigo.trim().toLowerCase())!;
        } else if (item.produto && estoqueMap.byNome.has(item.produto.trim().toLowerCase())) {
          unitCusto = estoqueMap.byNome.get(item.produto.trim().toLowerCase())!;
        } else {
          // Se não encontrado no estoque, calcula o custo a partir do preço de venda com a margem padrão de 37%
          unitCusto = Number(item.valor_unitario || 0) / MARGEM_VENDA;
        }
        return acc + Number(item.quantidade || 1) * unitCusto;
      }, 0);
    }

    // Se o serviço não possui lista em servico_produtos, calcula o custo a partir do valor dos materiais (bruto - mão de obra)
    const valorMateriaisVenda = Math.max(Number(s.valor_bruto ?? 0) - Number(s.valor_mao_obra ?? 0), 0);
    if (valorMateriaisVenda > 0) {
      return valorMateriaisVenda / MARGEM_VENDA;
    }
    return 0;
  };

  // Obter data de referência do serviço
  const getDataReferencia = (s: Servico): Date | null => {
    const dataStr = s.pago_em || s.concluido_em || s.data_agendada || (s as any).created_at;
    if (!dataStr) return null;
    const d = new Date(dataStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Filtragem dos serviços por período e busca
  const servicosFiltrados = useMemo(() => {
    const agora = new Date();

    return servicos.filter((s) => {
      // 1. Filtro de Texto
      const termo = busca.trim().toLowerCase();
      if (termo) {
        const matchesTermo = `${s.numero_pedido ?? ""} ${s.clientes?.nome ?? ""} ${s.clientes?.telefone ?? ""} ${s.clientes?.cidade ?? ""} ${s.tipo ?? ""} ${s.status ?? ""} ${s.relatorio ?? ""} ${s.produtos_usados ?? ""}`
          .toLowerCase()
          .includes(termo);
        if (!matchesTermo) return false;
      }

      // 2. Filtro de Período
      if (filtroPeriodo === "todos") return true;

      const dataRef = getDataReferencia(s);
      if (!dataRef) return false;

      if (filtroPeriodo === "hoje") {
        return (
          dataRef.getFullYear() === agora.getFullYear() &&
          dataRef.getMonth() === agora.getMonth() &&
          dataRef.getDate() === agora.getDate()
        );
      }

      if (filtroPeriodo === "dia" && dataEspecifica) {
        const [ano, mes, dia] = dataEspecifica.split("-").map(Number);
        return (
          dataRef.getFullYear() === ano &&
          dataRef.getMonth() + 1 === mes &&
          dataRef.getDate() === dia
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

        return dataRef.getTime() >= inicioSemana.getTime() && dataRef.getTime() <= fimSemana.getTime();
      }

      if (filtroPeriodo === "mes") {
        if (mesSelecionado) {
          const [ano, mes] = mesSelecionado.split("-").map(Number);
          return dataRef.getFullYear() === ano && dataRef.getMonth() + 1 === mes;
        }
        return (
          dataRef.getFullYear() === agora.getFullYear() &&
          dataRef.getMonth() === agora.getMonth()
        );
      }

      return true;
    });
  }, [servicos, busca, filtroPeriodo, dataEspecifica, mesSelecionado]);

  // Contadores para o menu de filtros
  const contadores = useMemo(() => {
    const agora = new Date();
    let hoje = 0;
    let semana = 0;
    let mes = 0;

    const diaSemanaHoje = agora.getDay();
    const distSegunda = diaSemanaHoje === 0 ? -6 : 1 - diaSemanaHoje;
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() + distSegunda);
    inicioSemana.setHours(0, 0, 0, 0);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    fimSemana.setHours(23, 59, 59, 999);

    for (const s of servicos) {
      const dataRef = getDataReferencia(s);
      if (!dataRef) continue;

      if (dataRef.getFullYear() === agora.getFullYear() && dataRef.getMonth() === agora.getMonth() && dataRef.getDate() === agora.getDate()) {
        hoje++;
      }
      if (dataRef.getTime() >= inicioSemana.getTime() && dataRef.getTime() <= fimSemana.getTime()) {
        semana++;
      }
      if (dataRef.getFullYear() === agora.getFullYear() && dataRef.getMonth() === agora.getMonth()) {
        mes++;
      }
    }

    return { todos: servicos.length, hoje, semana, mes };
  }, [servicos]);

  const salvar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("servicos").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setAlvo(null);
      toast.success("Cobrança atualizada com sucesso");
      void qc.invalidateQueries({ queryKey: ["financeiro-servicos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["servicos-a-cobrar"] });
    },
    onError: () => toast.error("Não foi possível atualizar a cobrança"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servicos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço excluído com sucesso");
      void qc.invalidateQueries({ queryKey: ["financeiro-servicos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível excluir o serviço"),
  });

  // Totais calculados dinamicamente com base nos serviços do período selecionado
  const aReceber = servicosFiltrados
    .filter((s) => s.status !== "pago")
    .reduce((a, s) => a + Number(s.valor ?? 0), 0);

  const servicosPagos = servicosFiltrados.filter((s) => s.status === "pago");

  // Total Faturado/Recebido dos serviços pagos no período
  const recebido = servicosPagos.reduce((a, s) => a + Number(s.valor ?? 0), 0);

  // Custo real dos produtos utilizados nos serviços pagos no período
  const custoProdutos = servicosPagos.reduce((a, s) => a + calcularCustoServico(s), 0);

  // Lucro líquido real (Recebido total menos o custo de aquisição das peças)
  const lucroEfetivo = Math.max(recebido - custoProdutos, 0);

  // Dízimo de 10% calculado estritamente sobre o lucro líquido
  const dizimo = lucroEfetivo * 0.10;

  const bruto = Number(alvo?.valor_bruto ?? 0);
  const totalComDesconto = Math.max(bruto - Number(desconto || 0), 0);
  const custoAlvo = alvo ? calcularCustoServico(alvo) : 0;
  const lucroAlvo = Math.max(totalComDesconto - custoAlvo, 0);
  const dizimoAlvo = lucroAlvo * 0.10;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Serviços executados, custos de peças no valor de compra, lucro real e dízimo (10%).
          </p>
        </div>
      </div>

      {/* Grid com os 5 indicadores financeiros calculados dinamicamente para o período selecionado */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="surface-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">A receber</p>
            <Wallet className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{formatMoney(aReceber)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Serviços prontos e a cobrar</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Recebido (Faturamento)</p>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{formatMoney(recebido)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Total pago pelos clientes</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Custo dos Produtos</p>
            <Package className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400">{formatMoney(custoProdutos)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Custo real de compra das peças</p>
        </div>

        <div className="surface-card p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Lucro Real</p>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{formatMoney(lucroEfetivo)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Recebido − Custo das peças</p>
        </div>

        <div className="surface-card p-4 bg-emerald-500/5 border-l-4 border-emerald-500">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 font-semibold">Dízimo (10%)</p>
            <HandCoins className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{formatMoney(dizimo)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">10% sobre o lucro líquido</p>
        </div>
      </div>

      {/* Barra de Busca e Filtros de Período */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar no financeiro por cliente, telefone, cidade ou serviço..."
            />
          </div>

          {filtroPeriodo === "dia" && (
            <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Mês:</Label>
              <Input
                type="month"
                className="w-auto h-9 text-xs"
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Filtros rápidos: Por Dia / Por Semana / Por Mês / Todos */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-lg border text-xs">
          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "todos" ? "default" : "ghost"}
            className="h-8 px-3 text-xs"
            onClick={() => setFiltroPeriodo("todos")}
          >
            Todo o período ({contadores.todos})
          </Button>

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
            variant={filtroPeriodo === "dia" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("dia")}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Por Dia específico
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "semana" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("semana")}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Esta Semana ({contadores.semana})
          </Button>

          <Button
            type="button"
            size="sm"
            variant={filtroPeriodo === "mes" ? "default" : "ghost"}
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => setFiltroPeriodo("mes")}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Este Mês ({contadores.mes})
          </Button>
        </div>
      </div>

      {isLoadingServicos ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : servicosFiltrados.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Nenhum serviço encontrado para o filtro e pesquisa selecionados.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {servicosFiltrados.map((s) => {
            const custoItem = calcularCustoServico(s);
            const valorCobrado = Number(s.valor ?? (Number(s.valor_bruto ?? 0) - Number(s.desconto ?? 0)));
            const lucroItem = Math.max(valorCobrado - custoItem, 0);
            const dizimoItem = lucroItem * 0.10;

            return (
              <div key={s.id} className="surface-card space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                        OS / Pedido #{s.numero_pedido ?? s.id.replace("s-", "")}
                      </span>
                      <p className="font-semibold text-base">{s.clientes?.nome}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {s.clientes?.telefone ?? "sem telefone"} · {tipoLabels[s.tipo]}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass[s.status]}`}>
                    {statusLabels[s.status]}
                  </span>
                </div>

                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Serviço: </span>
                    {s.relatorio || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Materiais: </span>
                    {s.produtos_usados || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Mão de obra: </span>
                    {Number(s.horas_mao_obra ?? 0)}h · {formatMoney(s.valor_mao_obra ?? 0)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Total do serviço: </span>
                    {formatMoney(s.valor_bruto ?? 0)}
                  </p>
                  {Number(s.desconto ?? 0) > 0 && (
                    <p>
                      <span className="text-muted-foreground">Desconto: </span>-{" "}
                      {formatMoney(s.desconto)}
                    </p>
                  )}
                  <p className="font-medium">
                    <span className="text-muted-foreground">Valor a cobrar: </span>
                    {formatMoney(s.valor)}
                  </p>

                  {/* Detalhamento de Custo Real, Lucro e Dízimo */}
                  <div className="mt-2 border-t pt-2 grid grid-cols-3 gap-2 text-[11px] font-medium bg-muted/40 p-2.5 rounded-md">
                    <div>
                      <span className="block text-muted-foreground">Custo das peças:</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{formatMoney(custoItem)}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Lucro {s.status === "pago" ? "real" : "projetado"}:</span>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">{formatMoney(lucroItem)}</span>
                    </div>
                    <div>
                      <span className="block text-emerald-700 dark:text-emerald-300">Dízimo (10%):</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatMoney(dizimoItem)}</span>
                    </div>
                  </div>

                  {s.pago_em && (
                    <p className="text-muted-foreground text-xs pt-1">Pago em {formatDateTime(s.pago_em)}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setAlvo(s);
                      setDesconto(String(Number(s.desconto ?? 0)));
                    }}
                  >
                    Editar valor / desconto
                  </Button>
                  {s.status !== "pago" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        salvar.mutate({
                          id: s.id,
                          patch: { status: "pago", pago_em: new Date().toISOString() },
                        })
                      }
                    >
                      Marcar como pago
                    </Button>
                  )}

                  {/* BOTÃO VERMELHO DE EXCLUSÃO */}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setItemParaExcluir(s.id)}
                    disabled={remover.isPending}
                  >
                    Excluir serviço
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!itemParaExcluir}
        onOpenChange={(o) => !o && setItemParaExcluir(null)}
        title="Excluir cobrança / serviço"
        description="Tem certeza que deseja excluir este serviço? Esta ação removerá o histórico e os dados financeiros do serviço."
        onConfirm={() => {
          if (itemParaExcluir) {
            remover.mutate(itemParaExcluir);
            setItemParaExcluir(null);
          }
        }}
        isPending={remover.isPending}
      />

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valor do serviço #{alvo?.numero_pedido ?? alvo?.id.replace("s-", "")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produtos (preço de venda)</span>
              <span>{formatMoney(bruto - Number(alvo?.valor_mao_obra ?? 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mão de obra</span>
              <span>{formatMoney(alvo?.valor_mao_obra ?? 0)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Total bruto</span>
              <span>{formatMoney(bruto)}</span>
            </div>
            <div className="space-y-1">
              <Label htmlFor="desconto">Desconto (R$)</Label>
              <Input
                id="desconto"
                type="number"
                min="0"
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
              />
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Valor final a cobrar</span>
              <span className="text-primary">{formatMoney(totalComDesconto)}</span>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Custo real dos produtos (compra):</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">{formatMoney(custoAlvo)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Lucro líquido estimado:</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{formatMoney(lucroAlvo)}</span>
              </div>
              <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400 border-t pt-1">
                <span>Dízimo estimado (10% sobre o lucro):</span>
                <span>{formatMoney(dizimoAlvo)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!alvo) return;
                const d = Number(desconto) || 0;
                salvar.mutate({
                  id: alvo.id,
                  patch: {
                    desconto: d,
                    valor: Math.max(bruto - d, 0),
                  },
                });
              }}
              disabled={salvar.isPending}
            >
              Salvar valor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
