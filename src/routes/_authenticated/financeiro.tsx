import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDateTime, formatMoney, statusBadgeClass, statusLabels, tipoLabels } from "@/lib/servico";
import { Search } from "lucide-react";
import type { Servico } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Cobrança dos serviços executados, valores e baixa de pagamento." },
      { property: "og:title", content: "Financeiro — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Cobrança, valores e baixa de pagamento." },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<Servico | null>(null);
  const [desconto, setDesconto] = useState("0");
  const [busca, setBusca] = useState("");

  const { data: servicos = [], isLoading } = useQuery({
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

  const servicosFiltrados = servicos.filter((s) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return `${s.clientes?.nome ?? ""} ${s.clientes?.telefone ?? ""} ${s.clientes?.cidade ?? ""} ${s.tipo ?? ""} ${s.status ?? ""} ${s.relatorio ?? ""} ${s.produtos_usados ?? ""}`
      .toLowerCase()
      .includes(termo);
  });

  const salvar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("servicos").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setAlvo(null);
      void qc.invalidateQueries({ queryKey: ["financeiro-servicos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
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

  const aReceber = servicos
    .filter((s) => s.status !== "pago")
    .reduce((a, s) => a + Number(s.valor ?? 0), 0);
  const recebido = servicos
    .filter((s) => s.status === "pago")
    .reduce((a, s) => a + Number(s.valor ?? 0), 0);

  // Calcula o custo com base no total bruto menos a mão de obra dos serviços pagos
  const custoProdutos = servicos
    .filter((s) => s.status === "pago")
    .reduce((a, s) => a + (Number(s.valor_bruto ?? 0) - Number(s.valor_mao_obra ?? 0)), 0);

  // Lucro líquido real (Recebido total menos o custo das peças)
  const lucroEfetivo = Math.max(recebido - custoProdutos, 0);
  
  // Dízimo de 10% calculado estritamente sobre o lucro
  const dizimo = lucroEfetivo * 0.10;

  const bruto = Number(alvo?.valor_bruto ?? 0);
  const totalComDesconto = Math.max(bruto - Number(desconto || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Serviços executados, materiais usados e situação da cobrança.
        </p>
      </div>

      {/* Grid atualizada com os 5 indicadores financeiros */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="surface-card p-4">
          <p className="text-xs font-medium text-muted-foreground">A receber</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-warning-foreground">{formatMoney(aReceber)}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Recebido</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-success-foreground">{formatMoney(recebido)}</p>
        </div>
        {/* <div className="surface-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Custo dos Produtos</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-destructive">{formatMoney(custoProdutos)}</p>
        </div>
        <div className="surface-card p-4 border-l-4 border-primary">
          <p className="text-xs font-medium text-muted-foreground">Lucro Real</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-primary">{formatMoney(lucroEfetivo)}</p>
        </div>
        <div className="surface-card p-4 bg-primary/5 border-l-4 border-emerald-500">
          <p className="text-xs font-medium text-emerald-600 font-semibold">Dízimo (10%)</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-emerald-600">{formatMoney(dizimo)}</p>
        </div> */}
      </div>
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar no financeiro por cliente, telefone, cidade ou serviço..."
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : servicosFiltrados.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Nenhum serviço encontrado para a pesquisa atual.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {servicosFiltrados.map((s) => (
            <div key={s.id} className="surface-card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{s.clientes?.nome}</p>
                  <p className="text-sm text-muted-foreground">
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

                {/* Exibe o resumo de Custos e Lucro individuais apenas se o serviço já estiver PAGO */}
                {s.status === "pago" && (() => {
                  const custoItem = Number(s.valor_bruto ?? 0) - Number(s.valor_mao_obra ?? 0);
                  const lucroItem = Math.max(Number(s.valor ?? 0) - custoItem, 0);
                  const dizimoItem = lucroItem * 0.10;

                  return (
                    <div className="mt-2 border-t pt-2 grid grid-cols-3 gap-2 text-[11px] font-medium bg-muted/30 p-2 rounded">
                      <div>
                        <span className="block text-muted-foreground">Custo mat:</span>
                        <span className="text-destructive">{formatMoney(custoItem)}</span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground">Lucro:</span>
                        <span className="text-primary">{formatMoney(lucroItem)}</span>
                      </div>
                      <div>
                        <span className="block text-emerald-600">Dízimo:</span>
                        <span className="text-emerald-600">{formatMoney(dizimoItem)}</span>
                      </div>
                    </div>
                  );
                })()}

                {s.pago_em && (
                  <p className="text-muted-foreground">Pago em {formatDateTime(s.pago_em)}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
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
                  onClick={() => {
                    if (confirm("Tem certeza que deseja excluir permanentemente este serviço?")) {
                      remover.mutate(s.id);
                    }
                  }}
                  disabled={remover.isPending}
                >
                  Excluir serviço
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valor do serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produtos</span>
              <span>{formatMoney(bruto - Number(alvo?.valor_mao_obra ?? 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Mão de obra ({Number(alvo?.horas_mao_obra ?? 0)}h)
              </span>
              <span>{formatMoney(alvo?.valor_mao_obra ?? 0)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Total calculado</span>
              <span>{formatMoney(bruto)}</span>
            </div>
            <div className="space-y-2">
              <Label>Desconto (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
              />
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Valor a cobrar</span>
              <span>{formatMoney(totalComDesconto)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                alvo &&
                salvar.mutate({
                  id: alvo.id,
                  patch: {
                    desconto: Number(desconto || 0),
                    valor: totalComDesconto,
                    status: alvo.status === "pronto" ? "a_cobrar" : alvo.status,
                  },
                })
              }
              disabled={salvar.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
