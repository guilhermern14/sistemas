import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Edit,
  MapPin,
  Play,
  Plus,
  Search,
  Trash2,
  UserCheck,
  CheckCircle2,
  ClipboardCheck,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ExecucaoDialog } from "@/components/ExecucaoDialog";
import {
  formatDateTime,
  formatMoney,
  statusBadgeClass,
  statusLabels,
  tipoLabels,
  toLocalInputValue,
  type ServicoStatus,
  type ServicoTipo,
} from "@/lib/servico";
import { enderecoCompleto, mapsUrl, type Cliente, type Profile, type Servico } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/agendamentos")({
  head: () => ({
    meta: [
      { title: "Agendamentos — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Agende instalações, manutenções e orçamentos para a equipe de rua." },
      { property: "og:title", content: "Agendamentos — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Agende instalações, manutenções e orçamentos." },
    ],
  }),
  component: AgendamentosPage,
});

const DURACAO_PRESETS = [
  { value: "30", label: "30 minutos" },
  { value: "45", label: "45 minutos" },
  { value: "60", label: "1 hora (60 min)" },
  { value: "90", label: "1h 30min (90 min)" },
  { value: "120", label: "2 horas (120 min)" },
  { value: "180", label: "3 horas (180 min)" },
  { value: "240", label: "4 horas (240 min)" },
  { value: "360", label: "6 horas" },
  { value: "480", label: "8 horas (Dia todo)" },
  { value: "custom", label: "Personalizado (minutos)" },
];

function formatarPrevisaoTermino(dataInicioStr: string, duracaoMinutos: number) {
  if (!dataInicioStr) return "";
  const dInicio = new Date(dataInicioStr);
  if (isNaN(dInicio.getTime())) return "";
  const dFim = new Date(dInicio.getTime() + duracaoMinutos * 60 * 1000);
  const horaInicio = dInicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const horaFim = dFim.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dataInicioFormatada = dInicio.toLocaleDateString("pt-BR");
  return `${dataInicioFormatada} · ${horaInicio} às ${horaFim} (${duracaoMinutos} min)`;
}

function AgendamentosPage() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const verValores = canSeeValues(role);
  const podeAgendar = role === "admin" || role === "atendente";
  const ehCampo = role === "campo";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cliente_id: "",
    tipo: "manutencao" as ServicoTipo,
    data_agendada: toLocalInputValue(),
    duracao_estimada_minutos: "60",
    duracao_custom: "",
    tecnico_id: "",
    descricao: "",
  });

  const [execucao, setExecucao] = useState<Servico | null>(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Servico | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  // Serviços agendados e em andamento
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["agendamentos", role, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("servicos")
        .select("*, clientes(nome, telefone, endereco, numero, bairro, cidade)")
        .in("status", ["agendado", "em_andamento"])
        .order("data_agendada", { ascending: true });
      if (ehCampo && user?.id) {
        q = q.eq("tecnico_id", user.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Servico[];
    },
    refetchInterval: 4000,
  });

  const servicosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return servicos;
    return servicos.filter((s) =>
      `${s.numero_pedido ?? ""} ${s.clientes?.nome ?? ""} ${s.clientes?.telefone ?? ""} ${s.clientes?.cidade ?? ""} ${s.tipo ?? ""} ${s.descricao ?? ""} ${s.status ?? ""}`
        .toLowerCase()
        .includes(termo),
    );
  }, [servicos, busca]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-simples"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data as unknown as Cliente[];
    },
  });

  // Perfis e técnicos disponíveis
  const { data: profiles = [] } = useQuery({
    queryKey: ["perfis-tecnicos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome, telefone").order("nome");
      if (error) throw error;
      return data as unknown as Profile[];
    },
  });

  const duracaoMinutosCalculada = useMemo(() => {
    if (form.duracao_estimada_minutos === "custom") {
      const c = parseInt(form.duracao_custom, 10);
      return isNaN(c) || c <= 0 ? 60 : c;
    }
    const val = parseInt(form.duracao_estimada_minutos, 10);
    return isNaN(val) || val <= 0 ? 60 : val;
  }, [form.duracao_estimada_minutos, form.duracao_custom]);

  // Checagem de conflitos de horário em tempo real
  const conflitos = useMemo(() => {
    if (!form.data_agendada) return [];
    const novoInicio = new Date(form.data_agendada).getTime();
    if (isNaN(novoInicio)) return [];
    const novoFim = novoInicio + duracaoMinutosCalculada * 60 * 1000;

    return servicos.filter((s) => {
      // Se estiver editando, não conflitar consigo mesmo
      if (editando && s.id === editando.id) return false;
      // Se um técnico específico for selecionado, só conflitar com o mesmo técnico
      if (form.tecnico_id && s.tecnico_id && s.tecnico_id !== form.tecnico_id) return false;

      const sInicio = new Date(s.data_agendada).getTime();
      if (isNaN(sInicio)) return false;
      const sDuracaoMin = Number(s.duracao_estimada_minutos) || 60;
      const sFim = sInicio + sDuracaoMin * 60 * 1000;

      // Sobreposição de horários
      return novoInicio < sFim && novoFim > sInicio;
    });
  }, [form.data_agendada, form.tecnico_id, duracaoMinutosCalculada, servicos, editando]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.cliente_id) {
        throw new Error("Selecione um cliente para agendar.");
      }
      if (!form.data_agendada) {
        throw new Error("Selecione a data e horário do agendamento.");
      }
      const dataIso = new Date(form.data_agendada).toISOString();
      const { data, error } = await supabase.from("servicos").insert({
        cliente_id: form.cliente_id,
        tipo: form.tipo,
        status: "agendado",
        data_agendada: dataIso,
        duracao_estimada_minutos: duracaoMinutosCalculada,
        tecnico_id: form.tecnico_id || null,
        descricao: form.descricao || null,
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Agendamento criado com sucesso!");
      setOpen(false);
      setForm({
        cliente_id: "",
        tipo: "manutencao",
        data_agendada: toLocalInputValue(),
        duracao_estimada_minutos: "60",
        duracao_custom: "",
        tecnico_id: "",
        descricao: "",
      });
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Não foi possível criar o agendamento.");
    },
  });

  const atualizar = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      if (!form.cliente_id) throw new Error("Selecione um cliente.");
      if (!form.data_agendada) throw new Error("Selecione a data e hora.");
      const dataIso = new Date(form.data_agendada).toISOString();
      const { error } = await supabase
        .from("servicos")
        .update({
          cliente_id: form.cliente_id,
          tipo: form.tipo,
          data_agendada: dataIso,
          duracao_estimada_minutos: duracaoMinutosCalculada,
          tecnico_id: form.tecnico_id || null,
          descricao: form.descricao || null,
        } as never)
        .eq("id", editando.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento atualizado com sucesso!");
      setEditando(null);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Não foi possível atualizar o agendamento.");
    },
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servicos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento excluído");
      setItemParaExcluir(null);
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Não foi possível excluir o agendamento.");
    },
  });

  const iniciarServico = useMutation({
    mutationFn: async (id: string) => {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("servicos")
        .update({
          status: "em_andamento",
          iniciado_em: nowIso,
        } as never)
        .eq("id", id);
      if (error) throw error;
      return nowIso;
    },
    onSuccess: (nowIso) => {
      const hora = new Date(nowIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      toast.success(`Serviço iniciado às ${hora}! Status alterado para Em Andamento.`);
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: (err: any) => toast.error(err?.message || "Não foi possível iniciar o serviço"),
  });

  const abrirEdicao = (s: Servico) => {
    setEditando(s);
    const duracao = Number(s.duracao_estimada_minutos) || 60;
    const ehPreset = DURACAO_PRESETS.some((p) => p.value === String(duracao) && p.value !== "custom");
    setForm({
      cliente_id: s.cliente_id,
      tipo: s.tipo,
      data_agendada: toLocalInputValue(s.data_agendada),
      duracao_estimada_minutos: ehPreset ? String(duracao) : "custom",
      duracao_custom: ehPreset ? "" : String(duracao),
      tecnico_id: s.tecnico_id ?? "",
      descricao: s.descricao ?? "",
    });
    setOpen(true);
  };

  const fecharDialog = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setEditando(null);
      setForm({
        cliente_id: "",
        tipo: "manutencao",
        data_agendada: toLocalInputValue(),
        duracao_estimada_minutos: "60",
        duracao_custom: "",
        tecnico_id: "",
        descricao: "",
      });
    }
  };

  const getNomeTecnico = (tecnicoId: string | null | undefined) => {
    if (!tecnicoId) return "Não atribuído (Qualquer técnico)";
    const t = profiles.find((p) => p.id === tecnicoId);
    return t ? t.nome : "Técnico responsável";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
          <p className="text-sm text-muted-foreground">
            {ehCampo
              ? "Serviços agendados para você — inicie o atendimento ao chegar no cliente."
              : "Gerenciamento de horários, manutenções e instalações da equipe de rua."}
          </p>
        </div>

        {podeAgendar && (
          <Dialog open={open} onOpenChange={fecharDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Novo agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editando ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente cadastrado" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} {c.cidade ? `(${c.cidade})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo de serviço</Label>
                    <Select
                      value={form.tipo}
                      onValueChange={(v) => setForm({ ...form, tipo: v as ServicoTipo })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(tipoLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Data e horário de início *</Label>
                    <Input
                      type="datetime-local"
                      value={form.data_agendada}
                      onChange={(e) => setForm({ ...form, data_agendada: e.target.value })}
                    />
                  </div>
                </div>

                {/* Duração Estimada da Manutenção */}
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3.5">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 font-medium">
                      <Clock className="h-4 w-4 text-primary" />
                      Tempo estimado para o serviço *
                    </Label>
                    <span className="text-xs font-semibold text-primary">
                      {duracaoMinutosCalculada} minutos
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={form.duracao_estimada_minutos}
                      onValueChange={(v) => setForm({ ...form, duracao_estimada_minutos: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a duração média" />
                      </SelectTrigger>
                      <SelectContent>
                        {DURACAO_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {form.duracao_estimada_minutos === "custom" && (
                      <Input
                        type="number"
                        placeholder="Ex: 75 (em minutos)"
                        min={10}
                        max={1440}
                        value={form.duracao_custom}
                        onChange={(e) => setForm({ ...form, duracao_custom: e.target.value })}
                      />
                    )}
                  </div>

                  {form.data_agendada && (
                    <p className="text-xs text-muted-foreground">
                      📅 <strong>Horário previsto:</strong> {formatarPrevisaoTermino(form.data_agendada, duracaoMinutosCalculada)}
                    </p>
                  )}
                </div>

                {/* Alerta de Conflito de Horário */}
                {conflitos.length > 0 && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Aviso de Conflito de Horário ({conflitos.length})
                    </div>
                    <div className="mt-1.5 space-y-1 text-xs">
                      {conflitos.map((c) => (
                        <p key={c.id}>
                          • <strong>OS/Pedido #{c.numero_pedido || "—"}</strong> ({c.clientes?.nome || "Cliente"}): {formatDateTime(c.data_agendada)} (Duração: {c.duracao_estimada_minutos || 60}m) — {getNomeTecnico(c.tecnico_id)}
                        </p>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-medium">
                      Recomenda-se ajustar o horário ou selecionar outro técnico para evitar sobreposições de atendimento.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Equipe de rua / Técnico responsável</Label>
                  <Select value={form.tecnico_id} onValueChange={(v) => setForm({ ...form, tecnico_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o técnico (ou deixe aberto para qualquer equipe)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sem técnico específico (Qualquer equipe)</SelectItem>
                      {profiles.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome} {t.telefone ? `(${t.telefone})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Descrição do chamado / Instruções</Label>
                  <Textarea
                    placeholder="Ex: Verificar câmeras 2 e 5 sem sinal, trocar conector BNC e testar gravação do DVR."
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => fecharDialog(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => (editando ? atualizar.mutate() : criar.mutate())}
                  disabled={!form.cliente_id || !form.data_agendada || criar.isPending || atualizar.isPending}
                >
                  {criar.isPending || atualizar.isPending
                    ? "Salvando..."
                    : editando
                      ? "Salvar alterações"
                      : "Confirmar agendamento"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar por número do pedido, cliente, telefone, cidade ou serviço..."
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          <Clock className="mr-2 h-4 w-4 animate-spin" /> Carregando agendamentos...
        </div>
      ) : servicosFiltrados.length === 0 ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium">Nenhum agendamento pendente no momento.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {busca
              ? "Nenhum resultado corresponde à sua pesquisa."
              : "Novos agendamentos criados aparecerão aqui para a equipe de rua."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {servicosFiltrados.map((s) => {
            const duracao = Number(s.duracao_estimada_minutos) || 60;
            const horarioFormatado = formatarPrevisaoTermino(s.data_agendada, duracao);
            const nomeTecnico = getNomeTecnico(s.tecnico_id);

            return (
              <div
                key={s.id}
                className={`surface-card space-y-3 p-5 transition-all ${
                  s.status === "em_andamento" ? "border-info/50 bg-info/5 ring-1 ring-info/20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        OS #{s.numero_pedido ? String(s.numero_pedido) : "—"}
                      </span>
                      <p className="font-semibold text-foreground">{s.clientes?.nome}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {tipoLabels[s.tipo]}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass[s.status]}`}>
                    {statusLabels[s.status]}
                  </span>
                </div>

                {/* Horário & Duração Estimada */}
                <div className="space-y-1 rounded-md bg-muted/40 p-2.5 text-xs">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <CalendarClock className="h-3.5 w-3.5 text-primary" />
                    <span>{horarioFormatado || formatDateTime(s.data_agendada)}</span>
                  </div>

                  {s.iniciado_em && (
                    <div className="flex items-center gap-1.5 font-semibold text-info">
                      <Play className="h-3 w-3 fill-info" />
                      <span>Iniciado em: {formatDateTime(s.iniciado_em)}</span>
                    </div>
                  )}

                  {s.concluido_em && (
                    <div className="flex items-center gap-1.5 font-semibold text-primary">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Finalizado em: {formatDateTime(s.concluido_em)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <UserCheck className="h-3 w-3" />
                    <span>Responsável: <strong>{nomeTecnico}</strong></span>
                  </div>
                </div>

                {enderecoCompleto(s.clientes) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{enderecoCompleto(s.clientes)}</span>
                    {mapsUrl(s.clientes) && (
                      <a
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        href={mapsUrl(s.clientes) as string}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MapPin className="h-3.5 w-3.5" /> Abrir no Maps
                      </a>
                    )}
                  </div>
                )}

                {s.descricao && (
                  <p className="rounded bg-background/60 p-2 text-xs text-muted-foreground border">
                    {s.descricao}
                  </p>
                )}

                {verValores && s.valor != null && (
                  <p className="text-xs text-muted-foreground">
                    Valor previsto: <strong>{formatMoney(s.valor)}</strong>
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {/* Botão de Iniciar Serviço ao chegar no cliente */}
                  {s.status === "agendado" && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 font-medium text-white hover:bg-emerald-700"
                      onClick={() => iniciarServico.mutate(s.id)}
                      disabled={iniciarServico.isPending}
                    >
                      <Play className="mr-1.5 h-4 w-4 fill-white" /> Iniciar serviço
                    </Button>
                  )}

                  {/* Registrar Execução / Finalizar */}
                  <Button
                    size="sm"
                    variant={s.status === "em_andamento" ? "default" : "secondary"}
                    onClick={() => setExecucao(s)}
                  >
                    <ClipboardCheck className="mr-1.5 h-4 w-4" /> Registrar execução
                  </Button>

                  {(role === "admin" || role === "atendente") && (
                    <Button size="sm" variant="outline" onClick={() => abrirEdicao(s)}>
                      <Edit className="mr-1.5 h-3.5 w-3.5" /> Editar
                    </Button>
                  )}

                  {role === "admin" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setItemParaExcluir(s.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!itemParaExcluir}
        onOpenChange={(o) => !o && setItemParaExcluir(null)}
        title="Excluir agendamento"
        description="Tem certeza que deseja excluir este agendamento? Esta ação removerá a OS do sistema."
        onConfirm={() => {
          if (itemParaExcluir) {
            excluir.mutate(itemParaExcluir);
          }
        }}
        isPending={excluir.isPending}
      />

      <ExecucaoDialog
        servico={execucao}
        onClose={() => setExecucao(null)}
        verValores={verValores}
      />
    </div>
  );
}


