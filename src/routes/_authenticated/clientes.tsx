import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Edit, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import type { Cliente } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Cadastro e consulta de clientes atendidos pela equipe." },
      { property: "og:title", content: "Clientes — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Cadastro e consulta de clientes." },
    ],
  }),
  component: ClientesPage,
});

const vazio = {
  nome: "",
  telefone: "",
  email: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  observacoes: "",
};


function ClientesPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(vazio);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data as unknown as Cliente[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("clientes")
        .insert({ ...form, created_by: userData.user?.id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente cadastrado");
      setForm(vazio);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: () => toast.error("Não foi possível cadastrar o cliente"),
  });

  const atualizar = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      const { error } = await supabase.from("clientes").update(form as never).eq("id", editando.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente atualizado");
      setEditando(null);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["clientes-simples"] });
    },
    onError: () => toast.error("Não foi possível atualizar o cliente"),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente excluído");
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["clientes-simples"] });
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
    },
    onError: () => toast.error("Não foi possível excluir o cliente. Verifique se você tem permissão."),
  });

  const abrirEdicao = (c: Cliente) => {
    setEditando(c);
    setForm({
      nome: c.nome ?? "", telefone: c.telefone ?? "", email: c.email ?? "",
      endereco: c.endereco ?? "", numero: c.numero ?? "", bairro: c.bairro ?? "",
      cidade: c.cidade ?? "", observacoes: c.observacoes ?? "",
    });
    setOpen(true);
  };

  const fecharDialog = (value: boolean) => {
    setOpen(value);
    if (!value) { setEditando(null); setForm(vazio); }
  };

  const filtrados = clientes.filter((c) =>
    `${c.nome} ${c.telefone ?? ""} ${c.cidade ?? ""}`.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastre e consulte os clientes da empresa.</p>
        </div>

        <Dialog open={open} onOpenChange={fecharDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? "Editar cliente" : "Cadastrar cliente"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <div className="space-y-2">
                    <Label>Endereço</Label>
                    <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => editando ? atualizar.mutate() : criar.mutate()}
                disabled={!form.nome || criar.isPending || atualizar.isPending}
              >
                {editando ? "Salvar alterações" : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, telefone ou cidade"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Nenhum cliente encontrado.</TableCell>
              </TableRow>
            ) : (
              filtrados.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.telefone ?? "—"}</TableCell>
                  <TableCell>{[[c.endereco, c.numero].filter(Boolean).join(", "), c.bairro].filter(Boolean).join(" - ") || "—"}</TableCell>
                  <TableCell>{c.cidade ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => abrirEdicao(c)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" title="Excluir"
                        onClick={() => setItemParaExcluir(c.id)}
                        disabled={excluir.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDeleteDialog
        open={!!itemParaExcluir}
        onOpenChange={(o) => !o && setItemParaExcluir(null)}
        title="Excluir cliente"
        description="Tem certeza que deseja excluir este cliente? Esta ação também pode excluir agendamentos vinculados."
        onConfirm={() => {
          if (itemParaExcluir) {
            excluir.mutate(itemParaExcluir);
          }
        }}
        isPending={excluir.isPending}
      />
    </div>
  );
}
