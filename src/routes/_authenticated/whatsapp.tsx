import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { TopicoWhatsapp } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Perguntas e respostas prontas para o atendimento no WhatsApp." },
      { property: "og:title", content: "WhatsApp — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Respostas prontas para copiar e enviar ao cliente." },
    ],
  }),
  component: WhatsappPage,
});

function WhatsappPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const [alvo, setAlvo] = useState<TopicoWhatsapp | null>(null);
  const [form, setForm] = useState({ pergunta: "", resposta: "", ordem: "0" });

  const { data: topicos = [], isLoading } = useQuery({
    queryKey: ["whatsapp-topicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_topicos")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data as unknown as TopicoWhatsapp[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        pergunta: form.pergunta,
        resposta: form.resposta,
        ordem: Number(form.ordem || 0),
      };
      if (alvo?.id) {
        const { error } = await supabase
          .from("whatsapp_topicos")
          .update(payload as never)
          .eq("id", alvo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_topicos").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Tópico salvo");
      setAlvo(null);
      void qc.invalidateQueries({ queryKey: ["whatsapp-topicos"] });
    },
    onError: () => toast.error("Não foi possível salvar o tópico"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_topicos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["whatsapp-topicos"] }),
    onError: () => toast.error("Não foi possível excluir o tópico"),
  });

  const abrir = (t: TopicoWhatsapp | null) => {
    setForm({
      pergunta: t?.pergunta ?? "",
      resposta: t?.resposta ?? "",
      ordem: String(t?.ordem ?? topicos.length),
    });
    setAlvo(t ?? ({ id: "", pergunta: "", resposta: "", ordem: topicos.length } as TopicoWhatsapp));
  };

  const copiar = async (texto: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(texto); toast.success("Resposta copiada"); return; } catch {}
    }
    try {
      const ta = document.createElement("textarea"); ta.value = texto; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.focus(); ta.select(); const ok = document.execCommand("copy"); document.body.removeChild(ta);
      if (ok) toast.success("Resposta copiada"); else throw 0;
    } catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Respostas prontas para as dúvidas mais comuns dos clientes.
          </p>
        </div>
        {ehAdmin && (
          <Button onClick={() => abrir(null)}>
            <Plus className="mr-2 h-4 w-4" /> Novo tópico
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : topicos.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          Nenhum tópico cadastrado.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {topicos.map((t) => (
            <div key={t.id} className="surface-card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{t.pergunta}</p>
                {ehAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" onClick={() => abrir(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remover.mutate(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.resposta}</p>
              <Button size="sm" variant="secondary" onClick={() => void copiar(t.resposta)}>
                <Copy className="mr-2 h-4 w-4" /> Copiar resposta
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{alvo?.id ? "Editar tópico" : "Novo tópico"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Pergunta</Label>
              <Input value={form.pergunta} onChange={(e) => setForm({ ...form, pergunta: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Resposta</Label>
              <Textarea
                rows={6}
                value={form.resposta}
                onChange={(e) => setForm({ ...form, resposta: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => salvar.mutate()}
              disabled={!form.pergunta || !form.resposta || salvar.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
