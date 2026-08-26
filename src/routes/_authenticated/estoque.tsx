import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canSeeValues } from "@/hooks/useAuth";
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
import { Edit, FileUp, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { formatMoney } from "@/lib/servico";
import { MARGEM_VENDA, parseNfe, type NotaXml } from "@/lib/xml-nfe";
import type { ProdutoEstoque } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Entrada de produtos por XML da nota fiscal, custo e preço de venda." },
      { property: "og:title", content: "Estoque — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Entrada de produtos por XML e controle de preços." },
    ],
  }),
  component: EstoquePage,
});

type BoletoForm = { vencimento: string; valor: string };

function BoletosCampos({
  boletos,
  setBoletos,
}: {
  boletos: BoletoForm[];
  setBoletos: (b: BoletoForm[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Boletos desta entrada</Label>
      {boletos.map((b, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            type="date"
            value={b.vencimento}
            onChange={(e) =>
              setBoletos(boletos.map((x, j) => (j === idx ? { ...x, vencimento: e.target.value } : x)))
            }
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor"
            value={b.valor}
            onChange={(e) =>
              setBoletos(boletos.map((x, j) => (j === idx ? { ...x, valor: e.target.value } : x)))
            }
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setBoletos(boletos.filter((_, j) => j !== idx))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setBoletos([...boletos, { vencimento: "", valor: "" }])}
      >
        <Plus className="mr-2 h-4 w-4" /> Adicionar boleto
      </Button>
    </div>
  );
}

function EstoquePage() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const podeEditar = role === "admin" || role === "atendente" || role === "financeiro";
  const verValores = canSeeValues(role);
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ProdutoEstoque | null>(null);
  const [form, setForm] = useState({
    codigo: "",
    produto: "",
    unidade: "un",
    quantidade: "0",
    valor_custo: "0",
    valor_venda: "0",
    observacoes: "",
  });
  const [boletosManual, setBoletosManual] = useState<BoletoForm[]>([]);
  const [fornecedorManual, setFornecedorManual] = useState("");

  const inputXml = useRef<HTMLInputElement>(null);
  const [nota, setNota] = useState<NotaXml | null>(null);
  const [boletosXml, setBoletosXml] = useState<BoletoForm[]>([]);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque").select("*").order("produto");
      if (error) throw error;
      return data as unknown as ProdutoEstoque[];
    },
  });

  const itensFiltrados = itens.filter((i) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return `${i.codigo ?? ""} ${i.produto ?? ""} ${i.unidade ?? ""} ${i.observacoes ?? ""}`.toLowerCase().includes(termo);
  });

  const salvarBoletos = async (
    lista: BoletoForm[],
    origem: string,
    fornecedor: string | null,
    descricao: string | null,
  ) => {
    const validos = lista.filter((b) => b.vencimento && Number(b.valor) > 0);
    if (validos.length === 0) return;
    const { error } = await supabase.from("boletos").insert(
      validos.map((b) => ({
        fornecedor,
        descricao,
        valor: Number(b.valor),
        vencimento: b.vencimento,
        origem,
        created_by: user?.id ?? null,
      })) as never,
    );
    if (error) throw error;
  };

  const criar = useMutation({
    mutationFn: async () => {
      const custo = Number(form.valor_custo || 0);
      const { error } = await supabase.from("estoque").insert({
        codigo: form.codigo || null,
        produto: form.produto,
        unidade: form.unidade || "un",
        quantidade: Number(form.quantidade || 0),
        valor_custo: custo,
        valor_venda: Number(form.valor_venda || 0),
        observacoes: form.observacoes || null,
      } as never);
      if (error) throw error;
      await salvarBoletos(boletosManual, "manual", fornecedorManual || null, form.produto);
    },
    onSuccess: () => {
      toast.success("Produto adicionado");
      setForm({
        codigo: "",
        produto: "",
        unidade: "un",
        quantidade: "0",
        valor_custo: "0",
        valor_venda: "0",
        observacoes: "",
      });
      setBoletosManual([]);
      setFornecedorManual("");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["estoque"] });
      void qc.invalidateQueries({ queryKey: ["boletos"] });
    },
    onError: () => toast.error("Não foi possível salvar o produto"),
  });

  const ajustar = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("estoque").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["estoque"] }),
    onError: () => toast.error("Não foi possível atualizar o produto"),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("estoque").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto excluído");
      void qc.invalidateQueries({ queryKey: ["estoque"] });
    },
    onError: () => toast.error("Não foi possível excluir o produto"),
  });

  const abrirEdicao = (i: ProdutoEstoque) => {
    setEditando(i);
    setForm({
      codigo: i.codigo ?? "",
      produto: i.produto,
      unidade: i.unidade,
      quantidade: String(i.quantidade),
      valor_custo: String(i.valor_custo),
      valor_venda: String(i.valor_venda),
      observacoes: i.observacoes ?? "",
    });
    setBoletosManual([]);
    setFornecedorManual("");
    setOpen(true);
  };

  const salvarEdicao = useMutation({
    mutationFn: async () => {
      if (!editando) return;
      const { error } = await supabase.from("estoque").update({
        codigo: form.codigo || null,
        produto: form.produto,
        unidade: form.unidade || "un",
        quantidade: Number(form.quantidade || 0),
        valor_custo: Number(form.valor_custo || 0),
        valor_venda: Number(form.valor_venda || 0),
        observacoes: form.observacoes || null,
      } as never).eq("id", editando.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto atualizado");
      setEditando(null);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["estoque"] });
    },
    onError: () => toast.error("Não foi possível atualizar o produto"),
  });

  const fecharProdutoDialog = (value: boolean) => {
    setOpen(value);
    if (!value) setEditando(null);
  };

  const importar = useMutation({
    mutationFn: async () => {
      if (!nota) return;
      const itensJson = nota.itens.map((i) => ({
        codigo: i.codigo || null,
        produto: i.produto,
        unidade: i.unidade,
        quantidade: i.quantidade,
        valor_custo: i.valor_custo,
        valor_venda: i.valor_venda,
      }));

      // Salva ou atualiza a nota fiscal e o estoque de forma unificada
      const { error: errRpc } = await supabase.rpc("importar_nota_fiscal", {
        p_tipo: "compra",
        p_data_emissao: nota.data_emissao,
        p_fornecedor: nota.fornecedor || nota.emitente || null,
        p_numero: nota.numero || null,
        p_serie: nota.serie || null,
        p_chave: nota.chave || null,
        p_valor_total: nota.valor_total,
        p_itens: itensJson,
        p_origem: "xml",
      } as never);

      if (errRpc) {
        // Fallback direto no estoque se a RPC falhar
        for (const item of nota.itens) {
          const existente = item.codigo
            ? itens.find((i) => i.codigo === item.codigo)
            : itens.find((i) => i.produto.toLowerCase() === item.produto.toLowerCase());

          if (existente) {
            const { error } = await supabase
              .from("estoque")
              .update({
                quantidade: Number(existente.quantidade) + item.quantidade,
                valor_custo: item.valor_custo,
                valor_venda: item.valor_venda,
                unidade: item.unidade,
              } as never)
              .eq("id", existente.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("estoque").insert({
              codigo: item.codigo || null,
              produto: item.produto,
              unidade: item.unidade,
              quantidade: item.quantidade,
              valor_custo: item.valor_custo,
              valor_venda: item.valor_venda,
            } as never);
            if (error) throw error;
          }
        }
      }

      const validosBoletos = boletosXml.filter((b) => b.vencimento && Number(b.valor) > 0);
      if (validosBoletos.length > 0) {
        await salvarBoletos(
          validosBoletos,
          "xml",
          nota.fornecedor || nota.emitente || null,
          `NF ${nota.numero || "S/N"} · Entrada XML`,
        );
      }
    },
    onSuccess: () => {
      toast.success("Estoque, nota fiscal e boletos atualizados com sucesso");
      setNota(null);
      setBoletosXml([]);
      void qc.invalidateQueries({ queryKey: ["estoque"] });
      void qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
      void qc.invalidateQueries({ queryKey: ["boletos"] });
      void qc.invalidateQueries({ queryKey: ["boletos-hoje"] });
    },
    onError: () => toast.error("Não foi possível importar a nota fiscal"),
  });

  const lerArquivo = async (file: File) => {
    try {
      const conteudo = await file.text();
      const lida = parseNfe(conteudo);
      if (lida.itens.length === 0) {
        toast.error("Nenhum produto encontrado no XML");
        return;
      }
      setNota(lida);
      setBoletosXml(
        lida.boletos.map((b) => ({ vencimento: b.vencimento, valor: String(b.valor) })),
      );
    } catch {
      toast.error("Não foi possível ler o XML");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Você pode adicionar produtos manualmente. As quantidades e preços das compras são atualizados automaticamente pela importação do XML na página Notas Fiscais.
          </p>
        </div>

        {podeEditar && (
          <div className="flex gap-2">
            <Dialog open={open} onOpenChange={fecharProdutoDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar produto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editando ? "Editar produto" : "Adicionar produto"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Produto</Label>
                    <Input value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.quantidade}
                      onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor de custo</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.valor_custo}
                      onChange={(e) => {
                        const custo = e.target.value;
                        setForm({
                          ...form,
                          valor_custo: custo,
                          valor_venda: (Number(custo || 0) * MARGEM_VENDA).toFixed(2),
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor de venda (sugerido +37%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.valor_venda}
                      onChange={(e) => setForm({ ...form, valor_venda: e.target.value })}
                    />
                  </div>
                  {!editando && <div className="space-y-2 sm:col-span-2">
                    <Label>Fornecedor (para os boletos)</Label>
                    <Input
                      value={fornecedorManual}
                      onChange={(e) => setFornecedorManual(e.target.value)}
                    />
                  </div>}
                  {!editando && <div className="sm:col-span-2">
                    <BoletosCampos boletos={boletosManual} setBoletos={setBoletosManual} />
                  </div>}
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
                    onClick={() => editando ? salvarEdicao.mutate() : criar.mutate()}
                    disabled={!form.produto || criar.isPending || salvarEdicao.isPending}
                  >
                    {editando ? "Salvar alterações" : "Salvar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Dialog
        open={!!nota}
        onOpenChange={(o) => {
          if (!o) {
            setNota(null);
            setBoletosXml([]);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Produtos encontrados no XML</DialogTitle>
          </DialogHeader>
          {nota?.fornecedor && (
            <p className="text-sm text-muted-foreground">Fornecedor: {nota.fornecedor}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Qtd</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>Venda (+37%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(nota?.itens ?? []).map((i, idx) => (
                <TableRow key={`${i.codigo}-${idx}`}>
                  <TableCell className="font-mono text-xs">{i.codigo || "—"}</TableCell>
                  <TableCell>{i.produto}</TableCell>
                  <TableCell>
                    {i.quantidade} {i.unidade}
                  </TableCell>
                  <TableCell>{formatMoney(i.valor_custo)}</TableCell>
                  <TableCell className="font-medium">{formatMoney(i.valor_venda)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <BoletosCampos boletos={boletosXml} setBoletos={setBoletosXml} />

          <DialogFooter>
            <Button onClick={() => importar.mutate()} disabled={importar.isPending}>
              Lançar no estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar estoque por código, produto, unidade ou observação..."
        />
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Quantidade</TableHead>
              {verValores && <TableHead>Custo</TableHead>}
              <TableHead>Venda</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : itensFiltrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">Nenhum produto encontrado para a pesquisa atual.</TableCell>
              </TableRow>
            ) : (
              itensFiltrados.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.codigo ?? "—"}</TableCell>
                  <TableCell className="font-medium">{i.produto}</TableCell>
                  <TableCell>{i.unidade}</TableCell>
                  <TableCell>
                    {podeEditar ? (
                      <Input
                        className="h-8 w-28"
                        type="number"
                        step="0.01"
                        defaultValue={i.quantidade}
                        onBlur={(e) =>
                          Number(e.target.value) !== Number(i.quantidade) &&
                          ajustar.mutate({ id: i.id, patch: { quantidade: Number(e.target.value) } })
                        }
                      />
                    ) : (
                      i.quantidade
                    )}
                  </TableCell>
                  {verValores && <TableCell>{formatMoney(i.valor_custo)}</TableCell>}
                  <TableCell className="font-medium">
                    {podeEditar ? (
                      <Input
                        className="h-8 w-28"
                        type="number"
                        step="0.01"
                        defaultValue={i.valor_venda}
                        onBlur={(e) =>
                          Number(e.target.value) !== Number(i.valor_venda) &&
                          ajustar.mutate({ id: i.id, patch: { valor_venda: Number(e.target.value) } })
                        }
                      />
                    ) : (
                      formatMoney(i.valor_venda)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {podeEditar && (
                        <Button size="icon" variant="ghost" title="Editar" onClick={() => abrirEdicao(i)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {role === "admin" && (
                        <Button
                          size="icon" variant="ghost" title="Excluir"
                          onClick={() => setItemParaExcluir(i.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
        title="Excluir produto"
        description="Tem certeza que deseja excluir este produto do estoque?"
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
