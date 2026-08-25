import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Eye, FileUp, Plus, ReceiptText, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { formatMoney } from "@/lib/servico";
import { MARGEM_VENDA, parseNfe, type NotaXml } from "@/lib/xml-nfe";
import type { NotaFiscal, NotaFiscalItem, NotaFiscalTipo } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/notas-fiscais")({
  head: () => ({
    meta: [
      { title: "Notas Fiscais — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Controle de notas fiscais de compra e notas emitidas." },
    ],
  }),
  component: NotasFiscaisPage,
});

type ItemForm = {
  codigo: string;
  produto: string;
  unidade: string;
  quantidade: string;
  valor_custo: string;
  valor_venda: string;
};

const hoje = () => new Date().toISOString().slice(0, 10);

function novoItem(): ItemForm {
  return { codigo: "", produto: "", unidade: "un", quantidade: "1", valor_custo: "", valor_venda: "" };
}

function tipoLabel(tipo: NotaFiscalTipo) {
  return tipo === "compra" ? "Nota de compra" : "Nota emitida";
}

function NotasFiscaisPage() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const permitido = role === "admin" || role === "financeiro";
  const agora = new Date();

  const [periodo, setPeriodo] = useState<"mes" | "semana" | "dia" | "ano" | "todos">("mes");
  const [mes, setMes] = useState(String(agora.getMonth()));
  const [ano, setAno] = useState(String(agora.getFullYear()));
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | NotaFiscalTipo>("todos");
  const [openManual, setOpenManual] = useState(false);
  const [tipoManual, setTipoManual] = useState<NotaFiscalTipo>("compra");
  const [tipoImportacao, setTipoImportacao] = useState<NotaFiscalTipo>("compra");
  const [notaXml, setNotaXml] = useState<NotaXml | null>(null);
  const [openXml, setOpenXml] = useState(false);
  const [detalhes, setDetalhes] = useState<NotaFiscal | null>(null);
  const [itensDetalhes, setItensDetalhes] = useState<NotaFiscalItem[]>([]);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);
  const inputXml = useRef<HTMLInputElement>(null);

  const [manual, setManual] = useState({
    data_emissao: hoje(),
    fornecedor: "",
    numero: "",
    serie: "",
    valor_total: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);

  const { data: notas = [], isLoading } = useQuery({
    queryKey: ["notas-fiscais"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("*")
        .order("data_emissao", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as NotaFiscal[];
    },
  });

  const excluirNota = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notas_fiscais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota fiscal excluída com sucesso");
      setItemParaExcluir(null);
      void qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
      void qc.invalidateQueries({ queryKey: ["estoque"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível excluir a nota fiscal."),
  });

  const filtradas = useMemo(() => {
    const hojeDate = new Date();
    hojeDate.setHours(0, 0, 0, 0);

    return notas.filter((n) => {
      if (tipoFiltro !== "todos" && n.tipo !== tipoFiltro) return false;
      const [y, m, d] = n.data_emissao.split("-").map(Number);
      const data = new Date(y || 0, (m || 1) - 1, d || 1);
      data.setHours(0, 0, 0, 0);

      if (periodo === "todos") return true;
      if (periodo === "dia") return data.getTime() === hojeDate.getTime();
      if (periodo === "ano") return y === Number(ano);
      if (periodo === "mes") return y === Number(ano) && (m - 1) === Number(mes);

      const inicioSemana = new Date(hojeDate);
      const diaSemana = inicioSemana.getDay();
      inicioSemana.setDate(inicioSemana.getDate() - diaSemana);
      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(fimSemana.getDate() + 6);
      return data >= inicioSemana && data <= fimSemana;
    });
  }, [notas, periodo, mes, ano, tipoFiltro]);

  const totalCompras = filtradas.filter((n) => n.tipo === "compra").reduce((s, n) => s + Number(n.valor_total), 0);
  const totalEmitidas = filtradas.filter((n) => n.tipo === "emitida").reduce((s, n) => s + Number(n.valor_total), 0);

  const importarNota = useMutation({
    mutationFn: async ({ nota, tipo }: { nota: NotaXml; tipo: NotaFiscalTipo }) => {
      const itensJson = nota.itens.map((i) => ({
        codigo: i.codigo || null,
        produto: i.produto,
        unidade: i.unidade,
        quantidade: i.quantidade,
        valor_custo: i.valor_custo,
        valor_venda: i.valor_venda,
      }));

      const { data, error } = await supabase.rpc("importar_nota_fiscal", {
        p_tipo: tipo,
        p_data_emissao: nota.data_emissao,
        p_fornecedor: tipo === "compra" ? nota.emitente : nota.destinatario,
        p_numero: nota.numero || null,
        p_serie: nota.serie || null,
        p_chave: nota.chave || null,
        p_valor_total: nota.valor_total,
        p_itens: itensJson,
        p_origem: "xml",
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.tipo === "compra" ? "Nota de compra importada e estoque atualizado." : "Nota emitida cadastrada.");
      setNotaXml(null);
      setOpenXml(false);
      void qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
      void qc.invalidateQueries({ queryKey: ["estoque"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível importar a nota."),
  });

  const salvarManual = useMutation({
    mutationFn: async () => {
      const itensValidos = tipoManual === "compra"
        ? itens
            .filter((i) => i.produto.trim() && Number(i.quantidade) > 0)
            .map((i) => ({
              codigo: i.codigo || null,
              produto: i.produto.trim(),
              unidade: i.unidade || "un",
              quantidade: Number(i.quantidade),
              valor_custo: Number(i.valor_custo || 0),
              valor_venda: Number(i.valor_venda || (Number(i.valor_custo || 0) * MARGEM_VENDA).toFixed(2)),
            }))
        : [];

      const valorTotal = Number(manual.valor_total || 0);
      const { data, error } = await supabase.rpc("importar_nota_fiscal", {
        p_tipo: tipoManual,
        p_data_emissao: manual.data_emissao,
        p_fornecedor: manual.fornecedor || null,
        p_numero: manual.numero || null,
        p_serie: manual.serie || null,
        p_chave: null,
        p_valor_total: valorTotal,
        p_itens: itensValidos,
        p_origem: "manual",
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success(tipoManual === "compra" ? "Nota cadastrada e estoque atualizado." : "Nota emitida cadastrada.");
      setOpenManual(false);
      setManual({ data_emissao: hoje(), fornecedor: "", numero: "", serie: "", valor_total: "" });
      setItens([novoItem()]);
      void qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
      void qc.invalidateQueries({ queryKey: ["estoque"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar a nota."),
  });

  const lerXml = async (file: File) => {
    try {
      const lida = parseNfe(await file.text());
      if (!lida.numero && !lida.chave) {
        toast.error("O XML não contém número ou chave da NF-e.");
        return;
      }
      setNotaXml(lida);
      setOpenXml(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o XML.");
    }
  };

  const abrirDetalhes = async (nota: NotaFiscal) => {
    const { data, error } = await supabase
      .from("notas_fiscais_itens")
      .select("*")
      .eq("nota_fiscal_id", nota.id)
      .order("produto");
    if (error) {
      toast.error("Não foi possível carregar os itens.");
      return;
    }
    setDetalhes(nota);
    setItensDetalhes((data ?? []) as unknown as NotaFiscalItem[]);
  };

  const alterarItem = (idx: number, campo: keyof ItemForm, valor: string) => {
    setItens((lista) => lista.map((item, i) => {
      if (i !== idx) return item;
      const novo = { ...item, [campo]: valor };
      if (campo === "valor_custo") {
        novo.valor_venda = (Number(valor || 0) * MARGEM_VENDA).toFixed(2);
      }
      return novo;
    }));
  };

  if (!permitido) {
    return <div className="space-y-2"><h1 className="text-2xl font-semibold">Notas Fiscais</h1><p className="text-sm text-muted-foreground">Acesso permitido somente para administrador e financeiro.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notas Fiscais</h1>
          <p className="text-sm text-muted-foreground">Compras alimentam o estoque automaticamente. Notas emitidas ficam apenas no histórico.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={tipoImportacao} onValueChange={(v) => setTipoImportacao(v as NotaFiscalTipo)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compra">Importar compra</SelectItem>
              <SelectItem value="emitida">Importar emitida</SelectItem>
            </SelectContent>
          </Select>
          <input
            ref={inputXml}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lerXml(f);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => inputXml.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" /> Importar XML
          </Button>

          <Dialog open={openManual} onOpenChange={setOpenManual}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Adicionar manualmente</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader><DialogTitle>Adicionar nota fiscal manualmente</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={tipoManual} onValueChange={(v) => setTipoManual(v as NotaFiscalTipo)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compra">Nota de compra</SelectItem>
                      <SelectItem value="emitida">Nota emitida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Data</Label><Input type="date" value={manual.data_emissao} onChange={(e) => setManual({ ...manual, data_emissao: e.target.value })} /></div>
                <div className="space-y-2"><Label>Fornecedor / cliente</Label><Input value={manual.fornecedor} onChange={(e) => setManual({ ...manual, fornecedor: e.target.value })} /></div>
                <div className="space-y-2"><Label>Número</Label><Input value={manual.numero} onChange={(e) => setManual({ ...manual, numero: e.target.value })} /></div>
                <div className="space-y-2"><Label>Série</Label><Input value={manual.serie} onChange={(e) => setManual({ ...manual, serie: e.target.value })} /></div>
                <div className="space-y-2"><Label>Valor total</Label><Input type="number" step="0.01" min="0" value={manual.valor_total} onChange={(e) => setManual({ ...manual, valor_total: e.target.value })} /></div>
              </div>

              {tipoManual === "compra" && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between"><Label>Produtos da compra</Label><Button type="button" size="sm" variant="outline" onClick={() => setItens([...itens, novoItem()])}><Plus className="mr-1 h-4 w-4" /> Produto</Button></div>
                  {itens.map((item, idx) => (
                    <div key={idx} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
                      <Input placeholder="Código" value={item.codigo} onChange={(e) => alterarItem(idx, "codigo", e.target.value)} />
                      <Input className="sm:col-span-2" placeholder="Produto" value={item.produto} onChange={(e) => alterarItem(idx, "produto", e.target.value)} />
                      <Input placeholder="Unidade" value={item.unidade} onChange={(e) => alterarItem(idx, "unidade", e.target.value)} />
                      <Input type="number" step="0.001" min="0" placeholder="Qtd" value={item.quantidade} onChange={(e) => alterarItem(idx, "quantidade", e.target.value)} />
                      <div className="flex gap-2">
                        <Input type="number" step="0.0001" min="0" placeholder="Custo" value={item.valor_custo} onChange={(e) => alterarItem(idx, "valor_custo", e.target.value)} />
                        {itens.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => setItens(itens.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Ao salvar, produtos com o mesmo código (ou mesmo nome quando não houver código) recebem a nova quantidade no estoque. O custo passa a ser o custo da compra mais recente.</p>
                </div>
              )}

              <DialogFooter>
                <Button onClick={() => salvarManual.mutate()} disabled={salvarManual.isPending || !manual.data_emissao || !manual.valor_total}>
                  {salvarManual.isPending ? "Salvando..." : "Salvar nota"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="surface-card border-l-4 p-5">
          <p className="text-sm text-muted-foreground">Total de compras</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(totalCompras)}</p>
        </div>
        <div className="surface-card border-l-4 p-5">
          <p className="text-sm text-muted-foreground">Total de notas emitidas</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(totalEmitidas)}</p>
        </div>
      </div>

      <div className="surface-card flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1"><Label>Período</Label><Select value={periodo} onValueChange={(v) => setPeriodo(v as typeof periodo)}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mes">Mês</SelectItem><SelectItem value="semana">Semana</SelectItem><SelectItem value="dia">Dia</SelectItem><SelectItem value="ano">Ano</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent></Select></div>
        {periodo === "mes" && <div className="space-y-1"><Label>Mês</Label><Select value={mes} onValueChange={setMes}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}</SelectContent></Select></div>}
        {(periodo === "mes" || periodo === "ano") && <div className="space-y-1"><Label>Ano</Label><Input className="w-[110px]" type="number" value={ano} onChange={(e) => setAno(e.target.value)} /></div>}
        <div className="space-y-1"><Label>Tipo</Label><Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as "todos" | NotaFiscalTipo)}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem><SelectItem value="compra">Compras</SelectItem><SelectItem value="emitida">Emitidas</SelectItem></SelectContent></Select></div>
        <div className="ml-auto text-sm text-muted-foreground">Exibindo {filtradas.length} nota(s)</div>
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Data</TableHead><TableHead>Fornecedor / cliente</TableHead><TableHead>Número</TableHead><TableHead>Valor</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7}>Carregando...</TableCell></TableRow> :
              filtradas.length === 0 ? <TableRow><TableCell colSpan={7} className="text-muted-foreground">Nenhuma nota encontrada para os filtros.</TableCell></TableRow> :
              filtradas.map((n) => (
                <TableRow key={n.id}>
                  <TableCell><span className="inline-flex items-center gap-1"><ReceiptText className="h-4 w-4" />{tipoLabel(n.tipo)}</span></TableCell>
                  <TableCell>{n.data_emissao.split("-").reverse().join("/")}</TableCell>
                  <TableCell className="font-medium">{n.fornecedor || "—"}</TableCell>
                  <TableCell>{n.numero || "—"}{n.serie ? ` / ${n.serie}` : ""}</TableCell>
                  <TableCell className="font-medium">{formatMoney(Number(n.valor_total))}</TableCell>
                  <TableCell>{n.origem === "xml" ? "XML" : "Manual"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => void abrirDetalhes(n)} title="Ver produtos">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setItemParaExcluir(n.id)}
                        disabled={excluirNota.isPending}
                        title="Excluir nota fiscal"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>

      <ConfirmDeleteDialog
        open={!!itemParaExcluir}
        onOpenChange={(o) => !o && setItemParaExcluir(null)}
        title="Excluir nota fiscal"
        description="Tem certeza que deseja excluir esta nota fiscal? Os itens vinculados também serão removidos."
        onConfirm={() => {
          if (itemParaExcluir) {
            excluirNota.mutate(itemParaExcluir);
          }
        }}
        isPending={excluirNota.isPending}
      />

      <Dialog open={openXml} onOpenChange={setOpenXml}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Conferir nota antes de importar</DialogTitle></DialogHeader>
          {notaXml && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> {tipoLabel(tipoImportacao)}</div>
                <div><span className="text-muted-foreground">Número:</span> {notaXml.numero || "—"}</div>
                <div><span className="text-muted-foreground">Data:</span> {notaXml.data_emissao.split("-").reverse().join("/")}</div>
                <div><span className="text-muted-foreground">Valor:</span> {formatMoney(notaXml.valor_total)}</div>
              </div>
              <p className="text-sm"><span className="text-muted-foreground">{tipoImportacao === "compra" ? "Fornecedor" : "Cliente"}:</span> {tipoImportacao === "compra" ? notaXml.emitente : notaXml.destinatario || "—"}</p>
              <Table>
                <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead>Custo</TableHead><TableHead>Venda</TableHead></TableRow></TableHeader>
                <TableBody>{notaXml.itens.map((i, idx) => <TableRow key={`${i.codigo}-${idx}`}><TableCell>{i.codigo || "—"}</TableCell><TableCell>{i.produto}</TableCell><TableCell>{i.quantidade} {i.unidade}</TableCell><TableCell>{formatMoney(i.valor_custo)}</TableCell><TableCell>{formatMoney(i.valor_venda)}</TableCell></TableRow>)}</TableBody>
              </Table>
              {tipoImportacao === "compra" && <p className="text-sm text-muted-foreground">Esta importação vai somar as quantidades ao estoque. Produtos já existentes não serão duplicados.</p>}
            </div>
          )}
          <DialogFooter><Button onClick={() => notaXml && importarNota.mutate({ nota: notaXml, tipo: tipoImportacao })} disabled={!notaXml || importarNota.isPending}>{importarNota.isPending ? "Importando..." : tipoImportacao === "compra" ? "Importar e atualizar estoque" : "Cadastrar nota emitida"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalhes} onOpenChange={(v) => { if (!v) setDetalhes(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{detalhes ? `Produtos — NF ${detalhes.numero || "sem número"}` : "Produtos"}</DialogTitle></DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Qtd</TableHead><TableHead>Custo</TableHead><TableHead>Venda</TableHead></TableRow></TableHeader>
            <TableBody>{itensDetalhes.length === 0 ? <TableRow><TableCell colSpan={5} className="text-muted-foreground">Esta nota não possui produtos cadastrados.</TableCell></TableRow> : itensDetalhes.map((i) => <TableRow key={i.id}><TableCell>{i.codigo || "—"}</TableCell><TableCell>{i.produto}</TableCell><TableCell>{i.quantidade} {i.unidade}</TableCell><TableCell>{formatMoney(Number(i.valor_custo))}</TableCell><TableCell>{formatMoney(Number(i.valor_venda))}</TableCell></TableRow>)}</TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
