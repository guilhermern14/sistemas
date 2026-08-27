import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { roleLabels, type AppRole } from "@/hooks/useAuth";
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Trash2, UserPlus } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import type { Profile } from "@/lib/types";
import { criarUsuario, excluirUsuario, listarUsuarios } from "@/lib/usuarios.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Gerencie as funções de acesso da equipe no sistema." },
      { property: "og:title", content: "Usuários — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Gerencie as funções de acesso da equipe." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: data.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: UsuariosPage,
});

const novoVazio = { nome: "", email: "", senha: "", role: "atendente" as AppRole };

function UsuariosPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState(novoVazio);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  const fnListar = useServerFn(listarUsuarios);
  const fnCriar = useServerFn(criarUsuario);
  const fnExcluir = useServerFn(excluirUsuario);

  const { data: emails = [] } = useQuery({
    queryKey: ["usuarios-emails"],
    queryFn: () => fnListar(),
  });

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("id, nome, telefone").order("nome"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const mapa = new Map<string, AppRole>();
      (roles ?? []).forEach((r: { user_id: string; role: string }) =>
        mapa.set(r.user_id, r.role as AppRole),
      );
      return (profiles as unknown as Profile[]).map((p) => ({ ...p, role: mapa.get(p.id) ?? null }));
    },
  });

  const mapaEmails = useMemo(
    () => new Map(emails.map((u: { id: string; email: string }) => [u.id, u.email])),
    [emails],
  );

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter((u) =>
      `${u.nome ?? ""} ${u.telefone ?? ""} ${mapaEmails.get(u.id) ?? ""} ${u.role ? roleLabels[u.role] : ""}`
        .toLowerCase()
        .includes(termo),
    );
  }, [usuarios, busca, mapaEmails]);

  const alterar = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Função atualizada");
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: () => toast.error("Não foi possível alterar a função"),
  });

  const criar = useMutation({
    mutationFn: async () => fnCriar({ data: novo }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setNovo(novoVazio);
      setAberto(false);
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
      void qc.invalidateQueries({ queryKey: ["usuarios-emails"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível criar o usuário"),
  });

  const excluir = useMutation({
    mutationFn: async (userId: string) => fnExcluir({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      setItemParaExcluir(null);
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
      void qc.invalidateQueries({ queryKey: ["usuarios-emails"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Defina a função de cada login: administrador, atendente, equipe de rua ou financeiro.
          </p>
        </div>
        <Button onClick={() => setAberto(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Adicionar usuário
        </Button>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar usuários por nome, e-mail, telefone ou função..."
        />
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="w-56">Função</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : usuariosFiltrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Nenhum usuário encontrado.</TableCell>
              </TableRow>
            ) : (
              usuariosFiltrados.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                  <TableCell>{mapaEmails.get(u.id) ?? "—"}</TableCell>
                  <TableCell>{u.telefone ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      {...(u.role ? { value: u.role } : {})}
                      onValueChange={(v) => alterar.mutate({ userId: u.id, role: v as AppRole })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sem função" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleLabels[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setItemParaExcluir(u.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
        title="Excluir usuário"
        description="Tem certeza que deseja excluir este usuário da empresa?"
        onConfirm={() => {
          if (itemParaExcluir) {
            excluir.mutate(itemParaExcluir);
          }
        }}
        isPending={excluir.isPending}
      />

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Senha</Label>
              <Input
                type="text"
                value={novo.senha}
                onChange={(e) => setNovo({ ...novo, senha: e.target.value })}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Select value={novo.role} onValueChange={(v) => setNovo({ ...novo, role: v as AppRole })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              disabled={criar.isPending || !novo.nome || !novo.email || novo.senha.length < 6}
              onClick={() => criar.mutate()}
            >
              {criar.isPending ? "Criando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
