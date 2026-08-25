import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CircleDollarSign, FileDown, MapPin, Search } from "lucide-react";
import { ExecucaoDialog } from "@/components/ExecucaoDialog";
import { gerarOrcamentoPdf } from "@/lib/pdf-orcamento";
import {
  formatDateTime,
  formatMoney,
  statusBadgeClass,
  statusLabels,
  tipoLabels,
} from "@/lib/servico";
import { enderecoCompleto, mapsUrl, type Servico, type ServicoProduto } from "@/lib/types";


export const Route = createFileRoute("/_authenticated/prontos")({
  head: () => ({
    meta: [
      { title: "Serviços prontos — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Serviços concluídos pela equipe de rua e pós-venda com o cliente." },
      { property: "og:title", content: "Serviços prontos — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Serviços concluídos e pós-venda." },
    ],
  }),
  component: ProntosPage,
});

function ProntosPage() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const verValores = canSeeValues(role);
  const podePosVenda = role === "admin" || role === "atendente";
  const podePdf = role === "admin" || role === "atendente" || role === "financeiro";
  const ehCampo = role === "campo";

  const [alvo, setAlvo] = useState<Servico | null>(null);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<Servico | null>(null);
  const [busca, setBusca] = useState("");

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos-prontos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("*, clientes(nome, telefone, endereco, numero, bairro, cidade)")

        .eq("status", "pronto")
        .order("concluido_em", { ascending: false });
      if (error) throw error;
      return data as unknown as Servico[];
    },
  });

  const servicosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return servicos;
    return servicos.filter((s) =>
      `${s.clientes?.nome ?? ""} ${s.clientes?.telefone ?? ""} ${s.clientes?.cidade ?? ""} ${s.tipo ?? ""} ${s.status ?? ""} ${s.relatorio ?? ""} ${s.produtos_usados ?? ""}`
        .toLowerCase()
        .includes(termo),
    );
  }, [servicos, busca]);

  const baixarPdf = async (s: Servico) => {
    const toastId = toast.loading("Gerando PDF do orçamento...");
    try {
      const { data, error } = await supabase
        .from("servico_produtos")
        .select("*")
        .eq("servico_id", s.id);
      if (error) {
        toast.error("Não foi possível carregar os produtos do serviço", { id: toastId });
        return;
      }
      const { data: fotos, error: fotosError } = await supabase
        .from("servico_fotos")
        .select("*")
        .eq("servico_id", s.id)
        .order("created_at");
      if (fotosError) {
        toast.error("Não foi possível carregar as fotos do serviço", { id: toastId });
        return;
      }
      const ok = await gerarOrcamentoPdf(
        s,
        (data ?? []) as unknown as ServicoProduto[],
        (fotos ?? []) as never,
      );
      if (!ok) {
        toast.error("Não foi possível gerar o PDF", { id: toastId });
      } else {
        toast.success("PDF baixado com sucesso!", { id: toastId });
      }
    } catch {
      toast.error("Erro inesperado ao gerar o PDF", { id: toastId });
    }
  };


  const enviarParaCobranca = useMutation({
    mutationFn: async (servico: Servico) => {
      const { error } = await supabase
        .from("servicos")
        .update({ status: "a_cobrar" } as never)
        .eq("id", servico.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço enviado para A cobrar");
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["servicos-a-cobrar"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível enviar o serviço para cobrança"),
  });

  const salvarPosVenda = useMutation({
    mutationFn: async () => {
      if (!alvo) return;
      const { error } = await supabase
        .from("servicos")
        .update({
          pos_venda: texto,
          pos_venda_em: new Date().toISOString(),
          status: alvo.status === "pronto" ? "a_cobrar" : alvo.status,
        } as never)
        .eq("id", alvo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pós-venda registrado");
      setAlvo(null);
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
    },
    onError: () => toast.error("Não foi possível registrar o pós-venda"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Serviços prontos</h1>
        <p className="text-sm text-muted-foreground">
          O que a equipe de rua executou, com produtos usados e pós-venda.
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar serviços prontos por cliente, telefone, cidade ou serviço..."
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
                  <p className="text-xs font-medium text-primary">Pedido #{String(s.numero_pedido ?? 0).padStart(6, "0")}</p>
                  <p className="text-sm text-muted-foreground">
                    {tipoLabels[s.tipo]} · concluído em {formatDateTime(s.concluido_em)}
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

              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Serviço: </span>
                  {s.relatorio || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Produtos usados: </span>
                  {s.produtos_usados || "—"}
                </p>
                {s.pos_venda && (
                  <p>
                    <span className="text-muted-foreground">Pós-venda: </span>
                    {s.pos_venda}
                  </p>
                )}
                {verValores && (
                  <>
                    <p>
                      <span className="text-muted-foreground">Mão de obra: </span>
                      {Number(s.horas_mao_obra ?? 0)}h · {formatMoney(s.valor_mao_obra ?? 0)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Valor: </span>
                      {formatMoney(s.valor)}
                    </p>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {s.status === "pronto" &&
                  (role === "admin" || (ehCampo && s.tecnico_id === user?.id)) && (
                    <Button size="sm" variant="outline" onClick={() => setEditando(s)}>
                      Editar execução
                    </Button>
                  )}
                {podePdf && (
                  <Button size="sm" variant="outline" onClick={() => void baixarPdf(s)}>
                    <FileDown className="mr-2 h-4 w-4" /> Baixar PDF
                  </Button>
                )}
                {podePosVenda && (
                  <Button
                    size="sm"
                    onClick={() => enviarParaCobranca.mutate(s)}
                    disabled={enviarParaCobranca.isPending}
                  >
                    <CircleDollarSign className="mr-2 h-4 w-4" /> A cobrar
                  </Button>
                )}
                {podePosVenda && s.status !== "pago" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setAlvo(s);
                      setTexto(s.pos_venda ?? "");
                    }}
                  >
                    Registrar pós-venda
                  </Button>
                )}
              </div>


            </div>
          ))}
        </div>
      )}

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pós-venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Retorno do cliente</Label>
            <Textarea
              rows={4}
              placeholder="Cliente satisfeito, retornar em 30 dias..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => salvarPosVenda.mutate()} disabled={!texto || salvarPosVenda.isPending}>
              Salvar e enviar para cobrança
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExecucaoDialog servico={editando} onClose={() => setEditando(null)} verValores={verValores} />
    </div>

  );
}
