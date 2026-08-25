import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Search } from "lucide-react";
import { formatMoney } from "@/lib/servico";
import type { Boleto } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/boletos")({
  head: () => ({
    meta: [
      { title: "Boletos — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Boletos a pagar por vencimento, com filtros por dia, semana, mês e ano." },
      { property: "og:title", content: "Boletos — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Controle de boletos a pagar por vencimento." },
    ],
  }),
  component: BoletosPage,
});

const meses = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const hojeISO = () => new Date().toISOString().slice(0, 10);

function dataBR(d: string) {
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
}

function BoletosPage() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const permitido = role === "admin" || role === "financeiro";

  const agora = new Date();
  const [periodo, setPeriodo] = useState<"dia" | "semana" | "mes" | "ano" | "todos">("mes");
  const [mes, setMes] = useState(String(agora.getMonth()));
  const [ano, setAno] = useState(String(agora.getFullYear()));
  const [open, setOpen] = useState(false);
  const [novo, setNovo] = useState({ fornecedor: "", descricao: "", valor: "", vencimento: hojeISO() });
  const [busca, setBusca] = useState("");

  const { data: boletos = [], isLoading } = useQuery({
    queryKey: ["boletos"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boletos")
        .select("*")
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return data as unknown as Boleto[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("boletos").insert({
        fornecedor: novo.fornecedor || null,
        descricao: novo.descricao || null,
        valor: Number(novo.valor || 0),
        vencimento: novo.vencimento,
        origem: "manual",
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Boleto adicionado");
      setNovo({ fornecedor: "", descricao: "", valor: "", vencimento: hojeISO() });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["boletos"] });
    },
    onError: () => toast.error("Não foi possível salvar o boleto"),
  });

  const alternarPago = useMutation({
    mutationFn: async (b: Boleto) => {
      const { error } = await supabase
        .from("boletos")
        .update({ pago: !b.pago, pago_em: b.pago ? null : new Date().toISOString() } as never)
        .eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["boletos"] }),
    onError: () => toast.error("Não foi possível atualizar o boleto"),
  });

  // FUNÇÃO PARA EXCLUIR O BOLETO (COLE AQUI)
  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("boletos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Boleto excluído com sucesso");
      void qc.invalidateQueries({ queryKey: ["boletos"] });
    },
    onError: () => toast.error("Não foi possível excluir o boleto"),
  });

  const filtrados = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return boletos.filter((b) => {
      const [a, m, d] = b.vencimento.split("-").map(Number);
      const venc = new Date(a ?? 0, (m ?? 1) - 1, d ?? 1);
      const termo = busca.trim().toLowerCase();
      const correspondeBusca = !termo || `${b.fornecedor ?? ""} ${b.descricao ?? ""} ${b.origem ?? ""} ${b.vencimento ?? ""} ${b.valor ?? ""}`.toLowerCase().includes(termo);
      if (!correspondeBusca) return false;
      if (periodo === "todos") return true;
      if (periodo === "dia") return venc.getTime() === hoje.getTime();
      if (periodo === "semana") {
        const fim = new Date(hoje);
        fim.setDate(fim.getDate() + 7);
        return venc >= hoje && venc <= fim;
      }
      if (periodo === "mes") {
        return venc.getMonth() === Number(mes) && venc.getFullYear() === Number(ano);
      }
      return venc.getFullYear() === Number(ano);
    });
  }, [boletos, periodo, mes, ano, busca]);

  const vencendoHoje = boletos.filter((b) => !b.pago && b.vencimento === hojeISO());
  const totalHoje = vencendoHoje.reduce((s, b) => s + Number(b.valor), 0);
  const totalFiltrado = filtrados.filter((b) => !b.pago).reduce((s, b) => s + Number(b.valor), 0);

  const anos = Array.from({ length: 6 }, (_, i) => String(agora.getFullYear() - 2 + i));

  if (!permitido) {
    return <p className="text-sm text-muted-foreground">Você não tem acesso a esta área.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Boletos</h1>
          <p className="text-sm text-muted-foreground">
            Contas a pagar por vencimento, do mais próximo para o mais distante.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo boleto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar boleto</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input value={novo.fornecedor} onChange={(e) => setNovo({ ...novo, fornecedor: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input
                    type="date"
                    value={novo.vencimento}
                    onChange={(e) => setNovo({ ...novo, vencimento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={novo.valor}
                    onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => criar.mutate()} disabled={!novo.vencimento || criar.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Vencendo hoje</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{vencendoHoje.length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Valor de hoje</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{formatMoney(totalHoje)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Em aberto no filtro</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{formatMoney(totalFiltrado)}</p>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar boletos por fornecedor, descrição, vencimento ou valor..."
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>Período</Label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as typeof periodo)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">Hoje</SelectItem>
              <SelectItem value="semana">Próximos 7 dias</SelectItem>
              <SelectItem value="mes">Por mês</SelectItem>
              <SelectItem value="ano">Por ano</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {periodo === "mes" && (
          <div className="space-y-2">
            <Label>Mês</Label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {(periodo === "mes" || periodo === "ano") && (
          <div className="space-y-2">
            <Label>Ano</Label>
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Nenhum boleto encontrado para os filtros atuais.
        </div>
      ) : (
        <div className="surface-card divide-y">
          {filtrados.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{b.fornecedor || "Sem fornecedor"}</p>
                <p className="text-sm text-muted-foreground">
                  {b.descricao || "—"} · vence {dataBR(b.vencimento)}
                  {b.origem === "xml" ? " · XML" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold">{formatMoney(Number(b.valor))}</span>
                <Button
                    size="sm"
                    variant={b.pago ? "outline" : "default"}
                    onClick={() => alternarPago.mutate(b)}
                    disabled={alternarPago.isPending}
                  >
                    {b.pago ? "Estornar pagamento" : "Marcar como pago"}
                  </Button>

                  {/* BOTÃO VERMELHO DE EXCLUSÃO: Restrito apenas para ADMIN */}
                  {role === "admin" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja excluir permanentemente este boleto?")) {
                          remover.mutate(b.id);
                        }
                      }}
                      disabled={remover.isPending}
                    >
                      Excluir
                    </Button>
                  )}
              </div>
              
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
