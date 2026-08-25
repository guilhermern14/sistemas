import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, Search } from "lucide-react";
import { formatDateTime, formatMoney, statusBadgeClass, statusLabels, tipoLabels } from "@/lib/servico";
import type { Servico } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/a-cobrar")({
  head: () => ({
    meta: [
      { title: "A cobrar — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Serviços aguardando pagamento do cliente." },
    ],
  }),
  component: ACobrarPage,
});

function ACobrarPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const verValores = canSeeValues(role);
  const podePagar = role === "admin" || role === "atendente";
  const [busca, setBusca] = useState("");

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos-a-cobrar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("*, clientes(nome, telefone, endereco, numero, bairro, cidade)")
        .eq("status", "a_cobrar")
        .order("concluido_em", { ascending: false });
      if (error) throw error;
      return data as unknown as Servico[];
    },
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return servicos;
    return servicos.filter((s) =>
      `${s.numero_pedido ?? ""} ${s.clientes?.nome ?? ""} ${s.clientes?.telefone ?? ""} ${s.clientes?.cidade ?? ""} ${s.tipo ?? ""} ${s.relatorio ?? ""}`
        .toLowerCase()
        .includes(termo),
    );
  }, [servicos, busca]);

  const marcarPago = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("servicos")
        .update({ status: "pago", pago_em: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento baixado com sucesso");
      void qc.invalidateQueries({ queryKey: ["servicos-a-cobrar"] });
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível dar baixa no pagamento"),
  });

  const total = servicos.reduce((s, item) => s + Number(item.valor ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">A cobrar</h1>
          <p className="text-sm text-muted-foreground">Serviços enviados pelo atendente para cobrança. Use “Pago” quando o cliente quitar.</p>
        </div>
        {verValores && (
          <div className="surface-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total a cobrar</p>
            <p className="text-xl font-bold">{formatMoney(total)}</p>
          </div>
        )}
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por pedido, cliente, telefone ou serviço..." />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">Nenhum serviço aguardando pagamento.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtrados.map((s) => (
            <div key={s.id} className="surface-card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{s.clientes?.nome}</p>
                  <p className="text-xs font-medium text-primary">Pedido #{String(s.numero_pedido ?? 0).padStart(6, "0")}</p>
                  <p className="text-sm text-muted-foreground">{tipoLabels[s.tipo]} · concluído em {formatDateTime(s.concluido_em)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass[s.status]}`}>{statusLabels[s.status]}</span>
              </div>

              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Serviço: </span>{s.relatorio || "—"}</p>
                <p><span className="text-muted-foreground">Telefone: </span>{s.clientes?.telefone || "—"}</p>
                {verValores && <p className="text-base font-semibold"><span className="text-muted-foreground">Valor: </span>{formatMoney(s.valor)}</p>}
              </div>

              {podePagar && (
                <Button onClick={() => marcarPago.mutate(s.id)} disabled={marcarPago.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Pago / Dar baixa
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
