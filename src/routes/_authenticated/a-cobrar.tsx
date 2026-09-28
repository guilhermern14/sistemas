import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCircle2,
  Search,
  Calendar,
  CreditCard,
  DollarSign,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Plus,
  Trash2,
  RefreshCw,
  CheckCheck,
  Wallet,
  ArrowRight,
  Filter,
  Pencil,
  FileText,
} from "lucide-react";
import {
  formatDateTime,
  formatMoney,
  statusBadgeClass,
  statusLabels,
  tipoLabels,
} from "@/lib/servico";
import type { Servico, Parcela } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/a-cobrar")({
  head: () => ({
    meta: [
      { title: "A Cobrar e Parcelamento — Nascimento Sistemas" },
      { name: "description", content: "Controle de cobranças à vista e parceladas com datas e quitações." },
    ],
  }),
  component: ACobrarPage,
});

const FORMAS_PAGAMENTO = [
  { id: "pix", label: "PIX" },
  { id: "cartao_credito", label: "Cartão de Crédito" },
  { id: "cartao_debito", label: "Cartão de Débito" },
  { id: "boleto", label: "Boleto Bancário" },
  { id: "dinheiro", label: "Dinheiro em Espécie" },
  { id: "ted", label: "TED / Transferência" },
];

function formatarDataPtBr(dataStr?: string | null) {
  if (!dataStr) return "—";
  const [ano, mes, dia] = dataStr.slice(0, 10).split("-");
  if (!dia || !mes || !ano) return dataStr;
  return `${dia}/${mes}/${ano}`;
}

function calcularParcelasExatas(
  valorTotal: number,
  qtdParcelas: number,
  dataPrimeira: string,
  intervaloDias: number,
  formaPadrao: string,
  primeiraPaga: boolean = false,
): Parcela[] {
  const n = Math.max(1, Math.min(36, qtdParcelas));
  const totalCentavos = Math.round(valorTotal * 100);
  const baseCentavos = Math.floor(totalCentavos / n);
  const sobraCentavos = totalCentavos - baseCentavos * n;

  const parcelas: Parcela[] = [];
  const [ano, mes, dia] = dataPrimeira.split("-").map(Number);
  const baseDate = new Date(ano, mes - 1, dia, 12, 0, 0);

  for (let i = 1; i <= n; i++) {
    // A sobra de centavos é adicionada à primeira parcela para garantir soma 100% exata
    const centavosDestaParcela = baseCentavos + (i === 1 ? sobraCentavos : 0);
    const valorParcela = centavosDestaParcela / 100;

    let vencimento: Date;
    if (intervaloDias === 30) {
      vencimento = new Date(baseDate);
      vencimento.setMonth(baseDate.getMonth() + (i - 1));
    } else {
      vencimento = new Date(baseDate.getTime() + (i - 1) * intervaloDias * 24 * 60 * 60 * 1000);
    }

    const y = vencimento.getFullYear();
    const m = String(vencimento.getMonth() + 1).padStart(2, "0");
    const d = String(vencimento.getDate()).padStart(2, "0");
    const dataVencStr = `${y}-${m}-${d}`;

    const ehPaga = i === 1 && primeiraPaga;

    parcelas.push({
      numero: i,
      total_parcelas: n,
      valor: valorParcela,
      data_vencimento: dataVencStr,
      status: ehPaga ? "pago" : "pendente",
      forma_pagamento: formaPadrao || "pix",
      pago_em: ehPaga ? new Date().toISOString().slice(0, 10) : null,
      observacoes: ehPaga ? "Entrada paga no ato" : null,
    });
  }

  return parcelas;
}

function ACobrarPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const verValores = canSeeValues(role);
  const podePagar = role === "admin" || role === "atendente";

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "avista" | "parcelados" | "atrasados">("todos");
  const [servicosExpandidos, setServicosExpandidos] = useState<Record<string, boolean>>({});

  // Modais de operação
  const [servicoParaParcelar, setServicoParaParcelar] = useState<Servico | null>(null);
  const [servicoParaBaixarParcela, setServicoParaBaixarParcela] = useState<{
    servico: Servico;
    parcela: Parcela;
  } | null>(null);
  const [servicoParaQuitarTotal, setServicoParaQuitarTotal] = useState<Servico | null>(null);

  // Estados do formulário de parcelamento
  const [qtdParcelasForm, setQtdParcelasForm] = useState("3");
  const [intervaloDiasForm, setIntervaloDiasForm] = useState(30);
  const [dataPrimeiraForm, setDataPrimeiraForm] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPadraoForm, setFormaPadraoForm] = useState("pix");
  const [primeiraPagaForm, setPrimeiraPagaForm] = useState(false);
  const [valorTotalParcelar, setValorTotalParcelar] = useState<number>(0);
  const [parcelasEditaveis, setParcelasEditaveis] = useState<Parcela[]>([]);

  // Estados do modal de baixa individual
  const [dataBaixaParcela, setDataBaixaParcela] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaBaixaParcela, setFormaBaixaParcela] = useState("pix");
  const [obsBaixaParcela, setObsBaixaParcela] = useState("");
  const [lancarCaixaBaixaParcela, setLancarCaixaBaixaParcela] = useState(true);

  // Estados do modal de quitação à vista
  const [dataQuitarTotal, setDataQuitarTotal] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaQuitarTotal, setFormaQuitarTotal] = useState("pix");
  const [lancarCaixaQuitarTotal, setLancarCaixaQuitarTotal] = useState(true);

  // Query de serviços a cobrar
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos-a-cobrar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("*, clientes(nome, telefone, endereco, numero, bairro, cidade)")
        .eq("status", "a_cobrar")
        .order("concluido_em", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Servico[];
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Toggle de visualização detalhada de parcelas no card
  const toggleExpandir = (id: string) => {
    setServicosExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Abrir modal de parcelamento
  const abrirModalParcelar = (servico: Servico) => {
    const total = Number(servico.valor || 0);
    setServicoParaParcelar(servico);
    setValorTotalParcelar(total);

    if (servico.parcelas && servico.parcelas.length > 0) {
      setParcelasEditaveis([...servico.parcelas]);
      setQtdParcelasForm(String(servico.parcelas.length));
      setDataPrimeiraForm(servico.parcelas[0]?.data_vencimento || new Date().toISOString().slice(0, 10));
      setFormaPadraoForm(servico.parcelas[0]?.forma_pagamento || "pix");
    } else {
      const novasParcelas = calcularParcelasExatas(
        total,
        3,
        new Date().toISOString().slice(0, 10),
        30,
        "pix",
        false,
      );
      setParcelasEditaveis(novasParcelas);
      setQtdParcelasForm("3");
      setIntervaloDiasForm(30);
      setDataPrimeiraForm(new Date().toISOString().slice(0, 10));
      setFormaPadraoForm("pix");
      setPrimeiraPagaForm(false);
    }
  };

  // Recalcular parcelas automaticamente a partir dos inputs do topo do modal
  const handleRecalcularParcelas = (
    qtd: number,
    dataIni: string,
    intervalo: number,
    forma: string,
    primeiraPaga: boolean,
  ) => {
    const novas = calcularParcelasExatas(
      valorTotalParcelar,
      qtd,
      dataIni,
      intervalo,
      forma,
      primeiraPaga,
    );
    setParcelasEditaveis(novas);
  };

  // Alterar valor ou data de uma parcela individualmente
  const handleAtualizarParcelaItem = (
    index: number,
    campo: keyof Parcela,
    valor: any,
  ) => {
    setParcelasEditaveis((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [campo]: valor };
      return copy;
    });
  };

  // Soma matemática atual das parcelas editadas
  const somaAtualParcelas = useMemo(() => {
    return parcelasEditaveis.reduce(
      (acc, p) => acc + (parseFloat(String(p.valor).replace(",", ".")) || 0),
      0,
    );
  }, [parcelasEditaveis]);

  // Diferença matemática
  const diferencaMatematica = useMemo(() => {
    return Math.round((somaAtualParcelas - valorTotalParcelar) * 100) / 100;
  }, [somaAtualParcelas, valorTotalParcelar]);

  // Ajustar última parcela para bater a conta 100%
  const ajustarUltimaParcelaParaFechar = () => {
    if (parcelasEditaveis.length === 0) return;
    const somaSemUltima = parcelasEditaveis.slice(0, -1).reduce(
      (acc, p) => acc + (parseFloat(String(p.valor).replace(",", ".")) || 0),
      0,
    );
    const novoValorUltima = Math.max(0, Math.round((valorTotalParcelar - somaSemUltima) * 100) / 100);

    setParcelasEditaveis((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], valor: novoValorUltima };
      return copy;
    });
    toast.success("Última parcela ajustada para fechar exatamente o valor total!");
  };

  // Adicionar uma parcela avulsa
  const adicionarParcelaManual = () => {
    const proximoNum = parcelasEditaveis.length + 1;
    let dataSugerida = new Date().toISOString().slice(0, 10);
    if (parcelasEditaveis.length > 0) {
      const ultimaData = parcelasEditaveis[parcelasEditaveis.length - 1].data_vencimento;
      const [ano, mes, dia] = ultimaData.split("-").map(Number);
      const dt = new Date(ano, mes - 1, dia, 12);
      dt.setMonth(dt.getMonth() + 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      dataSugerida = `${y}-${m}-${d}`;
    }

    const novaParcela: Parcela = {
      numero: proximoNum,
      total_parcelas: proximoNum,
      valor: Math.max(0, Math.round(Math.abs(diferencaMatematica) * 100) / 100) || 0,
      data_vencimento: dataSugerida,
      status: "pendente",
      forma_pagamento: formaPadraoForm || "pix",
      pago_em: null,
      observacoes: null,
    };

    const atualizadas = [...parcelasEditaveis, novaParcela].map((p, idx, arr) => ({
      ...p,
      numero: idx + 1,
      total_parcelas: arr.length,
    }));
    setParcelasEditaveis(atualizadas);
    setQtdParcelasForm(String(atualizadas.length));
  };

  // Remover parcela
  const removerParcelaManual = (idxRemover: number) => {
    if (parcelasEditaveis.length <= 1) {
      toast.error("É necessário ter pelo menos 1 parcela.");
      return;
    }
    const filtradas = parcelasEditaveis
      .filter((_, idx) => idx !== idxRemover)
      .map((p, idx, arr) => ({
        ...p,
        numero: idx + 1,
        total_parcelas: arr.length,
      }));
    setParcelasEditaveis(filtradas);
    setQtdParcelasForm(String(filtradas.length));
  };

  // Mutation: Salvar Parcelamento no Serviço
  const salvarParcelamentoMutation = useMutation({
    mutationFn: async () => {
      if (!servicoParaParcelar) return;

      if (Math.abs(diferencaMatematica) >= 0.01) {
        throw new Error(
          `A soma das parcelas (R$ ${somaAtualParcelas.toFixed(2)}) não bate com o total (R$ ${valorTotalParcelar.toFixed(2)}). Corrija a diferença antes de salvar.`,
        );
      }

      const todasPagas = parcelasEditaveis.length > 0 && parcelasEditaveis.every((p) => p.status === "pago");
      const payload: any = {
        parcelas: parcelasEditaveis,
        forma_pagamento: formaPadraoForm || parcelasEditaveis[0]?.forma_pagamento || "pix",
      };

      if (todasPagas) {
        payload.status = "pago";
        payload.pago_em = new Date().toISOString();
      }

      const { error } = await supabase
        .from("servicos")
        .update(payload as never)
        .eq("id", servicoParaParcelar.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Condições de parcelamento salvas com sucesso!");
      setServicoParaParcelar(null);
      void qc.invalidateQueries({ queryKey: ["servicos-a-cobrar"] });
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar parcelamento");
    },
  });

  // Mutation: Baixar Parcela Individual
  const baixarParcelaMutation = useMutation({
    mutationFn: async () => {
      if (!servicoParaBaixarParcela) return;
      const { servico, parcela } = servicoParaBaixarParcela;

      const parcelasAtuais: Parcela[] = [...(servico.parcelas || [])];
      const idx = parcelasAtuais.findIndex((p) => p.numero === parcela.numero);
      if (idx === -1) throw new Error("Parcela não localizada.");

      parcelasAtuais[idx] = {
        ...parcelasAtuais[idx],
        status: "pago",
        pago_em: dataBaixaParcela,
        forma_pagamento: formaBaixaParcela,
        observacoes: obsBaixaParcela.trim() || parcelasAtuais[idx].observacoes || null,
      };

      const todasPagas = parcelasAtuais.every((p) => p.status === "pago");
      const payload: any = {
        parcelas: parcelasAtuais,
      };
      if (todasPagas) {
        payload.status = "pago";
        payload.pago_em = new Date().toISOString();
      }

      const { error } = await supabase
        .from("servicos")
        .update(payload as never)
        .eq("id", servico.id);

      if (error) throw error;

      // Lançar no Financeiro / Caixa se selecionado
      if (lancarCaixaBaixaParcela) {
        const conta = formaBaixaParcela === "dinheiro" ? "dinheiro" : "banco";
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from("financeiro_lancamentos").insert({
          tipo: "entrada",
          categoria: "servicos",
          descricao: `Recebimento Parcela ${parcela.numero}/${parcela.total_parcelas} - Pedido #${String(servico.numero_pedido).padStart(6, "0")} - ${servico.clientes?.nome || "Cliente"}`,
          valor: parcela.valor,
          forma: formaBaixaParcela,
          conta: conta,
          contraparte: servico.clientes?.nome || null,
          data: dataBaixaParcela,
          origem: "servicos",
          observacoes: obsBaixaParcela.trim() || null,
          created_by: userData.user?.id || null,
        } as never);
        void qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
        void qc.invalidateQueries({ queryKey: ["caixa"] });
      }
    },
    onSuccess: () => {
      toast.success("Parcela baixada com sucesso!");
      setServicoParaBaixarParcela(null);
      setObsBaixaParcela("");
      void qc.invalidateQueries({ queryKey: ["servicos-a-cobrar"] });
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao dar baixa na parcela");
    },
  });

  // Mutation: Quitar Total À Vista
  const quitarTotalMutation = useMutation({
    mutationFn: async () => {
      if (!servicoParaQuitarTotal) return;
      const servico = servicoParaQuitarTotal;
      const valorTotal = Number(servico.valor || 0);

      let parcelasAtualizadas: Parcela[] | undefined = undefined;
      if (servico.parcelas && servico.parcelas.length > 0) {
        parcelasAtualizadas = servico.parcelas.map((p) => ({
          ...p,
          status: "pago" as const,
          pago_em: p.pago_em || dataQuitarTotal,
          forma_pagamento: p.forma_pagamento || formaQuitarTotal,
        }));
      }

      const payload: any = {
        status: "pago",
        pago_em: dataQuitarTotal,
        forma_pagamento: formaQuitarTotal,
      };
      if (parcelasAtualizadas) {
        payload.parcelas = parcelasAtualizadas;
      }

      const { error } = await supabase
        .from("servicos")
        .update(payload as never)
        .eq("id", servico.id);

      if (error) throw error;

      if (lancarCaixaQuitarTotal) {
        const conta = formaQuitarTotal === "dinheiro" ? "dinheiro" : "banco";
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from("financeiro_lancamentos").insert({
          tipo: "entrada",
          categoria: "servicos",
          descricao: `Quitação Total - Pedido #${String(servico.numero_pedido).padStart(6, "0")} - ${servico.clientes?.nome || "Cliente"}`,
          valor: valorTotal,
          forma: formaQuitarTotal,
          conta: conta,
          contraparte: servico.clientes?.nome || null,
          data: dataQuitarTotal,
          origem: "servicos",
          created_by: userData.user?.id || null,
        } as never);
        void qc.invalidateQueries({ queryKey: ["financeiro_lancamentos"] });
        void qc.invalidateQueries({ queryKey: ["caixa"] });
      }
    },
    onSuccess: () => {
      toast.success("Pagamento total quitado com sucesso!");
      setServicoParaQuitarTotal(null);
      void qc.invalidateQueries({ queryKey: ["servicos-a-cobrar"] });
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao quitar serviço");
    },
  });

  // Abertura de mensagem no WhatsApp
  const abrirWhatsAppCobranca = (s: Servico, parcela?: Parcela) => {
    const tel = s.clientes?.telefone ? s.clientes.telefone.replace(/\D/g, "") : "";
    if (!tel) {
      toast.error("Este cliente não possui telefone/WhatsApp cadastrado.");
      return;
    }
    const foneCompleto = tel.startsWith("55") ? tel : `55${tel}`;
    const nome = s.clientes?.nome || "Cliente";
    const numPedido = String(s.numero_pedido).padStart(6, "0");

    let texto = "";
    if (parcela) {
      const dataVenc = formatarDataPtBr(parcela.data_vencimento);
      texto = `Olá, *${nome}*! Tudo bem?\nAqui é da *Nascimento Sistemas de Segurança*.\n\nPassando para lembrar da *Parcela ${parcela.numero}/${parcela.total_parcelas}* do seu pedido *#${numPedido}* no valor de *${formatMoney(parcela.valor)}*, com vencimento para *${dataVenc}*.\n\nPara efetuar o pagamento via PIX ou cartão, ou para nos enviar o comprovante, responda por aqui. Qualquer dúvida estamos à disposição!`;
    } else {
      texto = `Olá, *${nome}*! Tudo bem?\nAqui é da *Nascimento Sistemas de Segurança*.\n\nPassando para enviar o resumo da cobrança do seu pedido *#${numPedido}* no valor total de *${formatMoney(s.valor)}*.\n\nTemos opções de pagamento à vista com desconto ou parcelamento facilitado no cartão ou boleto. Qualquer dúvida estamos à disposição!`;
    }

    const url = `https://wa.me/${foneCompleto}?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank");
  };

  // Hoje no formato YYYY-MM-DD
  const hojeStr = new Date().toISOString().slice(0, 10);

  // Métricas e estatísticas consolidadas
  const metricas = useMemo(() => {
    let saldoTotalRestante = 0;
    let totalJaRecebido = 0;
    let qtdParcelados = 0;
    let qtdParcelasAtrasadas = 0;
    let valorAtrasado = 0;

    servicos.forEach((s) => {
      const valorTotal = Number(s.valor || 0);
      if (s.parcelas && s.parcelas.length > 0) {
        qtdParcelados++;
        let pagoDeste = 0;
        s.parcelas.forEach((p) => {
          if (p.status === "pago") {
            pagoDeste += Number(p.valor || 0);
          } else {
            if (p.data_vencimento < hojeStr) {
              qtdParcelasAtrasadas++;
              valorAtrasado += Number(p.valor || 0);
            }
          }
        });
        totalJaRecebido += pagoDeste;
        saldoTotalRestante += Math.max(0, valorTotal - pagoDeste);
      } else {
        saldoTotalRestante += valorTotal;
      }
    });

    return {
      saldoTotalRestante,
      totalJaRecebido,
      qtdParcelados,
      qtdParcelasAtrasadas,
      valorAtrasado,
      totalServicos: servicos.length,
    };
  }, [servicos, hojeStr]);

  // Filtragem da lista
  const filtrados = useMemo(() => {
    let list = servicos;

    if (filtroTipo === "avista") {
      list = list.filter((s) => !s.parcelas || s.parcelas.length === 0);
    } else if (filtroTipo === "parcelados") {
      list = list.filter((s) => s.parcelas && s.parcelas.length > 0);
    } else if (filtroTipo === "atrasados") {
      list = list.filter((s) => {
        if (!s.parcelas || s.parcelas.length === 0) return false;
        return s.parcelas.some((p) => p.status === "pendente" && p.data_vencimento < hojeStr);
      });
    }

    if (busca.trim()) {
      const termo = busca.toLowerCase();
      list = list.filter((s) => {
        const ped = String(s.numero_pedido || "");
        const cli = s.clientes?.nome?.toLowerCase() || "";
        const tel = s.clientes?.telefone || "";
        const cid = s.clientes?.cidade?.toLowerCase() || "";
        const desc = s.descricao?.toLowerCase() || "";
        const rel = s.relatorio?.toLowerCase() || "";
        return (
          ped.includes(termo) ||
          cli.includes(termo) ||
          tel.includes(termo) ||
          cid.includes(termo) ||
          desc.includes(termo) ||
          rel.includes(termo)
        );
      });
    }

    return list;
  }, [servicos, filtroTipo, busca, hojeStr]);

  return (
    <div className="space-y-6">
      {/* Topo / Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">A Cobrar</h1>
          <p className="text-sm text-slate-500">
            Gerencie cobranças pendentes, receba à vista ou parcele os pagamentos com controle de parcelas e datas de vencimento.
          </p>
        </div>
      </div>

      {/* Cards de Métricas */}
      {verValores && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Saldo a Cobrar</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">
              {formatMoney(metricas.saldoTotalRestante)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {metricas.totalServicos} serviços aguardando quitação
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Já Recebido (Parcelas)</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-2">
              {formatMoney(metricas.totalJaRecebido)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Entradas parciais de clientes
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Serviços Parcelados</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-indigo-700 mt-2">
              {metricas.qtdParcelados} pedidos
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Com cronograma de pagamentos
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Parcelas Vencidas</span>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-600 mt-2">
              {metricas.qtdParcelasAtrasadas} {metricas.qtdParcelasAtrasadas === 1 ? "parcela" : "parcelas"}
            </div>
            <p className="text-xs text-rose-500 mt-1">
              {metricas.valorAtrasado > 0 ? `Total: ${formatMoney(metricas.valorAtrasado)}` : "Nenhum atraso"}
            </p>
          </div>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9 h-10 bg-white border-slate-300 shadow-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pedido, cliente, telefone ou serviço..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setFiltroTipo("todos")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              filtroTipo === "todos"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Todos ({servicos.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("avista")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              filtroTipo === "avista"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            À Vista ({servicos.filter((s) => !s.parcelas || s.parcelas.length === 0).length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("parcelados")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              filtroTipo === "parcelados"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Parcelados ({metricas.qtdParcelados})
          </button>
          {metricas.qtdParcelasAtrasadas > 0 && (
            <button
              type="button"
              onClick={() => setFiltroTipo("atrasados")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                filtroTipo === "atrasados"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-rose-700 hover:bg-rose-50"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Atrasados ({metricas.qtdParcelasAtrasadas})
            </button>
          )}
        </div>
      </div>

      {/* Lista de Serviços */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Carregando serviços a cobrar...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500 space-y-2">
          <p className="font-medium text-slate-700 text-base">Nenhum serviço a cobrar encontrado.</p>
          <p className="text-xs text-slate-400">
            {busca ? "Tente alterar os termos da busca." : "Todos os serviços concluídos foram quitados!"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtrados.map((s) => {
            const valorTotal = Number(s.valor ?? 0);
            const temParcelas = Boolean(s.parcelas && s.parcelas.length > 0);
            const parcelas = s.parcelas || [];
            const parcelasPagas = parcelas.filter((p) => p.status === "pago");
            const valorJaPago = parcelasPagas.reduce((acc, p) => acc + Number(p.valor || 0), 0);
            const saldoDevedor = Math.max(0, valorTotal - valorJaPago);
            const percentualPago = valorTotal > 0 ? Math.min(100, Math.round((valorJaPago / valorTotal) * 100)) : 0;
            const estaExpandido = servicosExpandidos[s.id] ?? true;

            // Encontrar próxima parcela a vencer
            const parcelasPendentes = parcelas.filter((p) => p.status === "pendente");
            const proximaParcela = parcelasPendentes[0];
            const temAtrasada = parcelasPendentes.some((p) => p.data_vencimento < hojeStr);

            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-all hover:border-slate-300"
              >
                <div className="space-y-4">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          OS #{String(s.numero_pedido ?? 0).padStart(6, "0")}
                        </span>
                        <span className="text-xs text-slate-500">
                          {tipoLabels[s.tipo]}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 text-base mt-1">
                        {s.clientes?.nome || "Cliente sem nome"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Concluído em: {formatDateTime(s.concluido_em)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {temParcelas ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            temAtrasada
                              ? "bg-rose-100 text-rose-800 border border-rose-300"
                              : parcelasPagas.length > 0
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-indigo-100 text-indigo-800 border border-indigo-300"
                          }`}
                        >
                          {temAtrasada
                            ? "Atraso no Parcelamento"
                            : `Parcelado em ${parcelas.length}x (${parcelasPagas.length}/${parcelas.length} pagas)`}
                        </span>
                      ) : (
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                          Cobrança À Vista
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detalhes do Serviço & Contato */}
                  <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p>
                      <strong className="text-slate-700">Descrição/Relatório:</strong>{" "}
                      {s.relatorio || s.descricao || "—"}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200">
                      <span>
                        <strong className="text-slate-700">Telefone:</strong>{" "}
                        {s.clientes?.telefone || "—"}
                      </span>
                      {s.clientes?.telefone && (
                        <button
                          type="button"
                          onClick={() => abrirWhatsAppCobranca(s, proximaParcela)}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer text-xs"
                          title="Enviar lembrete amigável no WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Lembrar no WhatsApp
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Resumo Financeiro do Card */}
                  {verValores && (
                    <div className="bg-slate-900 text-white rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-300 font-medium">Valor Total da OS:</span>
                        <span className="text-sm font-semibold">{formatMoney(valorTotal)}</span>
                      </div>

                      {temParcelas ? (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-emerald-400 font-medium">
                              Já Pago ({parcelasPagas.length} de {parcelas.length}):
                            </span>
                            <span className="text-emerald-400 font-bold">{formatMoney(valorJaPago)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-800">
                            <span className="text-amber-300 font-semibold">Saldo Restante:</span>
                            <span className="text-base font-extrabold text-amber-300">
                              {formatMoney(saldoDevedor)}
                            </span>
                          </div>

                          {/* Barra de Progresso de Quitação */}
                          <div className="space-y-1 pt-1">
                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full transition-all duration-300"
                                style={{ width: `${percentualPago}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>{percentualPago}% quitado</span>
                              {proximaParcela && (
                                <span className={proximaParcela.data_vencimento < hojeStr ? "text-rose-400 font-bold" : ""}>
                                  Próx: {formatarDataPtBr(proximaParcela.data_vencimento)} (R$ {proximaParcela.valor.toFixed(2)})
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between text-base pt-1 border-t border-slate-800">
                          <span className="text-amber-300 font-semibold">Valor a Cobrar:</span>
                          <span className="text-xl font-extrabold text-amber-300">
                            {formatMoney(valorTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Seção das Parcelas Expandidas */}
                  {temParcelas && (
                    <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          Cronograma de Parcelas ({parcelas.length}x)
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleExpandir(s.id)}
                          className="text-slate-500 hover:text-slate-700 flex items-center gap-0.5 cursor-pointer text-[11px]"
                        >
                          {estaExpandido ? "Recolher" : "Ver Parcelas"}
                          {estaExpandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {estaExpandido && (
                        <div className="space-y-2 pt-1">
                          {parcelas.map((p) => {
                            const estaVencida = p.status === "pendente" && p.data_vencimento < hojeStr;
                            const ehHoje = p.status === "pendente" && p.data_vencimento === hojeStr;

                            return (
                              <div
                                key={p.numero}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                                  p.status === "pago"
                                    ? "bg-emerald-50/50 border-emerald-200 text-slate-700"
                                    : estaVencida
                                      ? "bg-rose-50/70 border-rose-200 text-slate-800"
                                      : "bg-slate-50 border-slate-200 text-slate-800"
                                }`}
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900">
                                      Parcela {p.numero}/{p.total_parcelas}
                                    </span>
                                    <span className="font-extrabold text-slate-900">
                                      {formatMoney(p.valor)}
                                    </span>
                                    {p.status === "pago" ? (
                                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] h-5 px-1.5">
                                        ✓ Paga em {formatarDataPtBr(p.pago_em)}
                                      </Badge>
                                    ) : estaVencida ? (
                                      <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                                        Vencida há dias
                                      </Badge>
                                    ) : ehHoje ? (
                                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] h-5 px-1.5">
                                        Vence Hoje
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-slate-600 text-[10px] h-5 px-1.5">
                                        A vencer
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                    <span>
                                      Vencimento: <strong>{formatarDataPtBr(p.data_vencimento)}</strong>
                                    </span>
                                    <span>
                                      Forma: {FORMAS_PAGAMENTO.find((f) => f.id === p.forma_pagamento)?.label || p.forma_pagamento || "PIX"}
                                    </span>
                                  </div>
                                  {p.observacoes && (
                                    <p className="text-[10px] text-slate-400 italic">
                                      Obs: {p.observacoes}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 self-end sm:self-center">
                                  {p.status === "pendente" && podePagar && (
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                      onClick={() =>
                                        setServicoParaBaixarParcela({
                                          servico: s,
                                          parcela: p,
                                        })
                                      }
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                      Dar Baixa
                                    </Button>
                                  )}
                                  {p.status === "pendente" && s.clientes?.telefone && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                      onClick={() => abrirWhatsAppCobranca(s, p)}
                                      title="Lembrete no WhatsApp"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Botões de Ação do Card */}
                {podePagar && (
                  <div className="pt-4 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => abrirModalParcelar(s)}
                        className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                      >
                        <CreditCard className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                        {temParcelas ? "Editar / Renegociar Parcelas" : "Pagar Parcelado"}
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => setServicoParaQuitarTotal(s)}
                      className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                    >
                      <CheckCheck className="w-3.5 h-3.5 mr-1" />
                      {temParcelas ? "Quitar Todas as Parcelas" : "Quitar Total (À Vista)"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CONFIGURAR PARCELAMENTO DO CLIENTE E CONFERÊNCIA DAS CONTAS      */}
      {/* ========================================================================= */}
      <Dialog
        open={!!servicoParaParcelar}
        onOpenChange={(v) => !v && setServicoParaParcelar(null)}
      >
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Condições de Parcelamento — Pedido #{String(servicoParaParcelar?.numero_pedido ?? 0).padStart(6, "0")}
                </DialogTitle>
                <p className="text-xs text-slate-500">
                  Cliente: <strong className="text-slate-700">{servicoParaParcelar?.clientes?.nome}</strong> · Total:{" "}
                  <strong className="text-indigo-600">{formatMoney(valorTotalParcelar)}</strong>
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Bloco de Configuração Rápida */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>1. Parâmetros de Divisão Automática</span>
                <span className="text-xs font-normal text-slate-500">
                  Cálculo automático com ajuste exato de centavos
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Número de Parcelas
                  </Label>
                  <select
                    value={qtdParcelasForm}
                    onChange={(e) => {
                      const novaQtd = Number(e.target.value);
                      setQtdParcelasForm(e.target.value);
                      handleRecalcularParcelas(
                        novaQtd,
                        dataPrimeiraForm,
                        intervaloDiasForm,
                        formaPadraoForm,
                        primeiraPagaForm,
                      );
                    }}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-sm mt-1 focus:ring-2 focus:ring-indigo-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) => (
                      <option key={n} value={n}>
                        {n}x de R$ {(valorTotalParcelar / n).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Intervalo / Frequência
                  </Label>
                  <select
                    value={intervaloDiasForm}
                    onChange={(e) => {
                      const novInt = Number(e.target.value);
                      setIntervaloDiasForm(novInt);
                      handleRecalcularParcelas(
                        Number(qtdParcelasForm),
                        dataPrimeiraForm,
                        novInt,
                        formaPadraoForm,
                        primeiraPagaForm,
                      );
                    }}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-sm mt-1 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={30}>Mensal (a cada 30 dias)</option>
                    <option value={15}>Quinzenal (a cada 15 dias)</option>
                    <option value={7}>Semanal (a cada 7 dias)</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Data da 1ª Parcela
                  </Label>
                  <Input
                    type="date"
                    value={dataPrimeiraForm}
                    onChange={(e) => {
                      setDataPrimeiraForm(e.target.value);
                      handleRecalcularParcelas(
                        Number(qtdParcelasForm),
                        e.target.value,
                        intervaloDiasForm,
                        formaPadraoForm,
                        primeiraPagaForm,
                      );
                    }}
                    className="h-9 text-xs bg-white mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Forma de Cobrança Padrão
                  </Label>
                  <select
                    value={formaPadraoForm}
                    onChange={(e) => {
                      setFormaPadraoForm(e.target.value);
                      setParcelasEditaveis((prev) =>
                        prev.map((p) => ({ ...p, forma_pagamento: e.target.value })),
                      );
                    }}
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-sm mt-1 focus:ring-2 focus:ring-indigo-500"
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="primeira-paga-check"
                    checked={primeiraPagaForm}
                    onChange={(e) => {
                      setPrimeiraPagaForm(e.target.checked);
                      handleRecalcularParcelas(
                        Number(qtdParcelasForm),
                        dataPrimeiraForm,
                        intervaloDiasForm,
                        formaPadraoForm,
                        e.target.checked,
                      );
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <Label
                    htmlFor="primeira-paga-check"
                    className="text-xs font-medium text-slate-700 cursor-pointer"
                  >
                    A 1ª parcela (entrada) já foi paga pelo cliente hoje
                  </Label>
                </div>
              </div>
            </div>

            {/* Tabela de Parcelas Customizáveis */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  2. Conferência e Edição das Parcelas Individuais
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={adicionarParcelaManual}
                  className="h-7 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar Parcela
                </Button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200 bg-white">
                <div className="grid grid-cols-12 gap-2 p-2.5 bg-slate-100 text-[11px] font-bold text-slate-600 uppercase">
                  <div className="col-span-2">Parcela</div>
                  <div className="col-span-3">Vencimento</div>
                  <div className="col-span-3">Valor (R$)</div>
                  <div className="col-span-3">Forma</div>
                  <div className="col-span-1 text-center">Ação</div>
                </div>

                {parcelasEditaveis.map((p, idx) => (
                  <div
                    key={idx}
                    className={`grid grid-cols-12 gap-2 p-2.5 items-center text-xs ${
                      p.status === "pago" ? "bg-emerald-50/40" : ""
                    }`}
                  >
                    <div className="col-span-2 font-bold text-slate-800 flex items-center gap-1.5">
                      <span>{p.numero}/{parcelasEditaveis.length}</span>
                      {p.status === "pago" && (
                        <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-semibold">
                          Paga
                        </span>
                      )}
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="date"
                        value={p.data_vencimento}
                        onChange={(e) =>
                          handleAtualizarParcelaItem(idx, "data_vencimento", e.target.value)
                        }
                        className="h-8 text-xs bg-white"
                      />
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={p.valor}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleAtualizarParcelaItem(idx, "valor", val);
                        }}
                        className="h-8 text-xs font-semibold bg-white"
                      />
                    </div>

                    <div className="col-span-3">
                      <select
                        value={p.forma_pagamento || "pix"}
                        onChange={(e) =>
                          handleAtualizarParcelaItem(idx, "forma_pagamento", e.target.value)
                        }
                        className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs"
                      >
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => removerParcelaManual(idx)}
                        disabled={parcelasEditaveis.length <= 1}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors disabled:opacity-30 cursor-pointer"
                        title="Remover parcela"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Painel de Validação Matemática ("Fazer as contas corretas") */}
            <div
              className={`p-4 rounded-xl border transition-colors ${
                Math.abs(diferencaMatematica) < 0.01
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {Math.abs(diferencaMatematica) < 0.01 ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                    <span className="font-bold text-sm">
                      {Math.abs(diferencaMatematica) < 0.01
                        ? "Contas 100% Exatas e Conferidas!"
                        : "Atenção: A soma das parcelas não bate com o valor total!"}
                    </span>
                  </div>
                  <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Total Contratado: <strong>{formatMoney(valorTotalParcelar)}</strong>
                    </span>
                    <span>
                      Soma das Parcelas: <strong>{formatMoney(somaAtualParcelas)}</strong>
                    </span>
                    {Math.abs(diferencaMatematica) >= 0.01 && (
                      <span className="font-bold text-rose-700">
                        Diferença: {diferencaMatematica > 0 ? `+${formatMoney(diferencaMatematica)}` : formatMoney(diferencaMatematica)}
                      </span>
                    )}
                  </div>
                </div>

                {Math.abs(diferencaMatematica) >= 0.01 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={ajustarUltimaParcelaParaFechar}
                    className="bg-white border-rose-300 text-rose-700 hover:bg-rose-100 text-xs shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    Ajustar Última Parcela
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setServicoParaParcelar(null)}
              disabled={salvarParcelamentoMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => salvarParcelamentoMutation.mutate()}
              disabled={salvarParcelamentoMutation.isPending || Math.abs(diferencaMatematica) >= 0.01}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {salvarParcelamentoMutation.isPending ? "Salvando..." : "Salvar Parcelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: DAR BAIXA EM PARCELA INDIVIDUAL                                  */}
      {/* ========================================================================= */}
      <Dialog
        open={!!servicoParaBaixarParcela}
        onOpenChange={(v) => !v && setServicoParaBaixarParcela(null)}
      >
        <DialogContent className="max-w-md p-5">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Dar Baixa na Parcela {servicoParaBaixarParcela?.parcela.numero}/{servicoParaBaixarParcela?.parcela.total_parcelas}
                </DialogTitle>
                <p className="text-xs text-slate-500">
                  Cliente: {servicoParaBaixarParcela?.servico.clientes?.nome} · Pedido #{servicoParaBaixarParcela?.servico.numero_pedido}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-slate-600">Valor a ser recebido:</span>
              <span className="text-lg font-extrabold text-emerald-600">
                {formatMoney(servicoParaBaixarParcela?.parcela.valor)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Data do Pagamento</Label>
                <Input
                  type="date"
                  value={dataBaixaParcela}
                  onChange={(e) => setDataBaixaParcela(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Forma Recebida</Label>
                <select
                  value={formaBaixaParcela}
                  onChange={(e) => setFormaBaixaParcela(e.target.value)}
                  className="w-full h-9 px-2 bg-white border border-slate-300 rounded text-xs mt-1"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Observações / Comprovante (opcional)
              </Label>
              <Input
                placeholder="Ex: Recebido via chave PIX CNPJ ou autorização maquininha"
                value={obsBaixaParcela}
                onChange={(e) => setObsBaixaParcela(e.target.value)}
                className="h-9 text-xs mt-1"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="lancar-caixa-parcela"
                checked={lancarCaixaBaixaParcela}
                onChange={(e) => setLancarCaixaBaixaParcela(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
              />
              <Label htmlFor="lancar-caixa-parcela" className="text-xs text-slate-700 cursor-pointer">
                Lançar entrada automaticamente no Caixa / Financeiro
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setServicoParaBaixarParcela(null)}
              disabled={baixarParcelaMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => baixarParcelaMutation.mutate()}
              disabled={baixarParcelaMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {baixarParcelaMutation.isPending ? "Confirmando..." : "Confirmar Recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: QUITAR TOTAL À VISTA                                             */}
      {/* ========================================================================= */}
      <Dialog
        open={!!servicoParaQuitarTotal}
        onOpenChange={(v) => !v && setServicoParaQuitarTotal(null)}
      >
        <DialogContent className="max-w-md p-5">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <CheckCheck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Quitar Pedido #{String(servicoParaQuitarTotal?.numero_pedido ?? 0).padStart(6, "0")}
                </DialogTitle>
                <p className="text-xs text-slate-500">
                  Cliente: {servicoParaQuitarTotal?.clientes?.nome}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-slate-600">Valor Total da Quitação:</span>
              <span className="text-xl font-extrabold text-blue-700">
                {formatMoney(servicoParaQuitarTotal?.valor)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Data da Baixa</Label>
                <Input
                  type="date"
                  value={dataQuitarTotal}
                  onChange={(e) => setDataQuitarTotal(e.target.value)}
                  className="h-9 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Forma de Pagamento</Label>
                <select
                  value={formaQuitarTotal}
                  onChange={(e) => setFormaQuitarTotal(e.target.value)}
                  className="w-full h-9 px-2 bg-white border border-slate-300 rounded text-xs mt-1"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="lancar-caixa-quitar"
                checked={lancarCaixaQuitarTotal}
                onChange={(e) => setLancarCaixaQuitarTotal(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
              />
              <Label htmlFor="lancar-caixa-quitar" className="text-xs text-slate-700 cursor-pointer">
                Lançar entrada automaticamente no Caixa / Financeiro
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setServicoParaQuitarTotal(null)}
              disabled={quitarTotalMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => quitarTotalMutation.mutate()}
              disabled={quitarTotalMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {quitarTotalMutation.isPending ? "Baixando..." : "Confirmar Quitação Total"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
