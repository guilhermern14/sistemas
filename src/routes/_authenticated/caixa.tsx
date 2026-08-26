import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, FileUp, Loader2, Pencil, Search, Trash2, User, UserPlus } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { formatMoney } from "@/lib/servico";
import { extrairTextoPdf } from "@/lib/pdf-texto";
import { extrairLancamentosExtrato } from "@/lib/extrato.functions";
import { extrairContraparte, extrairLancamentosDeterministicos, ehPalavraRuido } from "@/lib/extrato-parser";
import type { Lancamento, LancamentoForma, LancamentoTipo } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({
    meta: [
      { title: "Entradas e saídas — Nascimento Sistemas de Segurança" },
      { name: "description", content: "Controle financeiro de entradas, saídas, dinheiro em caixa e saldo em conta." },
      { property: "og:title", content: "Entradas e saídas — Nascimento Sistemas de Segurança" },
      { property: "og:description", content: "Controle de entradas, saídas e saldo da empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaixaPage,
});

const formaLabels: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  ted: "TED/Transferência",
  debito_automatico: "Débito automático",
  tarifa: "Tarifa bancária",
  outro: "Outro",
};

const formasLista = Object.keys(formaLabels);

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDiaMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const dataBR = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

type FormLanc = {
  id?: string;
  tipo: LancamentoTipo;
  conta: "banco" | "dinheiro";
  descricao: string;
  contraparte: string;
  categoria: string;
  forma: LancamentoForma;
  valor: string;
  data: string;
  observacoes: string;
};

const novoForm = (tipo: LancamentoTipo, conta: "banco" | "dinheiro" = "banco"): FormLanc => ({
  tipo,
  conta,
  descricao: "",
  contraparte: "",
  categoria: "outros",
  forma: conta === "dinheiro" ? "dinheiro" : "pix",
  valor: "",
  data: hoje(),
  observacoes: "",
});

function CaixaPage() {
  const qc = useQueryClient();
  const extrair = useServerFn(extrairLancamentosExtrato);
  const inputPdf = useRef<HTMLInputElement>(null);

  const [de, setDe] = useState(primeiroDiaMes());
  const [ate, setAte] = useState(hoje());
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [formaFiltro, setFormaFiltro] = useState("todas");
  const [busca, setBusca] = useState("");

  const [form, setForm] = useState<FormLanc | null>(null);
  const [lendo, setLendo] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["financeiro-lancamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("*")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Lancamento[];
    },
  });

  const getContraparteDisplay = (l: Lancamento) => {
    if (l.contraparte && l.contraparte.trim()) {
      const c = l.contraparte.trim();
      if (!ehPalavraRuido(c)) {
        return c;
      }
    }
    const extraido = extrairContraparte(l.descricao || "");
    if (extraido && !ehPalavraRuido(extraido)) return extraido;

    // Fallback: se a descrição contiver "pagto de Nome" ou "pagto Nome"
    const matchPagto = (l.descricao || "").match(/pagto\s+(?:de\s+)?([A-Za-zÀ-Úà-ú\s]{3,30})/i);
    if (matchPagto && matchPagto[1]) {
      const possivelNome = matchPagto[1].trim();
      if (
        !ehPalavraRuido(possivelNome) &&
        !/interfone|fatura|boleto|conta|luz|agua|energia|gasolina|combustivel|equipamento|material|cftv|camera|alarme/i.test(possivelNome)
      ) {
        return possivelNome;
      }
    }

    return null;
  };

  const categorias = useMemo(
    () => [...new Set(lancamentos.map((l) => l.categoria).filter(Boolean))].sort(),
    [lancamentos],
  );

  const filtrados = useMemo(
    () =>
      lancamentos.filter((l) => {
        if (l.data < de || l.data > ate) return false;
        if (tipoFiltro !== "todos" && l.tipo !== tipoFiltro) return false;
        if (categoriaFiltro !== "todas" && l.categoria !== categoriaFiltro) return false;
        if (formaFiltro !== "todas" && l.forma !== formaFiltro) return false;
        const termo = busca.trim().toLowerCase();
        if (!termo) return true;
        const contraparteCalc = getContraparteDisplay(l) ?? "";
        return `${l.descricao} ${l.contraparte ?? ""} ${contraparteCalc} ${l.categoria} ${formaLabels[l.forma] ?? l.forma}`
          .toLowerCase()
          .includes(termo);
      }),
    [lancamentos, de, ate, tipoFiltro, categoriaFiltro, formaFiltro, busca],
  );

  const soma = (lista: Lancamento[], fn: (l: Lancamento) => boolean) =>
    lista.filter(fn).reduce((a, l) => a + Number(l.valor), 0);

  const isEntrada = (tipo: string) => tipo === "entrada" || tipo === "receita";
  const isSaida = (tipo: string) => tipo === "saida" || tipo === "despesa";

  const entradas = soma(filtrados, (l) => isEntrada(l.tipo));
  const saidas = soma(filtrados, (l) => isSaida(l.tipo));
  const saidaCartao = soma(
    filtrados,
    (l) => isSaida(l.tipo) && (l.forma === "cartao_credito" || l.forma === "cartao_debito"),
  );

  // Saldos acumulados (todos os lançamentos, sem filtro de período)
  const dinheiro =
    soma(lancamentos, (l) => l.conta === "dinheiro" && isEntrada(l.tipo)) -
    soma(lancamentos, (l) => l.conta === "dinheiro" && isSaida(l.tipo));
  const conta =
    soma(lancamentos, (l) => l.conta === "banco" && isEntrada(l.tipo)) -
    soma(lancamentos, (l) => l.conta === "banco" && isSaida(l.tipo));

  const abrirEdicao = (l: Lancamento) => {
    const cpDisplay = getContraparteDisplay(l) || "";
    setForm({
      id: l.id,
      tipo: l.tipo,
      conta: (l.conta as "banco" | "dinheiro") || "banco",
      descricao: l.descricao || "",
      contraparte: cpDisplay,
      categoria: l.categoria || "outros",
      forma: l.forma,
      valor: String(l.valor),
      data: l.data,
      observacoes: l.observacoes || "",
    });
  };

  const salvar = useMutation({
    mutationFn: async (f: FormLanc) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        tipo: f.tipo,
        conta: f.conta,
        descricao: f.descricao,
        contraparte: f.contraparte?.trim() || null,
        categoria: f.categoria || "outros",
        forma: f.forma,
        valor: Number(f.valor || 0),
        data: f.data,
        observacoes: f.observacoes || null,
      };

      if (f.id) {
        const { error } = await supabase
          .from("financeiro_lancamentos")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financeiro_lancamentos").insert({
          ...payload,
          origem: "manual",
          created_by: userData.user?.id ?? null,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form?.id ? "Lançamento atualizado" : "Lançamento salvo");
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
    },
    onError: () => toast.error("Não foi possível salvar o lançamento"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financeiro_lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento excluído");
      void qc.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
    },
    onError: () => toast.error("Não foi possível excluir"),
  });

  const importarExtrato = async (file: File | null | undefined) => {
    if (!file) return;
    setLendo(true);
    try {
      const texto = await extrairTextoPdf(file);
      if (!texto || texto.trim().length < 15) {
        toast.error("Não foi possível ler o texto deste PDF.");
        return;
      }

      // 1. Extração determinística rápida e completa
      const itensDeterministicos = extrairLancamentosDeterministicos(texto);

      let itens: any[] = [];
      try {
        const itensIa = await extrair({ data: { texto } });
        if (Array.isArray(itensIa) && itensIa.length >= itensDeterministicos.length) {
          itens = itensIa;
        } else {
          itens = itensDeterministicos;
        }
      } catch (errServer) {
        console.warn("Falha no endpoint do servidor, utilizando parser determinístico:", errServer);
        itens = itensDeterministicos;
      }

      if (!itens || itens.length === 0) {
        itens = itensDeterministicos;
      }

      if (!itens || itens.length === 0) {
        toast.error("Nenhum lançamento financeiro encontrado no extrato.");
        return;
      }

      const norm = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();

      const chave = (l: { data: string; tipo: string; valor: number; descricao?: string | null | undefined; contraparte?: string | null | undefined }) =>
        [l.data, l.tipo, Math.abs(Number(l.valor)).toFixed(2), norm(`${l.descricao ?? ""} ${l.contraparte ?? ""}`)].join("|");

      const datasOrdenadas = itens.map((i) => i.data).filter(Boolean).sort();
      const menorData = datasOrdenadas[0];
      const maiorData = datasOrdenadas[datasOrdenadas.length - 1];

      const { data: existentes, error: erroExistentes } = await supabase
        .from("financeiro_lancamentos")
        .select("data, tipo, valor, descricao, contraparte")
        .gte("data", menorData)
        .lte("data", maiorData);

      if (erroExistentes) throw erroExistentes;

      // Deduplicação baseada em contagem de ocorrências (permite múltiplos lançamentos legítimos de mesmo valor no mesmo dia)
      const contagemExistentes = new Map<string, number>();
      for (const l of existentes ?? []) {
        const k = chave(l as never);
        contagemExistentes.set(k, (contagemExistentes.get(k) || 0) + 1);
      }

      const novos: typeof itens = [];
      let duplicados = 0;

      for (const item of itens) {
        const k = chave(item);
        const qtdExistente = contagemExistentes.get(k) || 0;
        if (qtdExistente > 0) {
          contagemExistentes.set(k, qtdExistente - 1);
          duplicados++;
        } else {
          novos.push(item);
        }
      }

      if (!novos.length) {
        toast.info("Todos os lançamentos do extrato já estavam cadastrados no sistema.");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();

      // Inserção em lotes (evita sobrecarga ou timeout de requisição em extratos grandes)
      const BATCH_SIZE = 50;
      for (let i = 0; i < novos.length; i += BATCH_SIZE) {
        const batch = novos.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from("financeiro_lancamentos").insert(
          batch.map((item) => {
            const cp = item.contraparte && !ehPalavraRuido(item.contraparte) ? item.contraparte.trim() : null;
            return {
              tipo: item.tipo,
              conta: "banco",
              descricao: item.descricao,
              contraparte: cp,
              categoria: item.categoria || "outros",
              forma: formasLista.includes(item.forma) ? item.forma : "outro",
              valor: Math.abs(Number(item.valor)),
              data: item.data,
              origem: "extrato",
              created_by: userData.user?.id ?? null,
            };
          }) as never,
        );
        if (error) throw error;
      }

      // Se a data do extrato estiver fora do filtro atual, expande o período para visualização imediata
      if (menorData < de) setDe(menorData);
      if (maiorData > ate) setAte(maiorData);

      const qtdEntradas = novos.filter((i) => i.tipo === "entrada").length;
      const qtdSaidas = novos.filter((i) => i.tipo === "saida").length;

      toast.success(
        `${novos.length} lançamentos importados com sucesso (${qtdEntradas} entradas, ${qtdSaidas} saídas)${duplicados ? ` · ${duplicados} já existentes ignorados` : ""}`,
      );
      void qc.invalidateQueries({ queryKey: ["financeiro-lancamentos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar o extrato");
    } finally {
      setLendo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entradas e saídas</h1>
          <p className="text-sm text-muted-foreground">
            Importe o extrato do banco em PDF ou lance manualmente as movimentações.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputPdf}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              void importarExtrato(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <Button variant="outline" disabled={lendo} onClick={() => inputPdf.current?.click()}>
            {lendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            {lendo ? "Lendo extrato..." : "Importar extrato (PDF)"}
          </Button>
          <Button onClick={() => setForm(novoForm("entrada"))}>
            <ArrowUpCircle className="mr-2 h-4 w-4" /> Nova entrada
          </Button>
          <Button variant="secondary" onClick={() => setForm(novoForm("saida"))}>
            <ArrowDownCircle className="mr-2 h-4 w-4" /> Nova saída
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="surface-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Entradas (período)</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-success-foreground">{formatMoney(entradas)}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Saídas (período)</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-destructive">{formatMoney(saidas)}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Saída cartão (período)</p>
          <p className="mt-1 text-xl font-bold tracking-tight">{formatMoney(saidaCartao)}</p>
        </div>
        <div className="surface-card p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Dinheiro em caixa</p>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Adicionar dinheiro"
                onClick={() => setForm({ ...novoForm("entrada", "dinheiro"), descricao: "Entrada de dinheiro" })}
              >
                <ArrowUpCircle className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Retirar dinheiro"
                onClick={() => setForm({ ...novoForm("saida", "dinheiro"), descricao: "Retirada de dinheiro" })}
              >
                <ArrowDownCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xl font-bold tracking-tight">{formatMoney(dinheiro)}</p>
        </div>
        <div className="surface-card border-l-4 border-primary p-4">
          <p className="text-xs font-medium text-muted-foreground">Valor na conta</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-primary">{formatMoney(conta)}</p>
        </div>
      </div>

      <div className="surface-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Categoria</Label>
          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Forma</Label>
          <Select value={formaFiltro} onValueChange={setFormaFiltro}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {formasLista.map((f) => (
                <SelectItem key={f} value={f}>{formaLabels[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por descrição, pagador, categoria ou forma"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Quem pagou / recebeu</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-muted-foreground">Nenhum lançamento no período.</TableCell></TableRow>
            ) : (
              filtrados.map((l) => {
                const contraparteCalc = getContraparteDisplay(l);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">{dataBR(l.data)}</TableCell>
                    <TableCell className="font-medium">{l.descricao || "—"}</TableCell>
                    <TableCell>
                      {contraparteCalc ? (
                        <span className="font-medium text-foreground inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{contraparteCalc}</span>
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-primary px-2 font-normal gap-1"
                          onClick={() => abrirEdicao(l)}
                        >
                          <UserPlus className="h-3 w-3" />
                          <span>Informar nome</span>
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{l.categoria}</TableCell>
                    <TableCell>{formaLabels[l.forma] ?? l.forma}</TableCell>
                    <TableCell className="capitalize">{l.conta}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${l.tipo === "entrada" ? "text-success-foreground" : "text-destructive"}`}
                    >
                      {l.tipo === "entrada" ? "+" : "-"} {formatMoney(Number(l.valor))}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground h-8 w-8"
                          title="Editar lançamento"
                          onClick={() => abrirEdicao(l)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive h-8 w-8"
                          title="Excluir lançamento"
                          onClick={() => setItemParaExcluir(l.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDeleteDialog
        open={!!itemParaExcluir}
        onOpenChange={(o) => !o && setItemParaExcluir(null)}
        title="Excluir lançamento"
        description="Tem certeza que deseja excluir este lançamento financeiro?"
        onConfirm={() => {
          if (itemParaExcluir) {
            remover.mutate(itemParaExcluir);
          }
        }}
        isPending={remover.isPending}
      />

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.id
                ? "Editar lançamento"
                : form?.tipo === "entrada"
                  ? "Nova entrada"
                  : "Nova saída"}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Descrição / o que foi pago</Label>
                <Input
                  placeholder="Ex: Pagamento OS #98 - Manutenção CFTV"
                  value={form.descricao}
                  onChange={(e) => {
                    const novaDesc = e.target.value;
                    const sugestao = !form.contraparte ? extrairContraparte(novaDesc) : null;
                    setForm({
                      ...form,
                      descricao: novaDesc,
                      ...(sugestao && !form.contraparte ? { contraparte: sugestao } : {}),
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Quem pagou / recebeu</Label>
                  {!form.contraparte && form.descricao && extrairContraparte(form.descricao) && (
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline font-medium"
                      onClick={() => {
                        const sug = extrairContraparte(form.descricao);
                        if (sug) setForm({ ...form, contraparte: sug });
                      }}
                    >
                      Preencher "{extrairContraparte(form.descricao)}"
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Ex: Nome do cliente, fornecedor ou pessoa"
                  value={form.contraparte}
                  onChange={(e) => setForm({ ...form, contraparte: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Forma</Label>
                <Select value={form.forma} onValueChange={(v) => setForm({ ...form, forma: v as LancamentoForma })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {formasLista.map((f) => (
                      <SelectItem key={f} value={f}>{formaLabels[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Conta</Label>
                <Select
                  value={form.conta}
                  onValueChange={(v) => setForm({ ...form, conta: v as "banco" | "dinheiro" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banco">Conta bancária</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro em caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observações</Label>
                <Textarea
                  rows={2}
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => form && salvar.mutate(form)}
              disabled={!form || !form.valor || Number(form.valor) <= 0 || salvar.isPending}
            >
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

