import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { BellRing, CheckCircle2, MessageCircle, Phone, Calendar, ArrowRight, X } from "lucide-react";
import type { Aviso } from "@/lib/types";
import { deveAparecerNaTelaInicial, getUrgenciaAviso, formatarDataBR, getHojeISO } from "@/lib/avisos";
import { toast } from "sonner";

export function AvisosEntradaDialog() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);

  const { data: todosAvisos = [], refetch } = useQuery({
    queryKey: ["avisos-entrada"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("*, rel_clientes:clientes(id, nome, telefone, cidade, bairro)")
        .order("data_aviso", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Aviso[];
    },
    refetchInterval: 15000,
  });

  // Filtra apenas os que devem aparecer (pendentes + data <= amanhã)
  const avisosAtivos = todosAvisos.filter(deveAparecerNaTelaInicial);

  useEffect(() => {
    let isMounted = true;
    if (avisosAtivos.length === 0) return;

    try {
      // Abre ao entrar no sistema na sessão atual (ou se reaberto pelo usuário)
      const chaveSessao = `avisos-entrada-visto-${getHojeISO()}`;
      if (typeof window !== "undefined" && window.sessionStorage) {
        if (!window.sessionStorage.getItem(chaveSessao)) {
          window.sessionStorage.setItem(chaveSessao, "1");
          if (isMounted) {
            setAberto(true);
          }
        }
      }
    } catch {
      // Ignora erro se sessionStorage estiver bloqueado
    }

    return () => {
      isMounted = false;
    };
  }, [avisosAtivos.length]);

  const resolverMutation = useMutation({
    mutationFn: async (avisoId: string) => {
      setResolvendoId(avisoId);
      const agora = new Date().toISOString();
      const { error } = await supabase
        .from("avisos")
        .update({
          status: "resolvido",
          resolvido_em: agora,
        })
        .eq("id", avisoId);
      if (error) throw error;
      return avisoId;
    },
    onSuccess: (id) => {
      toast.success("Aviso marcado como resolvido!");
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["avisos-entrada"] });
      qc.invalidateQueries({ queryKey: ["avisos-dashboard"] });
      setResolvendoId(null);
      // Se não restarem mais avisos, fecha o dialog
      if (avisosAtivos.length <= 1) {
        setAberto(false);
      }
    },
    onError: (err: any) => {
      toast.error(`Erro ao resolver aviso: ${err.message || err}`);
      setResolvendoId(null);
    },
  });

  if (avisosAtivos.length === 0 && !aberto) return null;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-xs">
              <BellRing className="h-6 w-6 animate-bounce" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <span>Avisos e Lembretes Importantes</span>
                <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-300">
                  {avisosAtivos.length} {avisosAtivos.length === 1 ? "aviso ativo" : "avisos ativos"}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Estes lembretes estão agendados para hoje, amanhã ou estão pendentes de dias anteriores.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {avisosAtivos.length === 0 ? (
          <div className="py-8 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <p className="font-medium text-slate-700">Tudo limpo! Não há avisos pendentes para hoje ou amanhã.</p>
          </div>
        ) : (
          <div className="space-y-3.5 my-3">
            {avisosAtivos.map((aviso) => {
              const urg = getUrgenciaAviso(aviso);
              const cliente = aviso.rel_clientes || aviso.clientes;
              const telLimpo = cliente?.telefone?.replace(/\D/g, "");

              return (
                <div
                  key={aviso.id}
                  className={`rounded-xl border p-4 transition-all ${urg.cardBorderClass}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border ${urg.badgeClass}`}>
                        {urg.label}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Data: <strong className="text-slate-700">{formatarDataBR(aviso.data_aviso)}</strong>
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolvendoId === aviso.id}
                      onClick={() => resolverMutation.mutate(aviso.id)}
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white border-none text-xs font-medium cursor-pointer shadow-xs gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {resolvendoId === aviso.id ? "Resolvendo..." : "Marcar como Resolvido"}
                    </Button>
                  </div>

                  {aviso.titulo && (
                    <h4 className="font-semibold text-sm text-slate-900 mb-1">
                      {aviso.titulo}
                    </h4>
                  )}

                  {/* Caixa do conteúdo do aviso */}
                  <div className="bg-white/90 border border-slate-200/80 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-line leading-relaxed shadow-2xs">
                    {aviso.mensagem}
                  </div>

                  {/* Informações do cliente relacionado */}
                  {cliente ? (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="text-slate-600">
                        <span className="text-slate-400">Cliente:</span>{" "}
                        <strong className="text-slate-800">{cliente.nome}</strong>
                        {cliente.cidade && <span className="text-slate-500"> ({cliente.cidade})</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        {cliente.telefone && (
                          <>
                            <a
                              href={`tel:${telLimpo}`}
                              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded text-[11px]"
                            >
                              <Phone className="w-3 h-3 text-slate-500" />
                              {cliente.telefone}
                            </a>
                            <a
                              href={`https://wa.me/55${telLimpo}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium"
                            >
                              <MessageCircle className="w-3 h-3 text-emerald-600" />
                              WhatsApp
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-400">
                      Aviso geral da empresa (sem cliente vinculado)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <Button
            asChild
            variant="ghost"
            size="sm"
            onClick={() => setAberto(false)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            <Link to="/avisos">
              Ver todos os avisos <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAberto(false)}
            className="text-xs"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
