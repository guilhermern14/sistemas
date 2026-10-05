import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Bell,
  BellRing,
  Plus,
  Search,
  CheckCircle2,
  Pencil,
  Trash2,
  Calendar,
  User,
  Phone,
  MessageCircle,
  Filter,
  Check,
  RefreshCw,
  Clock,
  AlertCircle,
  X,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Aviso, Cliente } from "@/lib/types";
import {
  getHojeISO,
  getAmanhaISO,
  getUrgenciaAviso,
  deveAparecerNaTelaInicial,
  formatarDataBR,
} from "@/lib/avisos";

export const Route = createFileRoute("/_authenticated/avisos")({
  head: () => ({
    meta: [
      { title: "Avisos e Lembretes — Nascimento Sistemas de Segurança" },
      {
        name: "description",
        content: "Gerenciamento de avisos e lembretes para clientes e serviços.",
      },
    ],
  }),
  component: AvisosPage,
});

export function AvisosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Estados de Filtros e Busca
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "pendentes" | "resolvidos">("todos");
  const [filtroClienteId, setFiltroClienteId] = useState<string>("todos");
  const [ordemData, setOrdemData] = useState<"asc" | "desc">("asc");

  // Estados dos Modais
  const [modalAberto, setModalAberto] = useState(false);
  const [avisoEditando, setAvisoEditando] = useState<Aviso | null>(null);
  const [avisoParaExcluir, setAvisoParaExcluir] = useState<Aviso | null>(null);

  // Estados do Formulário de Aviso
  const [formClienteId, setFormClienteId] = useState<string>("");
  const [formDataAviso, setFormDataAviso] = useState<string>(getHojeISO());
  const [formTitulo, setFormTitulo] = useState<string>("");
  const [formMensagem, setFormMensagem] = useState<string>("");
  const [buscaClienteNoForm, setBuscaClienteNoForm] = useState<string>("");

  // Modal para cadastro rápido de cliente direto da tela de aviso
  const [showNovoClienteModal, setShowNovoClienteModal] = useState(false);
  const [novoCliNome, setNovoCliNome] = useState("");
  const [novoCliTelefone, setNovoCliTelefone] = useState("");
  const [novoCliCidade, setNovoCliCidade] = useState("");

  // Consulta de Avisos
  const { data: avisos = [], isLoading, refetch } = useQuery({
    queryKey: ["avisos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("*, rel_clientes:clientes(id, nome, telefone, cidade, bairro)")
        .order("data_aviso", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Aviso[];
    },
  });

  // Consulta de Clientes para o Seletor
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, telefone, cidade, bairro")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Cliente[];
    },
  });

  // Clientes filtrados dentro do seletor do modal
  const clientesFiltradosNoForm = useMemo(() => {
    if (!buscaClienteNoForm.trim()) return clientes;
    const t = buscaClienteNoForm.toLowerCase().trim();
    return clientes.filter(
      (c) =>
        c.nome?.toLowerCase().includes(t) ||
        c.telefone?.toLowerCase().includes(t) ||
        c.cidade?.toLowerCase().includes(t) ||
        c.bairro?.toLowerCase().includes(t),
    );
  }, [clientes, buscaClienteNoForm]);

  // Abertura do Modal de Criação / Edição
  const abrirCriarAviso = () => {
    setAvisoEditando(null);
    setFormClienteId("");
    setFormDataAviso(getHojeISO());
    setFormTitulo("");
    setFormMensagem("");
    setBuscaClienteNoForm("");
    setModalAberto(true);
  };

  const abrirEditarAviso = (aviso: Aviso) => {
    setAvisoEditando(aviso);
    setFormClienteId(aviso.cliente_id || "");
    setFormDataAviso(aviso.data_aviso || getHojeISO());
    setFormTitulo(aviso.titulo || "");
    setFormMensagem(aviso.mensagem || "");
    setBuscaClienteNoForm("");
    setModalAberto(true);
  };

  // Salvar Aviso (Criar ou Atualizar)
  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!formDataAviso) {
        throw new Error("Por favor, informe a data para o aviso.");
      }
      if (!formMensagem.trim()) {
        throw new Error("Por favor, digite o conteúdo do aviso.");
      }

      if (avisoEditando) {
        // Atualizar
        const { error } = await supabase
          .from("avisos")
          .update({
            cliente_id: formClienteId || null,
            data_aviso: formDataAviso,
            titulo: formTitulo.trim() || null,
            mensagem: formMensagem.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", avisoEditando.id);
        if (error) throw error;
      } else {
        // Criar Novo
        const { error } = await supabase.from("avisos").insert({
          cliente_id: formClienteId || null,
          data_aviso: formDataAviso,
          titulo: formTitulo.trim() || null,
          mensagem: formMensagem.trim(),
          status: "pendente",
          created_by: user?.id || null,
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(avisoEditando ? "Aviso atualizado com sucesso!" : "Novo aviso criado com sucesso!");
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["avisos-entrada"] });
      qc.invalidateQueries({ queryKey: ["avisos-dashboard"] });
      setModalAberto(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar aviso");
    },
  });

  // Alternar Status Resolvido / Pendente
  const alternarStatusMutation = useMutation({
    mutationFn: async ({ id, statusAtual }: { id: string; statusAtual: "pendente" | "resolvido" }) => {
      const novoStatus = statusAtual === "pendente" ? "resolvido" : "pendente";
      const resolvidoEm = novoStatus === "resolvido" ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("avisos")
        .update({
          status: novoStatus,
          resolvido_em: resolvidoEm,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      return novoStatus;
    },
    onSuccess: (novoStatus) => {
      toast.success(
        novoStatus === "resolvido"
          ? "Aviso marcado como resolvido!"
          : "Aviso reaberto como pendente!",
      );
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["avisos-entrada"] });
      qc.invalidateQueries({ queryKey: ["avisos-dashboard"] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao alterar status: ${err.message || err}`);
    },
  });

  // Excluir Aviso
  const excluirMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("avisos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso excluído com sucesso!");
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["avisos-entrada"] });
      qc.invalidateQueries({ queryKey: ["avisos-dashboard"] });
      setAvisoParaExcluir(null);
    },
    onError: (err: any) => {
      toast.error(`Erro ao excluir aviso: ${err.message || err}`);
    },
  });

  // Cadastro rápido de cliente
  const handleCadastrarClienteRapido = async () => {
    if (!novoCliNome.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("clientes")
        .insert({
          nome: novoCliNome.trim(),
          telefone: novoCliTelefone.trim() || null,
          cidade: novoCliCidade.trim() || null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      toast.success("Cliente cadastrado!");
      qc.invalidateQueries({ queryKey: ["clientes-select"] });
      setFormClienteId(data.id);
      setNovoCliNome("");
      setNovoCliTelefone("");
      setNovoCliCidade("");
      setShowNovoClienteModal(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar cliente");
    }
  };

  // Contadores para cards de métricas
  const contadores = useMemo(() => {
    let total = avisos.length;
    let pendentes = 0;
    let resolvidos = 0;
    let ativos = 0; // hoje, amanhã ou atrasados
    let hojeCount = 0;
    let atrasadosCount = 0;
    let amanhaCount = 0;

    const hoje = getHojeISO();
    const amanha = getAmanhaISO();

    for (const a of avisos) {
      if (a.status === "resolvido") {
        resolvidos++;
      } else {
        pendentes++;
        if (deveAparecerNaTelaInicial(a)) {
          ativos++;
        }
        if (a.data_aviso < hoje) {
          atrasadosCount++;
        } else if (a.data_aviso === hoje) {
          hojeCount++;
        } else if (a.data_aviso === amanha) {
          amanhaCount++;
        }
      }
    }

    return { total, pendentes, resolvidos, ativos, hojeCount, atrasadosCount, amanhaCount };
  }, [avisos]);

  // Filtragem da Lista de Avisos
  const avisosFiltrados = useMemo(() => {
    return avisos
      .filter((aviso) => {
        // Filtro de Status
        if (filtroStatus === "ativos") {
          if (!deveAparecerNaTelaInicial(aviso)) return false;
        } else if (filtroStatus === "pendentes") {
          if (aviso.status !== "pendente") return false;
        } else if (filtroStatus === "resolvidos") {
          if (aviso.status !== "resolvido") return false;
        }

        // Filtro de Cliente
        if (filtroClienteId !== "todos") {
          if (filtroClienteId === "sem_cliente") {
            if (aviso.cliente_id) return false;
          } else {
            if (aviso.cliente_id !== filtroClienteId) return false;
          }
        }

        // Busca Textual
        if (busca.trim()) {
          const t = busca.toLowerCase().trim();
          const cliente = aviso.rel_clientes || aviso.clientes;
          const matchMsg = aviso.mensagem?.toLowerCase().includes(t);
          const matchTitulo = aviso.titulo?.toLowerCase().includes(t);
          const matchCli = cliente?.nome?.toLowerCase().includes(t) || cliente?.telefone?.toLowerCase().includes(t);
          if (!matchMsg && !matchTitulo && !matchCli) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dA = a.data_aviso || "";
        const dB = b.data_aviso || "";
        if (ordemData === "asc") {
          return dA.localeCompare(dB);
        } else {
          return dB.localeCompare(dA);
        }
      });
  }, [avisos, filtroStatus, filtroClienteId, busca, ordemData]);

  // Cliente selecionado no form para preview
  const clienteSelecionadoNoForm = clientes.find((c) => c.id === formClienteId);

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Avisos e Lembretes
              </h1>
              <p className="text-xs text-slate-500">
                Cadastre e acompanhe recados de clientes, manutenções programadas e alertas importantes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={abrirCriarAviso}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-medium cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Criar Aviso
          </Button>
        </div>
      </div>

      {/* Cards de Métricas / Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div
          onClick={() => setFiltroStatus("ativos")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            filtroStatus === "ativos"
              ? "border-amber-400 bg-amber-50/70 ring-2 ring-amber-400/30"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-900">Avisos Ativos</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <BellRing className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-950">{contadores.ativos}</p>
          <p className="text-[11px] text-amber-800/80 mt-0.5">
            {contadores.hojeCount} hoje · {contadores.amanhaCount} amanhã · {contadores.atrasadosCount} atrasados
          </p>
        </div>

        <div
          onClick={() => setFiltroStatus("pendentes")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            filtroStatus === "pendentes"
              ? "border-blue-400 bg-blue-50/70 ring-2 ring-blue-400/30"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-900">Total Pendentes</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-950">{contadores.pendentes}</p>
          <p className="text-[11px] text-blue-700/80 mt-0.5">Aguardando resolução</p>
        </div>

        <div
          onClick={() => setFiltroStatus("resolvidos")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            filtroStatus === "resolvidos"
              ? "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-400/30"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-900">Resolvidos</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-950">{contadores.resolvidos}</p>
          <p className="text-[11px] text-emerald-700/80 mt-0.5">Finalizados com sucesso</p>
        </div>

        <div
          onClick={() => setFiltroStatus("todos")}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            filtroStatus === "todos"
              ? "border-slate-400 bg-slate-50 ring-2 ring-slate-400/30"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">Todos os Avisos</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <FileText className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{contadores.total}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Histórico completo</p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Busca Textual */}
          <div className="md:col-span-5 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, conteúdo do aviso ou assunto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 h-10 text-sm bg-slate-50/50"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtro por Cliente */}
          <div className="md:col-span-4">
            <select
              value={filtroClienteId}
              onChange={(e) => setFiltroClienteId(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="todos">Todos os Clientes</option>
              <option value="sem_cliente">Avisos Gerais (Sem Cliente)</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} {c.cidade ? `(${c.cidade})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Ordenação por Data */}
          <div className="md:col-span-3">
            <select
              value={ordemData}
              onChange={(e) => setOrdemData(e.target.value as "asc" | "desc")}
              className="w-full h-10 px-3 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="asc">Data do Aviso: Mais Próximo Primeiro</option>
              <option value="desc">Data do Aviso: Mais Distante Primeiro</option>
            </select>
          </div>
        </div>

        {/* Abas de Status Rápidas */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          <Button
            size="sm"
            variant={filtroStatus === "todos" ? "default" : "outline"}
            onClick={() => setFiltroStatus("todos")}
            className="h-7 text-xs font-medium"
          >
            Todos ({contadores.total})
          </Button>
          <Button
            size="sm"
            variant={filtroStatus === "ativos" ? "default" : "outline"}
            onClick={() => setFiltroStatus("ativos")}
            className={`h-7 text-xs font-medium ${
              filtroStatus === "ativos" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-200 text-amber-900 hover:bg-amber-50"
            }`}
          >
            Ativos / Urgentes ({contadores.ativos})
          </Button>
          <Button
            size="sm"
            variant={filtroStatus === "pendentes" ? "default" : "outline"}
            onClick={() => setFiltroStatus("pendentes")}
            className="h-7 text-xs font-medium"
          >
            Pendentes ({contadores.pendentes})
          </Button>
          <Button
            size="sm"
            variant={filtroStatus === "resolvidos" ? "default" : "outline"}
            onClick={() => setFiltroStatus("resolvidos")}
            className="h-7 text-xs font-medium"
          >
            Resolvidos ({contadores.resolvidos})
          </Button>

          {(busca || filtroClienteId !== "todos" || filtroStatus !== "todos") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBusca("");
                setFiltroClienteId("todos");
                setFiltroStatus("todos");
              }}
              className="h-7 text-xs text-slate-500 hover:text-slate-800 ml-auto cursor-pointer"
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Lista de Avisos */}
      {isLoading ? (
        <div className="py-12 text-center text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
          <p className="text-sm">Carregando avisos...</p>
        </div>
      ) : avisosFiltrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 px-4 text-center">
          <Bell className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <h3 className="text-base font-semibold text-slate-800">Nenhum aviso encontrado</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            {busca || filtroClienteId !== "todos" || filtroStatus !== "todos"
              ? "Tente ajustar ou limpar os filtros de busca para visualizar outros registros."
              : "Cadastre avisos para receber lembretes de clientes e compromissos automaticamente ao entrar no sistema."}
          </p>
          <Button
            onClick={abrirCriarAviso}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Criar Primeiro Aviso
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {avisosFiltrados.map((aviso) => {
            const urg = getUrgenciaAviso(aviso);
            const cliente = aviso.rel_clientes || aviso.clientes;
            const telLimpo = cliente?.telefone?.replace(/\D/g, "");
            const estaResolvido = aviso.status === "resolvido";

            return (
              <div
                key={aviso.id}
                className={`rounded-xl border p-4.5 transition-all flex flex-col justify-between ${urg.cardBorderClass} ${
                  estaResolvido ? "opacity-80 hover:opacity-100" : ""
                }`}
              >
                <div>
                  {/* Topo do Card: Urgência e Data */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold border ${urg.badgeClass}`}
                      >
                        {urg.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-white/80 px-2.5 py-1 rounded-md border border-slate-200">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      <span>Data do Aviso:</span>
                      <strong className="text-slate-900">{formatarDataBR(aviso.data_aviso)}</strong>
                    </div>
                  </div>

                  {/* Título (se houver) */}
                  {aviso.titulo && (
                    <h3 className="text-base font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      {aviso.titulo}
                    </h3>
                  )}

                  {/* Caixa de Texto do Conteúdo */}
                  <div className="bg-white rounded-lg border border-slate-200/90 p-3.5 text-sm text-slate-800 whitespace-pre-line leading-relaxed shadow-2xs">
                    {aviso.mensagem}
                  </div>

                  {/* Detalhes do Cliente Vinculado */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/70 text-xs">
                    {cliente ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-900">{cliente.nome}</span>
                          {cliente.cidade && (
                            <span className="text-slate-500 font-normal">({cliente.cidade})</span>
                          )}
                        </div>

                        {cliente.telefone && (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${telLimpo}`}
                              className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors"
                            >
                              <Phone className="w-3 h-3 text-slate-500" />
                              {cliente.telefone}
                            </a>
                            <a
                              href={`https://wa.me/55${telLimpo}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded font-medium transition-colors"
                            >
                              <MessageCircle className="w-3 h-3 text-emerald-600" />
                              WhatsApp
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Aviso geral da empresa (sem cliente vinculado)
                      </span>
                    )}
                  </div>
                </div>

                {/* Rodapé com os 3 botões solicitados: "resolvido" "editar" "excluir" */}
                <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                  {/* Botão Resolvido / Reabrir */}
                  <Button
                    size="sm"
                    variant={estaResolvido ? "outline" : "default"}
                    onClick={() =>
                      alternarStatusMutation.mutate({
                        id: aviso.id,
                        statusAtual: aviso.status,
                      })
                    }
                    className={`h-8 text-xs font-medium gap-1.5 cursor-pointer ${
                      estaResolvido
                        ? "border-slate-300 text-slate-600 hover:bg-slate-100"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {estaResolvido ? "Reabrir Aviso" : "Resolvido"}
                  </Button>

                  <div className="flex items-center gap-1.5">
                    {/* Botão Editar */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrirEditarAviso(aviso)}
                      className="h-8 text-xs font-medium text-slate-700 hover:bg-slate-100 gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </Button>

                    {/* Botão Excluir */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAvisoParaExcluir(aviso)}
                      className="h-8 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200 gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação / Edição do Aviso */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl ${
                  avisoEditando ? "bg-amber-100 text-amber-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {avisoEditando ? <Pencil className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  {avisoEditando ? "Editar Aviso" : "Criar Novo Aviso"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Configure o cliente relacionado, a data do lembrete e o conteúdo do aviso.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* 1. Seleção do Cliente Relacionado */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="aviso-cliente" className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Cliente Relacionado ao Aviso (Opcional)</span>
                </Label>
                <button
                  type="button"
                  onClick={() => setShowNovoClienteModal(true)}
                  className="text-xs font-medium text-amber-700 hover:text-amber-800 flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> + Cadastrar Novo Cliente
                </button>
              </div>

              <div className="space-y-2">
                <select
                  id="aviso-cliente"
                  value={formClienteId}
                  onChange={(e) => setFormClienteId(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                >
                  <option value="">-- Sem cliente específico (Aviso Geral) --</option>
                  {clientesFiltradosNoForm.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.telefone ? `(${c.telefone})` : ""} {c.cidade ? `- ${c.cidade}` : ""}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    placeholder="Filtrar lista de clientes por nome, telefone ou cidade..."
                    value={buscaClienteNoForm}
                    onChange={(e) => setBuscaClienteNoForm(e.target.value)}
                    className="h-8 pl-8 text-xs bg-white border-slate-200"
                  />
                </div>
              </div>

              {clienteSelecionadoNoForm && (
                <div className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between">
                  <span>
                    Selecionado: <strong className="text-slate-900">{clienteSelecionadoNoForm.nome}</strong>
                  </span>
                  {clienteSelecionadoNoForm.telefone && (
                    <span className="text-slate-500">{clienteSelecionadoNoForm.telefone}</span>
                  )}
                </div>
              )}
            </div>

            {/* 2. Data para o Aviso com Atalhos Rápidos */}
            <div className="space-y-1.5">
              <Label htmlFor="aviso-data" className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Data do Aviso <span className="text-red-500">*</span></span>
              </Label>
              <Input
                id="aviso-data"
                type="date"
                value={formDataAviso}
                onChange={(e) => setFormDataAviso(e.target.value)}
                className="h-10 text-sm bg-white border-slate-300"
              />

              {/* Botões de atalho rápido para facilitar */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 mr-1">Atalhos rápidos:</span>
                <button
                  type="button"
                  onClick={() => setFormDataAviso(getHojeISO())}
                  className={`text-xs px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    formDataAviso === getHojeISO()
                      ? "bg-amber-100 text-amber-900 border-amber-300 font-semibold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setFormDataAviso(getAmanhaISO())}
                  className={`text-xs px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    formDataAviso === getAmanhaISO()
                      ? "bg-blue-100 text-blue-900 border-blue-300 font-semibold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                  }`}
                >
                  Amanhã (1 dia antes)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    setFormDataAviso(
                      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                    );
                  }}
                  className="text-xs px-2.5 py-0.5 rounded border bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200 cursor-pointer"
                >
                  Em 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 30);
                    setFormDataAviso(
                      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                    );
                  }}
                  className="text-xs px-2.5 py-0.5 rounded border bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200 cursor-pointer"
                >
                  Em 30 dias
                </button>
              </div>

              <p className="text-[11px] text-slate-500 mt-1">
                🔔 O aviso aparecerá como alerta na tela inicial <strong>1 dia antes</strong> da data, no <strong>dia exato</strong> e continuará aparecendo nos <strong>dias seguintes</strong> até ser marcado como resolvido.
              </p>
            </div>

            {/* 3. Assunto / Título Opcional */}
            <div className="space-y-1.5">
              <Label htmlFor="aviso-titulo" className="text-xs font-semibold text-slate-800">
                Título ou Assunto (Opcional)
              </Label>
              <Input
                id="aviso-titulo"
                placeholder="Ex: Manutenção periódica de câmeras, Retorno de proposta, Cobrança..."
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                className="h-10 text-sm bg-white border-slate-300"
              />
            </div>

            {/* 4. Caixa em baixo para digitar o que é sobre o aviso */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="aviso-mensagem" className="text-xs font-semibold text-slate-800">
                  O que é sobre o aviso <span className="text-red-500">*</span>
                </Label>
                <span className="text-[11px] text-slate-400">
                  {formMensagem.length} caracteres
                </span>
              </div>
              <Textarea
                id="aviso-mensagem"
                rows={5}
                placeholder="Digite detalhadamente o que precisa ser feito, detalhes do cliente, recado deixado, materiais necessários ou qualquer observação relevante..."
                value={formMensagem}
                onChange={(e) => setFormMensagem(e.target.value)}
                className="text-sm bg-white border-slate-300 focus:border-amber-500 focus:ring-amber-500 resize-y min-h-[120px]"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalAberto(false)}
              className="text-xs"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={() => salvarMutation.mutate()}
              disabled={salvarMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer shadow-xs gap-1.5"
            >
              {salvarMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {avisoEditando ? "Salvar Alterações" : "Criar Aviso"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação para Excluir Aviso */}
      <Dialog open={!!avisoParaExcluir} onOpenChange={(v) => !v && setAvisoParaExcluir(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-rose-600">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Excluir este aviso?
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Esta ação não pode ser desfeita. O aviso será removido permanentemente.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {avisoParaExcluir && (
            <div className="my-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-1">
              <p>
                <strong>Data:</strong> {formatarDataBR(avisoParaExcluir.data_aviso)}
              </p>
              {avisoParaExcluir.titulo && (
                <p>
                  <strong>Título:</strong> {avisoParaExcluir.titulo}
                </p>
              )}
              <p className="line-clamp-2 text-slate-500 italic">
                "{avisoParaExcluir.mensagem}"
              </p>
            </div>
          )}

          <DialogFooter className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAvisoParaExcluir(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={excluirMutation.isPending}
              onClick={() => avisoParaExcluir && excluirMutation.mutate(avisoParaExcluir.id)}
              className="text-xs font-semibold cursor-pointer gap-1.5"
            >
              {excluirMutation.isPending ? "Excluindo..." : "Sim, Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro Rápido de Cliente */}
      <Dialog open={showNovoClienteModal} onOpenChange={setShowNovoClienteModal}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <User className="w-5 h-5 text-amber-600" />
              Cadastrar Novo Cliente
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O novo cliente será selecionado automaticamente no aviso após salvar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                Nome do Cliente <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Ex: João da Silva, Mercado Central, Condomínio..."
                value={novoCliNome}
                onChange={(e) => setNovoCliNome(e.target.value)}
                className="text-sm h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Telefone / WhatsApp</Label>
              <Input
                placeholder="Ex: (11) 98765-4321"
                value={novoCliTelefone}
                onChange={(e) => setNovoCliTelefone(e.target.value)}
                className="text-sm h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Cidade</Label>
              <Input
                placeholder="Ex: São Paulo"
                value={novoCliCidade}
                onChange={(e) => setNovoCliCidade(e.target.value)}
                className="text-sm h-9"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNovoClienteModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCadastrarClienteRapido}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              Cadastrar e Selecionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
