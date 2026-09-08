import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { toast } from "sonner";
import { formatDateTime, formatMoney, statusBadgeClass, statusLabels, tipoLabels } from "@/lib/servico";
import { MARGEM_VENDA } from "@/lib/xml-nfe";
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  Fuel,
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

type TipoFiltroPeriodo = "todos" | "hoje" | "dia" | "semana" | "mes" | "ano";
type TipoFiltroStatus = "todos" | "pago" | "pendente";

function FinanceiroPage() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<Servico | null>(null);
  const [desconto, setDesconto] = useState("0");
  const [alvoCustoAdicional, setAlvoCustoAdicional] = useState("0");
  const [alvoDescricaoCusto, setAlvoDescricaoCusto] = useState("");
  const [alvoIncluirNoTotal, setAlvoIncluirNoTotal] = useState(false);
  const [busca, setBusca] = useState("");
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  // Filtros de status e período
  const [filtroStatus, setFiltroStatus] = useState<TipoFiltroStatus>("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<TipoFiltroPeriodo>("todos");
  const [dataEspecifica, setDataEspecifica] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [mesSelecionado, setMesSelecionado] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [anoSelecionado, setAnoSelecionado] = useState<number>(() => new Date().getFullYear());

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

  // Função para calcular o custo real dos produtos e despesas adicionais de um serviço
  const calcularCustoServico = (s: Servico) => {
    let custoPecas = 0;
    const itens = produtosPorServico.get(s.id) || [];
    if (itens.length > 0) {
      custoPecas = itens.reduce((acc, item) => {
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
    } else {
      // Se o serviço não possui lista em servico_produtos, calcula o custo a partir do valor dos materiais (bruto - mão de obra - despesas se repassadas)
      const custoAdicionalRepassado = s.incluir_custo_no_total ? Number(s.custo_adicional || 0) : 0;
      const valorMateriaisVenda = Math.max(
        Number(s.valor_bruto ?? 0) - Number(s.valor_mao_obra ?? 0) - custoAdicionalRepassado,
        0
      );
      if (valorMateriaisVenda > 0) {
        custoPecas = valorMateriaisVenda / MARGEM_VENDA;
      }
    }

    const custoAdicional = Math.max(Number(s.custo_adicional || 0), 0);
    return {
      custoPecas,
      custoAdicional,
      custoTotal: custoPecas + custoAdicional,
    };
  };

  // Helper para parsing de data sem perda por fuso horário
  const parseDataReferencia = (dataStr: string | null | undefined): Date | null => {
    if (!dataStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
      const [ano, mes, dia] = dataStr.split("-").map(Number);
      return new Date(ano, mes - 1, dia, 12, 0, 0); // meio-dia local, seguro contra fuso horário
    }
    const d = new Date(dataStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Obter data de referência do serviço
  const getDataReferencia = (s: Servico): Date | null => {
    // Para serviços pagos, a data financeira primordial de recebimento é pago_em.
    // Para serviços pendentes ou caso não haja pago_em, usa concluido_em, data_agendada ou created_at.
    const dataStr = (s.status === "pago" && s.pago_em)
      ? s.pago_em
      : (s.pago_em || s.concluido_em || s.data_agendada || (s as any).created_at);
    return parseDataReferencia(dataStr);
  };

  // Filtragem dos serviços por período, status e busca
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

      // 2. Filtro de Status
      if (filtroStatus === "pago" && s.status !== "pago") return false;
      if (filtroStatus === "pendente" && s.status === "pago") return false;

      // 3. Filtro de Período
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
        const inicioSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + distSegunda, 0, 0, 0, 0);
        const fimSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + distSegunda + 6, 23, 59, 59, 999);

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

      if (filtroPeriodo === "ano") {
        return dataRef.getFullYear() === anoSelecionado;
      }

      return true;
    });
  }, [servicos, busca, filtroStatus, filtroPeriodo, dataEspecifica, mesSelecionado, anoSelecionado]);

  // Contadores para o menu de filtros
  const contadores = useMemo(() => {
    const agora = new Date();
    let hoje = 0;
    let semana = 0;
    let mes = 0;
    let ano = 0;

    const diaSemanaHoje = agora.getDay();
    const distSegunda = diaSemanaHoje === 0 ? -6 : 1 - diaSemanaHoje;
    const inicioSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + distSegunda, 0, 0, 0, 0);
    const fimSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + distSegunda + 6, 23, 59, 59, 999);

    let statusPagos = 0;
    let statusPendentes = 0;

    for (const s of servicos) {
      if (s.status === "pago") {
        statusPagos++;
      } else {
        statusPendentes++;
      }

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
      if (dataRef.getFullYear() === anoSelecionado) {
        ano++;
      }
    }

    return {
      todos: servicos.length,
      hoje,
      semana,
      mes,
      ano,
      statusTodos: servicos.length,
      statusPagos,
      statusPendentes,
    };
  }, [servicos, anoSelecionado]);

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

  // Totais calculados dinamicamente com base estrita nos serviços filtrados (período, status e busca)
  const servicosPagosFiltrados = servicosFiltrados.filter((s) => s.status === "pago");
  const servicosPendentesFiltrados = servicosFiltrados.filter((s) => s.status !== "pago");

  // 1. A receber (serviços pendentes no filtro atual)
  const valorAReceber = servicosPendentesFiltrados.reduce(
    (a, s) => a + Number(s.valor ?? (Number(s.valor_bruto ?? 0) - Number(s.desconto ?? 0))),
    0
  );

  // 2. Recebido / Faturamento realizado (serviços pagos no filtro atual)
  const recebido = servicosPagosFiltrados.reduce(
    (a, s) => a + Number(s.valor ?? (Number(s.valor_bruto ?? 0) - Number(s.desconto ?? 0))),
    0
  );

  // Faturamento total do filtro (recebido + a receber)
  const faturamentoTotalFiltrado = recebido + valorAReceber;

  // 3. Custos Totais (peças no valor de custo + despesas adicionais dos serviços no filtro)
  const custosServicosFiltrados = servicosFiltrados.map((s) => ({
    s,
    ...calcularCustoServico(s),
  }));

  const custoPecasTotal = custosServicosFiltrados.reduce((a, c) => a + c.custoPecas, 0);
  const custoAdicionalTotal = custosServicosFiltrados.reduce((a, c) => a + c.custoAdicional, 0);
  const custoTotalGeral = custoPecasTotal + custoAdicionalTotal;

  // Custos apenas dos serviços que já foram pagos
  const custosServicosPagos = custosServicosFiltrados.filter((c) => c.s.status === "pago");
  const custoPecasPagos = custosServicosPagos.reduce((a, c) => a + c.custoPecas, 0);
  const custoAdicionalPagos = custosServicosPagos.reduce((a, c) => a + c.custoAdicional, 0);
  const custoTotalPagos = custoPecasPagos + custoAdicionalPagos;

  // 4. Lucro Real / Projetado
  // Lucro líquido real dos serviços pagos (recebido - custos das ordens pagas)
  const lucroRealPagos = Math.max(recebido - custoTotalPagos, 0);
  // Lucro projetado considerando todas as OSs filtradas (faturamento total - custos totais)
  const lucroTotalProjetado = Math.max(faturamentoTotalFiltrado - custoTotalGeral, 0);

  const lucroExibido = filtroStatus === "pendente" ? lucroTotalProjetado : lucroRealPagos;

  // 5. Dízimo (10%):
  const dizimoReal = lucroRealPagos * 0.10;
  const dizimoTotal = lucroTotalProjetado * 0.10;
  const dizimoExibido = filtroStatus === "pendente" ? dizimoTotal : dizimoReal;

  const numAlvoCustoAdicional = Math.max(Number(alvoCustoAdicional || 0), 0);
  const brutoBaseAlvo = alvo
    ? Number(alvo.valor_bruto ?? 0) - (alvo.incluir_custo_no_total ? Number(alvo.custo_adicional ?? 0) : 0)
    : 0;
  const novoBrutoAlvo = brutoBaseAlvo + (alvoIncluirNoTotal ? numAlvoCustoAdicional : 0);
  const totalComDesconto = Math.max(novoBrutoAlvo - Number(desconto || 0), 0);
  const custoPecasAlvo = alvo ? calcularCustoServico(alvo).custoPecas : 0;
  const custoTotalAlvo = custoPecasAlvo + numAlvoCustoAdicional;
  const lucroAlvo = Math.max(totalComDesconto - custoTotalAlvo, 0);
  const dizimoAlvo = lucroAlvo * 0.10;

  const descricaoFiltroPeriodo = useMemo(() => {
    if (filtroPeriodo === "todos") return "Todo o período";
    if (filtroPeriodo === "hoje") return "Hoje";
    if (filtroPeriodo === "dia") return `Dia ${dataEspecifica.split("-").reverse().join("/")}`;
    if (filtroPeriodo === "semana") return "Esta semana";
    if (filtroPeriodo === "mes") {
      const [ano, mes] = mesSelecionado.split("-");
      const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      return `${meses[Number(mes) - 1]}/${ano}`;
    }
    if (filtroPeriodo === "ano") return `Ano ${anoSelecionado}`;
    return "";
  }, [filtroPeriodo, dataEspecifica, mesSelecionado, anoSelecionado]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Serviços executados, custos de peças no valor de compra, despesas adicionais, lucro real e dízimo (10%).
          </p>
        </div>
      </div>

      {/* Barra de Busca e Filtros de Status e Período */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar por cliente, telefone, cidade, OS ou serviço..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            {filtroPeriodo === "ano" && (
              <div className="flex items-center gap-2">
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
          </div>
        </div>

        {/* Linha de filtros: Status + Período */}
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center justify-between">
          {/* Filtros de Status */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-lg border text-xs">
            <span className="text-[11px] font-semibold text-muted-foreground px-2">Status:</span>
            <Button
              type="button"
              size="sm"
              variant={filtroStatus === "todos" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setFiltroStatus("todos")}
            >
              Todos ({contadores.statusTodos})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filtroStatus === "pago" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setFiltroStatus("pago")}
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Pagos ({contadores.statusPagos})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filtroStatus === "pendente" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setFiltroStatus("pendente")}
            >
              <Clock className="h-3 w-3 text-amber-500" />
              A Receber ({contadores.statusPendentes})
            </Button>
          </div>

          {/* Filtros de Período */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-lg border text-xs">
            <span className="text-[11px] font-semibold text-muted-foreground px-2">Período:</span>
            <Button
              type="button"
              size="sm"
              variant={filtroPeriodo === "todos" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setFiltroPeriodo("todos")}
            >
              Todo o período ({contadores.todos})
            </Button>

            <Button
              type="button"
              size="sm"
              variant={filtroPeriodo === "hoje" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setFiltroPeriodo("hoje")}
            >
              <Calendar className="h-3 w-3" />
              Hoje ({contadores.hoje})
            </Button>

            <Button
              type="button"
              size="sm"
              variant={filtroPeriodo === "semana" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setFiltroPeriodo("semana")}
            >
              <CalendarRange className="h-3 w-3" />
              Semana ({contadores.semana})
            </Button>

            <Button
              type="button"
              size="sm"
              variant={filtroPeriodo === "mes" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setFiltroPeriodo("mes")}
            >
              <CalendarClock className="h-3 w-3" />
              Mês ({contadores.mes})
            </Button>

            <Button
              type="button"
              size="sm"
              variant={filtroPeriodo === "ano" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setFiltroPeriodo("ano")}
            >
              Ano ({contadores.ano})
            </Button>

            <Button
              type="button"
              size="sm"
              variant={filtroPeriodo === "dia" ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setFiltroPeriodo("dia")}
            >
              <CalendarDays className="h-3 w-3" />
              Dia específico
            </Button>
          </div>
        </div>
      </div>

      {/* Grid com os 5 indicadores financeiros calculados dinamicamente para o filtro selecionado */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            Mostrando resultados do filtro:{" "}
            <strong className="text-foreground">{descricaoFiltroPeriodo}</strong> ·{" "}
            <strong className="text-foreground">
              {filtroStatus === "todos"
                ? "Todos os status"
                : filtroStatus === "pago"
                ? "Somente Pagos"
                : "A Receber / Pendentes"}
            </strong>{" "}
            ({servicosFiltrados.length} {servicosFiltrados.length === 1 ? "serviço" : "serviços"})
          </span>
          {(busca || filtroStatus !== "todos" || filtroPeriodo !== "todos") && (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                setFiltroStatus("todos");
                setFiltroPeriodo("todos");
              }}
              className="text-xs text-primary hover:underline font-medium"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="surface-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">A receber</p>
              <Wallet className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {formatMoney(valorAReceber)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {servicosPendentesFiltrados.length} {servicosPendentesFiltrados.length === 1 ? "serviço pendente" : "serviços pendentes"} no filtro
            </p>
          </div>

          <div className="surface-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Recebido (Faturamento)</p>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatMoney(recebido)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {filtroStatus === "pendente"
                ? `Previsto a faturar: ${formatMoney(valorAReceber)}`
                : filtroStatus === "todos"
                ? `Total pago (${servicosPagosFiltrados.length} OSs)${valorAReceber > 0 ? ` · Total c/ pendentes: ${formatMoney(faturamentoTotalFiltrado)}` : ""}`
                : `${servicosPagosFiltrados.length} serviço(s) pago(s)`}
            </p>
          </div>

          <div className="surface-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Custos Totais</p>
              <Package className="h-4 w-4 text-rose-500" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {formatMoney(filtroStatus === "pago" ? custoTotalPagos : custoTotalGeral)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Peças: {formatMoney(filtroStatus === "pago" ? custoPecasPagos : custoPecasTotal)} · Despesas: {formatMoney(filtroStatus === "pago" ? custoAdicionalPagos : custoAdicionalTotal)}
            </p>
          </div>

          <div className="surface-card p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {filtroStatus === "pendente" ? "Lucro Projetado" : "Lucro Real"}
              </p>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {formatMoney(lucroExibido)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {filtroStatus === "pago"
                ? `Recebido − Custos (${formatMoney(custoTotalPagos)})`
                : filtroStatus === "pendente"
                ? `Previsto − Custos (${formatMoney(custoTotalGeral)})`
                : `Realizado: ${formatMoney(lucroRealPagos)}${servicosPendentesFiltrados.length > 0 ? ` · Previsto: ${formatMoney(lucroTotalProjetado)}` : ""}`}
            </p>
          </div>

          <div className="surface-card p-4 bg-emerald-500/5 border-l-4 border-emerald-500">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 font-semibold">
                {filtroStatus === "pendente" ? "Dízimo Projetado (10%)" : "Dízimo (10%)"}
              </p>
              <HandCoins className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatMoney(dizimoExibido)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {filtroStatus === "pago"
                ? "10% sobre o lucro líquido dos recebidos"
                : filtroStatus === "pendente"
                ? "10% sobre o lucro líquido projetado"
                : `Recebidos: ${formatMoney(dizimoReal)}${servicosPendentesFiltrados.length > 0 ? ` · Previsto: ${formatMoney(dizimoTotal)}` : ""}`}
            </p>
          </div>
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
            const custosItem = calcularCustoServico(s);
            const valorCobrado = Number(s.valor ?? (Number(s.valor_bruto ?? 0) - Number(s.desconto ?? 0)));
            const lucroItem = Math.max(valorCobrado - custosItem.custoTotal, 0);
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
                  {Number(s.custo_adicional ?? 0) > 0 && (
                    <p className="text-amber-600 dark:text-amber-400">
                      <span className="text-muted-foreground">Custo adicional (despesas): </span>
                      <span className="font-medium">{formatMoney(s.custo_adicional)}</span>
                      {s.descricao_custo_adicional ? (
                        <span className="text-muted-foreground text-xs"> ({s.descricao_custo_adicional})</span>
                      ) : null}
                      {s.incluir_custo_no_total ? (
                        <span className="text-[11px] text-blue-600 dark:text-blue-400 ml-1.5 font-normal">
                          (cobrado do cliente)
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground ml-1.5 font-normal">
                          (despesa interna)
                        </span>
                      )}
                    </p>
                  )}
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

                  {/* Detalhamento de Custos Reais, Lucro e Dízimo */}
                  <div className="mt-2 border-t pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-medium bg-muted/40 p-2.5 rounded-md">
                    <div>
                      <span className="block text-muted-foreground">Peças (custo):</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{formatMoney(custosItem.custoPecas)}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Custo adicional:</span>
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatMoney(custosItem.custoAdicional)}</span>
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
                      setAlvoCustoAdicional(s.custo_adicional != null && Number(s.custo_adicional) > 0 ? String(s.custo_adicional) : "");
                      setAlvoDescricaoCusto(s.descricao_custo_adicional ?? "");
                      setAlvoIncluirNoTotal(Boolean(s.incluir_custo_no_total));
                    }}
                  >
                    Editar valor / custos
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Valores e custos da OS #{alvo?.numero_pedido ?? alvo?.id.replace("s-", "")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produtos (preço de venda)</span>
              <span>
                {formatMoney(
                  alvo
                    ? Math.max(
                        Number(alvo.valor_bruto ?? 0) -
                          Number(alvo.valor_mao_obra ?? 0) -
                          (alvo.incluir_custo_no_total ? Number(alvo.custo_adicional ?? 0) : 0),
                        0
                      )
                    : 0
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mão de obra</span>
              <span>{formatMoney(alvo?.valor_mao_obra ?? 0)}</span>
            </div>

            {/* Campo de Custo Adicional / Despesas */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Fuel className="h-3.5 w-3.5 text-amber-500" />
                  Custo adicional (gasolina, almoço, pedágio)
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Valor (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={alvoCustoAdicional}
                    onChange={(e) => setAlvoCustoAdicional(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Descrição</Label>
                  <Input
                    placeholder="Ex: Gasolina e pedágio"
                    value={alvoDescricaoCusto}
                    onChange={(e) => setAlvoDescricaoCusto(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-0.5">
                <Checkbox
                  id="alvoIncluirNoTotal"
                  checked={alvoIncluirNoTotal}
                  onCheckedChange={(checked) => setAlvoIncluirNoTotal(Boolean(checked))}
                />
                <label
                  htmlFor="alvoIncluirNoTotal"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cobrar este custo adicional no total do cliente
                </label>
              </div>
            </div>

            <div className="flex justify-between font-medium border-t pt-2">
              <span>Total bruto</span>
              <span>{formatMoney(novoBrutoAlvo)}</span>
            </div>

            <div className="space-y-1">
              <Label htmlFor="desconto">Desconto concedido (R$)</Label>
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
                <span className="text-rose-600 dark:text-rose-400 font-semibold">{formatMoney(custoPecasAlvo)}</span>
              </div>
              {numAlvoCustoAdicional > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Custo adicional (despesas):</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatMoney(numAlvoCustoAdicional)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Custo total (peças + despesas):</span>
                <span className="text-rose-700 dark:text-rose-300 font-semibold">{formatMoney(custoTotalAlvo)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground border-t pt-1 font-medium">
                <span>Lucro líquido real estimado:</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{formatMoney(lucroAlvo)}</span>
              </div>
              <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400">
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
                const numCusto = Math.max(Number(alvoCustoAdicional || 0), 0);
                salvar.mutate({
                  id: alvo.id,
                  patch: {
                    desconto: d,
                    custo_adicional: numCusto,
                    descricao_custo_adicional: alvoDescricaoCusto.trim() || null,
                    incluir_custo_no_total: alvoIncluirNoTotal,
                    valor_bruto: Number(novoBrutoAlvo.toFixed(2)),
                    valor: Number(Math.max(novoBrutoAlvo - d, 0).toFixed(2)),
                  },
                });
              }}
              disabled={salvar.isPending}
            >
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
