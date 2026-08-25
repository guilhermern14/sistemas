import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/lib/servico";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import type { Boleto } from "@/lib/types";

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Avisa admin/financeiro, ao entrar no sistema, sobre boletos que vencem hoje. */
export function BoletosHoje() {
  const { role } = useAuth();
  const habilitado = role === "admin" || role === "financeiro";
  const [aberto, setAberto] = useState(false);

  const { data: boletos = [] } = useQuery({
    queryKey: ["boletos-hoje", hojeISO()],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boletos")
        .select("*")
        .eq("pago", false)
        .lte("vencimento", hojeISO())
        .order("vencimento");
      if (error) throw error;
      return (data ?? []) as unknown as Boleto[];
    },
  });

  useEffect(() => {
    if (!habilitado || boletos.length === 0) return;
    const chave = `boletos-aviso-${hojeISO()}`;
    if (sessionStorage.getItem(chave)) return;
    sessionStorage.setItem(chave, "1");
    setAberto(true);
  }, [habilitado, boletos.length]);

  if (!habilitado || boletos.length === 0) return null;

  const total = boletos.reduce((s, b) => s + Number(b.valor), 0);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Boletos vencendo
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {boletos.length} boleto(s) em aberto vencendo hoje ou atrasados · total {formatMoney(total)}
        </p>
        <ul className="space-y-2">
          {boletos.map((b) => (
            <li key={b.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{b.fornecedor || "Fornecedor não informado"}</span>
                <span className="font-semibold">{formatMoney(Number(b.valor))}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {b.descricao || "Sem descrição"} · vence em{" "}
                {new Date(`${b.vencimento}T12:00:00`).toLocaleDateString("pt-BR")}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>
          <Button asChild onClick={() => setAberto(false)}>
            <Link to="/boletos">Ver boletos</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
