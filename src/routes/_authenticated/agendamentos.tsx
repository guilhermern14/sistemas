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
import { Edit, MapPin, Plus, Search, Trash2 } from "lucide-react";
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
    tecnico_id: "",
    descricao: "",
  });

  const [execucao, setExecucao] = useState<Servico | null>(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Servico | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["agendamentos", role, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("servicos")
        .select("*, clientes(nome, telefone, endereco, numero, bairro, cidade)")

        .in("status", ["agendado", "em_andamento"])
        .order("data_agendada");
      if (ehCampo && user?.id) q = q.eq("tecnico_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Servico[];
    },
  });

  const servicosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return servicos;
    return servicos.filter((s) =>
      `${s.clientes?.nome ?? ""} ${s.clientes?.telefone ?? ""} ${s.clientes?.cidade ?? ""} ${s.tipo ?? ""} ${s.descricao ?? ""} ${s.status ?? ""}`
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

  const { data: tecnicos = [] } = useQuery({
    queryKey: ["tecnicos"],
    queryFn: async () => {
      const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "campo");
      if (error) throw error;
      const ids = (roles ?? []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return [];
      const { data, error: e2 } = await supabase.from("profiles").select("id, nome, telefone").in("id", ids);
      if (e2) throw e2;
      return data as unknown as Profile[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("servicos").insert({
        cliente_id: form.cliente_id,
        tipo: form.tipo,
        data_agendada: new Date(form.data_agendada).toISOString(),
        tecnico_id: form.tecnico_id || null,
        descricao: form.descricao || null,
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento criado");
      setOpen(false);
      setForm({ ...form, cliente_id: "", descricao: "" });
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível criar o agendamento"),
  });

  const atualizar = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      const { error } = await supabase.from("servicos").update({
        cliente_id: form.cliente_id,
        tipo: form.tipo,
        data_agendada: new Date(form.data_agendada).toISOString(),
        tecnico_id: form.tecnico_id || null,
        descricao: form.descricao || null,
      } as never).eq("id", editando.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento atualizado");
      setEditando(null);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível atualizar o agendamento"),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servicos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento excluído");
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível excluir o agendamento"),
  });

  const abrirEdicao = (s: Servico) => {
    setEditando(s);
    setForm({
      cliente_id: s.cliente_id,
      tipo: s.tipo,
      data_agendada: toLocalInputValue(s.data_agendada),
      tecnico_id: s.tecnico_id ?? "",
      descricao: s.descricao ?? "",
    });
    setOpen(true);
  };

  const fecharDialog = (value: boolean) => {
    setOpen(value);
    if (!value) setEditando(null);
  };

  const atualizarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ServicoStatus }) => {
      const { error } = await supabase.from("servicos").update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível atualizar o serviço"),
  });




  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
          <p className="text-sm text-muted-foreground">
            {ehCampo ? "Serviços atribuídos a você." : "Serviços agendados e em andamento."}
          </p>
        </div>

        {podeAgendar && (
          <Dialog open={open} onOpenChange={fecharDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Novo agendamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editando ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
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
                    <Label>Data e hora</Label>
                    <Input
                      type="datetime-local"
                      value={form.data_agendada}
                      onChange={(e) => setForm({ ...form, data_agendada: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Equipe de rua</Label>
                  <Select value={form.tecnico_id} onValueChange={(v) => setForm({ ...form, tecnico_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {tecnicos.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição do serviço</Label>
                  <Textarea
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => editando ? atualizar.mutate() : criar.mutate()}
                  disabled={!form.cliente_id || criar.isPending || atualizar.isPending}
                >
                  {editando ? "Salvar alterações" : "Agendar"}
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
          placeholder="Pesquisar agendamentos por cliente, telefone, cidade ou serviço..."
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : servicosFiltrados.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Nenhum agendamento encontrado para a pesquisa atual.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {servicosFiltrados.map((s) => (
            <div key={s.id} className="surface-card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{s.clientes?.nome}</p>
                  <p className="text-sm text-muted-foreground">
                    {tipoLabels[s.tipo]} · {formatDateTime(s.data_agendada)}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass[s.status]}`}>
                  {statusLabels[s.status]}
                </span>
              </div>

              {enderecoCompleto(s.clientes) && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{enderecoCompleto(s.clientes)}</span>
                  {mapsUrl(s.clientes) && (
                    <a
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      href={mapsUrl(s.clientes) as string}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="h-4 w-4" /> Abrir no Maps
                    </a>
                  )}
                </div>
              )}
              {s.descricao && <p className="text-sm">{s.descricao}</p>}
              {verValores && <p className="text-sm text-muted-foreground">Valor: {formatMoney(s.valor)}</p>}

              <div className="flex flex-wrap gap-2 pt-1">
                {(role === "admin" || role === "atendente") && (
                  <Button size="sm" variant="outline" onClick={() => abrirEdicao(s)}>
                    <Edit className="mr-2 h-4 w-4" /> Editar
                  </Button>
                )}
                {role === "admin" && (
                  <Button size="sm" variant="outline" onClick={() => setItemParaExcluir(s.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </Button>
                )}
                {s.status === "agendado" && (ehCampo || role === "admin") && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => atualizarStatus.mutate({ id: s.id, status: "em_andamento" })}
                  >
                    Iniciar serviço
                  </Button>
                )}
                {(ehCampo || role === "admin") && (
                  <Button size="sm" onClick={() => setExecucao(s)}>
                    Registrar execução
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!itemParaExcluir}
        onOpenChange={(o) => !o && setItemParaExcluir(null)}
        title="Excluir agendamento"
        description="Tem certeza que deseja excluir este agendamento?"
        onConfirm={() => {
          if (itemParaExcluir) {
            excluir.mutate(itemParaExcluir);
          }
        }}
        isPending={excluir.isPending}
      />

      <ExecucaoDialog servico={execucao} onClose={() => setExecucao(null)} verValores={verValores} />
    </div>
  );
}

