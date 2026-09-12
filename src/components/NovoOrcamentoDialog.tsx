import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Search, Plus, Trash2, Calculator, PackagePlus, Pencil, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/servico";
import { calcMaoObra } from "@/lib/empresa";
import { useAuth } from "@/hooks/useAuth";
import type { ClienteResumo, ProdutoEstoque, Orcamento, OrcamentoItem } from "@/lib/types";

export type OrcamentoItemForm = {
  estoque_id: string | null;
  codigo: string | null;
  produto: string;
  unidade: string;
  quantidade: number;
  valor_custo: number;
  valor_venda: number;
};

export function NovoOrcamentoDialog({
  open,
  onClose,
  onSuccess,
  orcamentoParaEditar = null,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  orcamentoParaEditar?: Orcamento | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!orcamentoParaEditar;

  const [clienteId, setClienteId] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [dataOrcamento, setDataOrcamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [validadeDias, setValidadeDias] = useState("15");
  const [descricao, setDescricao] = useState("");
  const [formaPagamento, setFormaPagamento] = useState(
    "À vista no PIX com 5% de desconto ou até 3x no cartão sem juros",
  );
  const [observacoes, setObservacoes] = useState(
    "Garantia de 1 ano para equipamentos e 90 dias para instalação técnica.",
  );

  // Itens do orçamento
  const [itens, setItens] = useState<OrcamentoItemForm[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");

  // Item avulso
  const [showItemAvulso, setShowItemAvulso] = useState(false);
  const [avulsoNome, setAvulsoNome] = useState("");
  const [avulsoQtd, setAvulsoQtd] = useState("1");
  const [avulsoPreco, setAvulsoPreco] = useState("");

  // Mão de obra e despesas
  const [horas, setHoras] = useState("4");
  const [valorMaoObra, setValorMaoObra] = useState(() => String(calcMaoObra(4)));
  const [maoObraManual, setMaoObraManual] = useState(false);
  const [custoAdicional, setCustoAdicional] = useState("");
  const [descCustoAdicional, setDescCustoAdicional] = useState("Deslocamento técnico");
  const [incluirCustoNoTotal, setIncluirCustoNoTotal] = useState(true);
  const [desconto, setDesconto] = useState("");

  // Buscar itens já gravados caso estejamos em modo de edição
  const { data: itensExistentes, isLoading: carregandoItens } = useQuery({
    queryKey: ["orcamento-itens-editar", orcamentoParaEditar?.id],
    queryFn: async () => {
      if (!orcamentoParaEditar?.id) return [];
      const { data, error } = await supabase
        .from("orcamento_itens")
        .select("*")
        .eq("orcamento_id", orcamentoParaEditar.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as OrcamentoItem[];
    },
    enabled: open && !!orcamentoParaEditar?.id,
  });

  // Atualizar/Inicializar o formulário conforme abertura para novo ou edição
  useEffect(() => {
    if (!open) return;

    if (orcamentoParaEditar) {
      setClienteId(orcamentoParaEditar.cliente_id || "");
      setDataOrcamento(
        orcamentoParaEditar.data ||
          orcamentoParaEditar.created_at?.slice(0, 10) ||
          new Date().toISOString().slice(0, 10),
      );
      setValidadeDias(String(orcamentoParaEditar.validade_dias || 15));
      setDescricao(orcamentoParaEditar.descricao || "");
      setFormaPagamento(
        orcamentoParaEditar.forma_pagamento ||
          "À vista no PIX com 5% de desconto ou até 3x no cartão sem juros",
      );
      setObservacoes(
        orcamentoParaEditar.observacoes ||
          "Garantia de 1 ano para equipamentos e 90 dias para instalação técnica.",
      );
      setHoras(String(orcamentoParaEditar.horas_mao_obra ?? 0));
      setValorMaoObra(String(orcamentoParaEditar.valor_mao_obra ?? 0));
      setMaoObraManual(true);
      setCustoAdicional(
        orcamentoParaEditar.custo_adicional ? String(orcamentoParaEditar.custo_adicional) : "",
      );
      setDescCustoAdicional(
        orcamentoParaEditar.descricao_custo_adicional || "Deslocamento técnico",
      );
      setIncluirCustoNoTotal(Boolean(orcamentoParaEditar.incluir_custo_no_total ?? true));
      setDesconto(orcamentoParaEditar.desconto ? String(orcamentoParaEditar.desconto) : "");
      setBuscaCliente("");
      setBuscaProduto("");
      setShowItemAvulso(false);
    } else {
      setClienteId("");
      setDataOrcamento(new Date().toISOString().slice(0, 10));
      setValidadeDias("15");
      setDescricao("");
      setFormaPagamento("À vista no PIX com 5% de desconto ou até 3x no cartão sem juros");
      setObservacoes("Garantia de 1 ano para equipamentos e 90 dias para instalação técnica.");
      setItens([]);
      setBuscaCliente("");
      setBuscaProduto("");
      setShowItemAvulso(false);
      setHoras("4");
      setValorMaoObra(String(calcMaoObra(4)));
      setMaoObraManual(false);
      setCustoAdicional("");
      setDescCustoAdicional("Deslocamento técnico");
      setIncluirCustoNoTotal(true);
      setDesconto("");
    }
  }, [open, orcamentoParaEditar]);

  // Sincronizar itens existentes se estiver em modo de edição
  useEffect(() => {
    if (open && orcamentoParaEditar && itensExistentes) {
      setItens(
        itensExistentes.map((it) => ({
          estoque_id: it.estoque_id || null,
          codigo: it.codigo || null,
          produto: it.produto,
          unidade: it.unidade || "UN",
          quantidade: Number(it.quantidade) || 1,
          valor_custo: Number(it.valor_custo) || 0,
          valor_venda: Number(it.valor_venda) || 0,
        })),
      );
    }
  }, [open, orcamentoParaEditar, itensExistentes]);

  // Fetch Clientes
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, telefone, endereco, bairro, cidade")
        .order("nome");
      if (error) throw error;
      return (data || []) as ClienteResumo[];
    },
    enabled: open,
  });

  // Fetch Estoque
  const { data: estoque = [] } = useQuery({
    queryKey: ["estoque-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque").select("*").order("produto");
      if (error) throw error;
      return (data || []) as ProdutoEstoque[];
    },
    enabled: open,
  });

  // Filtragem de produtos para adição
  const produtosFiltrados = useMemo(() => {
    if (!buscaProduto.trim()) return [];
    const term = buscaProduto.toLowerCase();
    return estoque.filter(
      (p) =>
        p.produto.toLowerCase().includes(term) ||
        (p.codigo && p.codigo.toLowerCase().includes(term)),
    );
  }, [buscaProduto, estoque]);

  // Filtragem de clientes
  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes.slice(0, 30);
    const term = buscaCliente.toLowerCase();
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(term) ||
        (c.telefone && c.telefone.toLowerCase().includes(term)) ||
        (c.bairro && c.bairro.toLowerCase().includes(term)),
    );
  }, [buscaCliente, clientes]);

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) || null,
    [clientes, clienteId],
  );

  // Adicionar produto do estoque com preço de venda padrão, mas editável!
  const adicionarDoEstoque = (prod: ProdutoEstoque) => {
    const jaExiste = itens.find((i) => i.estoque_id === prod.id);
    if (jaExiste) {
      setItens((prev) =>
        prev.map((i) => (i.estoque_id === prod.id ? { ...i, quantidade: i.quantidade + 1 } : i)),
      );
      toast.info(`Quantidade de "${prod.produto}" aumentada.`);
    } else {
      setItens((prev) => [
        ...prev,
        {
          estoque_id: prod.id,
          codigo: prod.codigo || null,
          produto: prod.produto,
          unidade: prod.unidade || "UN",
          quantidade: 1,
          valor_custo: Number(prod.valor_custo || 0),
          valor_venda: Number(prod.valor_venda || 0), // Preço sugerido, editável!
        },
      ]);
      toast.success(`"${prod.produto}" adicionado ao orçamento.`);
    }
    setBuscaProduto("");
  };

  // Adicionar item avulso fora do estoque
  const adicionarItemAvulso = () => {
    if (!avulsoNome.trim()) {
      toast.error("Informe a descrição do produto ou item avulso.");
      return;
    }
    const preco = parseFloat(avulsoPreco.replace(",", ".")) || 0;
    const qtd = parseFloat(avulsoQtd.replace(",", ".")) || 1;

    setItens((prev) => [
      ...prev,
      {
        estoque_id: null,
        codigo: null,
        produto: avulsoNome.trim(),
        unidade: "UN",
        quantidade: qtd,
        valor_custo: 0,
        valor_venda: preco,
      },
    ]);

    setAvulsoNome("");
    setAvulsoQtd("1");
    setAvulsoPreco("");
    setShowItemAvulso(false);
    toast.success("Item avulso adicionado.");
  };

  // Atualizar campo de um item (especialmente quantidade e valor de venda editável)
  const atualizarItem = (
    index: number,
    campo: "quantidade" | "valor_venda" | "produto",
    valor: any,
  ) => {
    setItens((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [campo]: valor };
      return copy;
    });
  };

  const removerItem = (index: number) => {
    setItens((prev) => prev.filter((_, i) => i !== index));
  };

  // Atualizar horas recalcula mão de obra se não for manual
  const handleHorasChange = (hStr: string) => {
    setHoras(hStr);
    if (!maoObraManual) {
      const hNum = parseFloat(hStr.replace(",", ".")) || 0;
      setValorMaoObra(String(calcMaoObra(hNum)));
    }
  };

  // Totais computados
  const totalProdutos = useMemo(() => {
    return itens.reduce(
      (acc, item) => acc + (Number(item.quantidade) || 0) * (Number(item.valor_venda) || 0),
      0,
    );
  }, [itens]);

  const numMaoObra = parseFloat(valorMaoObra.replace(",", ".")) || 0;
  const numCustoAdicional = parseFloat(custoAdicional.replace(",", ".")) || 0;
  const numDesconto = parseFloat(desconto.replace(",", ".")) || 0;

  const totalBruto = totalProdutos + numMaoObra + (incluirCustoNoTotal ? numCustoAdicional : 0);
  const totalGeral = Math.max(0, totalBruto - numDesconto);

  // Mutation para criar ou editar o orçamento
  const mutation = useMutation({
    mutationFn: async () => {
      if (!clienteId) {
        throw new Error("Selecione um cliente para o orçamento.");
      }

      const hNum = parseFloat(horas.replace(",", ".")) || 0;

      if (isEditing && orcamentoParaEditar?.id) {
        // 1. Atualizar orçamento existente
        const { data: orcamentoAtualizado, error: errOrc } = await supabase
          .from("orcamentos")
          .update({
            cliente_id: clienteId,
            data: dataOrcamento,
            validade_dias: parseInt(validadeDias, 10) || 15,
            descricao: descricao.trim() || null,
            horas_mao_obra: hNum,
            valor_mao_obra: numMaoObra,
            custo_adicional: numCustoAdicional > 0 ? numCustoAdicional : null,
            descricao_custo_adicional: numCustoAdicional > 0 ? descCustoAdicional : null,
            incluir_custo_no_total: incluirCustoNoTotal,
            desconto: numDesconto,
            valor_bruto: totalBruto,
            valor_total: totalGeral,
            forma_pagamento: formaPagamento.trim() || null,
            observacoes: observacoes.trim() || null,
          } as any)
          .eq("id", orcamentoParaEditar.id)
          .select()
          .single();

        if (errOrc) throw errOrc;

        // 2. Substituir itens do orçamento
        const { error: errDel } = await supabase
          .from("orcamento_itens")
          .delete()
          .eq("orcamento_id", orcamentoParaEditar.id);

        if (errDel) throw errDel;

        if (itens.length > 0) {
          const itensToInsert = itens.map((it) => ({
            orcamento_id: orcamentoParaEditar.id,
            estoque_id: it.estoque_id,
            codigo: it.codigo,
            produto: it.produto,
            unidade: it.unidade || "UN",
            quantidade: Number(it.quantidade) || 1,
            valor_custo: Number(it.valor_custo) || 0,
            valor_venda: Number(it.valor_venda) || 0,
          }));

          const { error: errItens } = await supabase
            .from("orcamento_itens")
            .insert(itensToInsert as any);

          if (errItens) throw errItens;
        }

        return orcamentoAtualizado;
      } else {
        // 1. Inserir novo orçamento
        const { data: orcamentoCriado, error: errOrc } = await supabase
          .from("orcamentos")
          .insert({
            cliente_id: clienteId,
            data: dataOrcamento,
            validade_dias: parseInt(validadeDias, 10) || 15,
            descricao: descricao.trim() || null,
            status: "pendente",
            horas_mao_obra: hNum,
            valor_mao_obra: numMaoObra,
            custo_adicional: numCustoAdicional > 0 ? numCustoAdicional : null,
            descricao_custo_adicional: numCustoAdicional > 0 ? descCustoAdicional : null,
            incluir_custo_no_total: incluirCustoNoTotal,
            desconto: numDesconto,
            valor_bruto: totalBruto,
            valor_total: totalGeral,
            forma_pagamento: formaPagamento.trim() || null,
            observacoes: observacoes.trim() || null,
            created_by: user?.id || null,
          } as any)
          .select()
          .single();

        if (errOrc) throw errOrc;

        // 2. Inserir itens do orçamento
        if (itens.length > 0 && orcamentoCriado?.id) {
          const itensToInsert = itens.map((it) => ({
            orcamento_id: orcamentoCriado.id,
            estoque_id: it.estoque_id,
            codigo: it.codigo,
            produto: it.produto,
            unidade: it.unidade || "UN",
            quantidade: Number(it.quantidade) || 1,
            valor_custo: Number(it.valor_custo) || 0,
            valor_venda: Number(it.valor_venda) || 0,
          }));

          const { error: errItens } = await supabase
            .from("orcamento_itens")
            .insert(itensToInsert as any);

          if (errItens) throw errItens;
        }

        return orcamentoCriado;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
      qc.invalidateQueries({ queryKey: ["orcamento-itens"] });
      qc.invalidateQueries({ queryKey: ["orcamento-itens-detalhe"] });
      qc.invalidateQueries({ queryKey: ["orcamento-itens-editar"] });
      toast.success(
        isEditing ? "Orçamento atualizado com sucesso!" : "Orçamento criado com sucesso!",
      );
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar orçamento: ${err.message || err}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto p-6"
        id="novo-orcamento-dialog"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-lg ${isEditing ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}
            >
              {isEditing ? <Pencil className="w-5 h-5" /> : <Calculator className="w-5 h-5" />}
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                {isEditing
                  ? `Editar Orçamento #${orcamentoParaEditar?.numero}`
                  : "Novo Orçamento Comercial"}
              </DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEditing
                  ? "Modifique os produtos, valores de venda, mão de obra e condições desta proposta comercial."
                  : "Monte a proposta para o cliente, selecione produtos do estoque e edite os valores de venda livremente."}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Seção 1: Cliente e Prazos */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="font-semibold text-sm text-slate-800 flex items-center justify-between">
              <span>1. Cliente e Informações da Proposta</span>
              {clienteSelecionado && (
                <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {clienteSelecionado.cidade || "Cliente Selecionado"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="cliente-select" className="text-xs font-medium text-slate-700">
                  Cliente <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <select
                    id="cliente-select"
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Selecione o Cliente --</option>
                    {clientesFiltrados.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.telefone ? `(${c.telefone})` : ""}{" "}
                        {c.bairro ? `- ${c.bairro}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {clientes.length > 10 && (
                  <Input
                    placeholder="Filtrar lista de clientes por nome ou telefone..."
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    className="h-8 text-xs mt-1.5 bg-white"
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="data-orcamento" className="text-xs font-medium text-slate-700">
                  Data do Orçamento
                </Label>
                <Input
                  id="data-orcamento"
                  type="date"
                  value={dataOrcamento}
                  onChange={(e) => setDataOrcamento(e.target.value)}
                  className="h-10 text-sm bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="validade-dias" className="text-xs font-medium text-slate-700">
                  Validade da Proposta (Dias)
                </Label>
                <Input
                  id="validade-dias"
                  type="number"
                  min="1"
                  max="90"
                  value={validadeDias}
                  onChange={(e) => setValidadeDias(e.target.value)}
                  className="h-10 text-sm bg-white"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="descricao-orcamento" className="text-xs font-medium text-slate-700">
                  Objeto / Descrição do Serviço
                </Label>
                <Input
                  id="descricao-orcamento"
                  placeholder="Ex: Instalação de 4 câmeras IP e central de choque no condomínio"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="h-10 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          {/* Seção 2: Produtos do Estoque com Preço Editável */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-800">
                  2. Equipamentos e Materiais do Orçamento
                </h3>
                <p className="text-xs text-slate-500">
                  Busque os produtos no estoque. O valor de venda padrão é carregado, mas você pode{" "}
                  <strong className="text-blue-600">
                    alterar o valor de venda de cada produto
                  </strong>{" "}
                  livremente.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowItemAvulso(!showItemAvulso)}
                className="text-xs border-dashed border-slate-300 gap-1"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                {showItemAvulso ? "Cancelar Item Avulso" : "+ Item Fora do Estoque"}
              </Button>
            </div>

            {/* Busca no Estoque */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <Input
                placeholder="Buscar produto por nome ou código para adicionar ao orçamento..."
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                className="pl-9 h-10 text-sm bg-white"
              />

              {produtosFiltrados.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-11 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {produtosFiltrados.slice(0, 15).map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => adicionarDoEstoque(prod)}
                      className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-800">{prod.produto}</span>
                        {prod.codigo && (
                          <span className="ml-2 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {prod.codigo}
                          </span>
                        )}
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Saldo estoque: {prod.quantidade} {prod.unidade}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-blue-700">
                          {formatMoney(prod.valor_venda)}
                        </div>
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                          + Adicionar
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Form de Item Avulso */}
            {showItemAvulso && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-amber-900">
                  Adicionar Item Avulso (Fora do Estoque)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <div className="md:col-span-6">
                    <Input
                      placeholder="Descrição do item ou serviço específico"
                      value={avulsoNome}
                      onChange={(e) => setAvulsoNome(e.target.value)}
                      className="h-9 text-xs bg-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      type="number"
                      placeholder="Qtd"
                      value={avulsoQtd}
                      onChange={(e) => setAvulsoQtd(e.target.value)}
                      className="h-9 text-xs bg-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Valor Unit. R$"
                      value={avulsoPreco}
                      onChange={(e) => setAvulsoPreco(e.target.value)}
                      className="h-9 text-xs bg-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={adicionarItemAvulso}
                      className="w-full h-9 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      Inserir
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Tabela de Produtos Inseridos */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="p-3">Produto / Equipamento</th>
                      <th className="p-3 w-24 text-center">Qtd</th>
                      <th className="p-3 w-36 text-right">Valor Venda Unit. (R$)</th>
                      <th className="p-3 w-28 text-right">Subtotal</th>
                      <th className="p-3 w-12 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {carregandoItens ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500 text-xs">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            <span>Carregando itens do orçamento...</span>
                          </div>
                        </td>
                      </tr>
                    ) : itens.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                          Nenhum produto adicionado ao orçamento ainda. Busque um produto acima para
                          incluir.
                        </td>
                      </tr>
                    ) : (
                      itens.map((item, idx) => {
                        const qtd = Number(item.quantidade) || 0;
                        const vUnit = Number(item.valor_venda) || 0;
                        const sub = qtd * vUnit;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3">
                              <div className="font-medium text-slate-800">{item.produto}</div>
                              {item.codigo && (
                                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {item.codigo}
                                </span>
                              )}
                              {!item.estoque_id && (
                                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded ml-1 border border-amber-200">
                                  Avulso
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-center">
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantidade}
                                onChange={(e) =>
                                  atualizarItem(idx, "quantidade", parseFloat(e.target.value) || 1)
                                }
                                className="h-8 w-20 text-center mx-auto text-xs bg-white font-medium"
                              />
                            </td>

                            {/* O CAMPO SOLICITADO PELO USUÁRIO: VALOR DE VENDA EDITÁVEL */}
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-slate-400 font-mono text-[11px]">R$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.valor_venda}
                                  onChange={(e) =>
                                    atualizarItem(
                                      idx,
                                      "valor_venda",
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className="h-8 w-28 text-right text-xs bg-white font-semibold text-blue-700 border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                                  title="Valor de venda editável para este orçamento"
                                />
                              </div>
                            </td>

                            <td className="p-3 text-right font-semibold text-slate-900">
                              {formatMoney(sub)}
                            </td>

                            <td className="p-3 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removerItem(idx)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {itens.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-xs">
                      <tr>
                        <td colSpan={3} className="p-3 text-right text-slate-600">
                          Subtotal dos Produtos / Materiais:
                        </td>
                        <td className="p-3 text-right text-blue-700 font-bold">
                          {formatMoney(totalProdutos)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          {/* Seção 3: Mão de Obra e Custos */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="font-semibold text-sm text-slate-800">
              3. Mão de Obra e Despesas Adicionais
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="orc-horas" className="text-xs font-medium text-slate-700">
                  Horas Estimadas de Serviço
                </Label>
                <Input
                  id="orc-horas"
                  type="number"
                  step="0.5"
                  min="0"
                  value={horas}
                  onChange={(e) => handleHorasChange(e.target.value)}
                  className="h-10 text-sm bg-white"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="orc-mao-obra" className="text-xs font-medium text-slate-700">
                    Valor da Mão de Obra (R$)
                  </Label>
                  <label className="text-[10px] text-slate-500 flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maoObraManual}
                      onChange={(e) => setMaoObraManual(e.target.checked)}
                      className="rounded"
                    />
                    Digitar Manual
                  </label>
                </div>
                <Input
                  id="orc-mao-obra"
                  type="number"
                  step="0.01"
                  value={valorMaoObra}
                  onChange={(e) => {
                    setMaoObraManual(true);
                    setValorMaoObra(e.target.value);
                  }}
                  className="h-10 text-sm bg-white font-semibold text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="orc-desconto" className="text-xs font-medium text-slate-700">
                  Desconto Comercial (R$)
                </Label>
                <Input
                  id="orc-desconto"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  className="h-10 text-sm bg-white text-red-600 font-medium"
                />
              </div>
            </div>

            {/* Despesas de deslocamento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-200">
              <div className="space-y-1">
                <Label htmlFor="orc-custo-adicional" className="text-xs font-medium text-slate-700">
                  Despesas / Deslocamento (R$)
                </Label>
                <Input
                  id="orc-custo-adicional"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={custoAdicional}
                  onChange={(e) => setCustoAdicional(e.target.value)}
                  className="h-9 text-xs bg-white"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="orc-desc-custo" className="text-xs font-medium text-slate-700">
                  Descrição da Despesa
                </Label>
                <Input
                  id="orc-desc-custo"
                  placeholder="Ex: Deslocamento / Combustível"
                  value={descCustoAdicional}
                  onChange={(e) => setDescCustoAdicional(e.target.value)}
                  className="h-9 text-xs bg-white"
                />
              </div>

              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <Checkbox
                    checked={incluirCustoNoTotal}
                    onCheckedChange={(c) => setIncluirCustoNoTotal(Boolean(c))}
                  />
                  <span>Cobrar despesa no total do orçamento</span>
                </label>
              </div>
            </div>
          </div>

          {/* Seção 4: Condições e Forma de Pagamento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="forma-pagamento" className="text-xs font-medium text-slate-700">
                Condições / Formas de Pagamento
              </Label>
              <Input
                id="forma-pagamento"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                placeholder="Ex: À vista no PIX com 5% de desconto ou até 3x no cartão"
                className="h-9 text-xs bg-white"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="orc-observacoes" className="text-xs font-medium text-slate-700">
                Observações e Garantia
              </Label>
              <Input
                id="orc-observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Termos de garantia, prazos e condições técnicas"
                className="h-9 text-xs bg-white"
              />
            </div>
          </div>

          {/* Box de Resumo Financeiro */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 text-xs text-slate-600">
              <div>
                Materiais / Produtos:{" "}
                <span className="font-semibold text-slate-800">{formatMoney(totalProdutos)}</span>
              </div>
              <div>
                Mão de obra ({horas}h):{" "}
                <span className="font-semibold text-slate-800">{formatMoney(numMaoObra)}</span>
              </div>
              {numCustoAdicional > 0 && incluirCustoNoTotal && (
                <div>
                  Despesas adicionais:{" "}
                  <span className="font-semibold text-slate-800">
                    {formatMoney(numCustoAdicional)}
                  </span>
                </div>
              )}
              {numDesconto > 0 && (
                <div className="text-red-600">
                  Desconto aplicado:{" "}
                  <span className="font-semibold">- {formatMoney(numDesconto)}</span>
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-xs text-blue-700 font-semibold uppercase tracking-wider">
                Valor Total do Orçamento
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-blue-900">
                {formatMoney(totalGeral)}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !clienteId || carregandoItens}
            className={`text-white gap-2 font-semibold ${isEditing ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
            id="salvar-orcamento-btn"
          >
            {mutation.isPending
              ? "Salvando..."
              : isEditing
                ? "Salvar Alterações"
                : "Salvar e Gerar Orçamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
