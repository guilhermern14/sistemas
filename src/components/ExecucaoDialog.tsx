import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ImagePlus, Plus, Search, Trash2, X } from "lucide-react";
import { formatMoney } from "@/lib/servico";
import { calcMaoObra } from "@/lib/empresa";
import { assinarUrl, urlFoto } from "@/lib/fotos";
import { gerarIdSeguro } from "@/lib/id";
import type { ProdutoEstoque, Servico, ServicoCentral, ServicoFoto, ServicoProduto } from "@/lib/types";

type ItemSelecionado = {
  estoque_id: string | null;
  codigo: string | null;
  produto: string;
  quantidade: number;
  valor_unitario: number;
};

type CentralForm = {
  id?: string;
  nome: string;
  mac: string;
  usuario: string;
  senha: string;
  foto_url: string | null;
  foto_path: string | null;
  foto_file: File | null;
};

export function ExecucaoDialog({
  servico,
  onClose,
  verValores,
}: {
  servico: Servico | null;
  onClose: () => void;
  verValores: boolean;
}) {
  const qc = useQueryClient();
  const [relatorio, setRelatorio] = useState("");
  const [horas, setHoras] = useState("0");
  const [itens, setItens] = useState<ItemSelecionado[]>([]);
  const [busca, setBusca] = useState("");
  const [fotos, setFotos] = useState<ServicoFoto[]>([]);
  const [novasFotos, setNovasFotos] = useState<File[]>([]);
  const [centrais, setCentrais] = useState<CentralForm[]>([]);

  const { data: estoque = [] } = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque").select("*").order("produto");
      if (error) throw error;
      return data as unknown as ProdutoEstoque[];
    },
  });

  const { data: usados } = useQuery({
    queryKey: ["servico-produtos", servico?.id],
    enabled: !!servico?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("servico_produtos").select("*").eq("servico_id", servico!.id);
      if (error) throw error;
      return data as unknown as ServicoProduto[];
    },
  });

  // sem valor padrao inline: um novo [] a cada render reexecutaria os efeitos
  // abaixo em loop infinito ("Maximum update depth exceeded").
  const { data: fotosSalvas } = useQuery({
    queryKey: ["servico-fotos", servico?.id],
    enabled: !!servico?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("servico_fotos").select("*").eq("servico_id", servico!.id).order("created_at");
      if (error) throw error;
      return data as unknown as ServicoFoto[];
    },
  });

  const { data: centraisSalvas } = useQuery({
    queryKey: ["servico-centrais", servico?.id],
    enabled: !!servico?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("servico_centrais").select("*").eq("servico_id", servico!.id).order("created_at");
      if (error) throw error;
      return data as unknown as ServicoCentral[];
    },
  });

  useEffect(() => {
    if (!servico) return;
    setRelatorio(servico.relatorio ?? "");
    setHoras(String(servico.horas_mao_obra ?? 0));
    setBusca("");
    setNovasFotos([]);
  }, [servico]);

  useEffect(() => {
    if (!fotosSalvas) return;
    let cancel = false;
    Promise.all(
      fotosSalvas.map(async (f) => {
        try {
          if (f.storage_path) {
            const freshUrl = await urlFoto(f.storage_path, f.url);
            return { ...f, url: freshUrl || f.url };
          }
        } catch {}
        return f;
      })
    ).then((resolved) => {
      if (!cancel) setFotos(resolved);
    });
    return () => {
      cancel = true;
    };
  }, [fotosSalvas]);

  useEffect(() => {
    if (!centraisSalvas) return;
    let cancel = false;
    Promise.all(
      centraisSalvas.map(async (c) => {
        let fUrl = c.foto_url;
        try {
          if (c.foto_path) {
            fUrl = await urlFoto(c.foto_path, c.foto_url);
          }
        } catch {}
        return {
          id: c.id,
          nome: c.nome,
          mac: c.mac ?? "",
          usuario: c.usuario ?? "",
          senha: c.senha ?? "",
          foto_url: fUrl,
          foto_path: c.foto_path,
          foto_file: null,
        };
      })
    ).then((resolved) => {
      if (!cancel) setCentrais(resolved);
    });
    return () => {
      cancel = true;
    };
  }, [centraisSalvas]);

  useEffect(() => {
    if (!usados) return;
    setItens(usados.map((u) => ({
      estoque_id: u.estoque_id,
      codigo: u.codigo,
      produto: u.produto,
      quantidade: Number(u.quantidade),
      valor_unitario: Number(u.valor_unitario),
    })));
  }, [usados]);

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [] as ProdutoEstoque[];
    return estoque.filter((p) => `${p.codigo ?? ""} ${p.produto}`.toLowerCase().includes(termo)).slice(0, 8);
  }, [busca, estoque]);

  const adicionar = (p: ProdutoEstoque) => {
    setItens((atual) => {
      const i = atual.findIndex((x) => x.estoque_id === p.id);
      const existente = i >= 0 ? atual[i] : undefined;
      if (existente) {
        const copia = [...atual];
        copia[i] = { ...existente, quantidade: existente.quantidade + 1 };
        return copia;
      }
      return [...atual, {
        estoque_id: p.id,
        codigo: p.codigo,
        produto: p.produto,
        quantidade: 1,
        valor_unitario: Number(p.valor_venda ?? 0),
      }];
    });
    setBusca("");
  };

  const total = itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const maoObra = calcMaoObra(Number(horas || 0));
  const bruto = total + maoObra;

  const adicionarFotos = (files: FileList | null) => {
    if (!files) return;
    const imagens = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imagens.length === 0) {
      toast.error("Selecione arquivos de imagem.");
      return;
    }
    setNovasFotos((atual) => [...atual, ...imagens]);
  };

  const adicionarCentral = () => {
    setCentrais((atual) => [
      ...atual,
      { nome: `Central ${atual.length + 1}`, mac: "", usuario: "", senha: "", foto_url: null, foto_path: null, foto_file: null },
    ]);
  };

  const atualizarCentral = (idx: number, patch: Partial<CentralForm>) => {
    setCentrais((atual) => atual.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const salvar = useMutation({
    mutationFn: async (concluir: boolean) => {
      if (!servico) return;

      const resumo = itens.map((i) => `${i.codigo ? `[${i.codigo}] ` : ""}${i.produto} x${i.quantidade}`).join("; ");
      const desconto = Number(servico.desconto ?? 0);
      const patch: Record<string, unknown> = {
        relatorio,
        produtos_usados: resumo || null,
        horas_mao_obra: Number(horas || 0),
        valor_mao_obra: maoObra,
        valor_bruto: Number(bruto.toFixed(2)),
        valor: Number(Math.max(bruto - desconto, 0).toFixed(2)),
      };
      if (concluir) {
        patch["status"] = "pronto";
        patch["concluido_em"] = new Date().toISOString();
      }

      const { error } = await supabase.from("servicos").update(patch as never).eq("id", servico.id);
      if (error) throw error;

      const { error: delErro } = await supabase.from("servico_produtos").delete().eq("servico_id", servico.id);
      if (delErro) throw delErro;

      if (itens.length > 0) {
        const { error: insErro } = await supabase.from("servico_produtos").insert(
          itens.map((i) => ({
            servico_id: servico.id,
            estoque_id: i.estoque_id,
            codigo: i.codigo,
            produto: i.produto,
            quantidade: i.quantidade,
            valor_unitario: i.valor_unitario,
          })) as never,
        );
        if (insErro) throw insErro;
      }

      // Fotos novas do serviço
      for (const file of novasFotos) {
        const path = `${servico.id}/${gerarIdSeguro()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage.from("servico-fotos").upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        const url = await assinarUrl(path);
        const { error: fotoError } = await supabase.from("servico_fotos").insert({
          servico_id: servico.id, storage_path: path, url,
        } as never);
        if (fotoError) throw fotoError;
      }

      // Centrais: atualiza as existentes e cria as novas.
      const idsAtuais = centrais.filter((c) => c.id).map((c) => c.id as string);
      const antigas = centraisSalvas.map((c) => c.id).filter((id) => !idsAtuais.includes(id));
      if (antigas.length) {
        const { error } = await supabase.from("servico_centrais").delete().in("id", antigas);
        if (error) throw error;
      }

      for (const central of centrais) {
        let foto_url = central.foto_url;
        let foto_path = central.foto_path;
        if (central.foto_file) {
          const path = `${servico.id}/centrais/${gerarIdSeguro()}-${central.foto_file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: uploadError } = await supabase.storage.from("servico-fotos").upload(path, central.foto_file, { contentType: central.foto_file.type });
          if (uploadError) throw uploadError;
          foto_url = await assinarUrl(path);
          foto_path = path;
        }

        const payload = {
          servico_id: servico.id,
          nome: central.nome || "Central",
          mac: central.mac || null,
          usuario: central.usuario || null,
          senha: central.senha || null,
          foto_url,
          foto_path,
        };

        if (central.id) {
          const { error } = await supabase.from("servico_centrais").update(payload as never).eq("id", central.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("servico_centrais").insert(payload as never);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Registro salvo");
      onClose();
      void qc.invalidateQueries({ queryKey: ["agendamentos"] });
      void qc.invalidateQueries({ queryKey: ["servicos-prontos"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-servicos"] });
      void qc.invalidateQueries({ queryKey: ["servico-produtos"] });
      void qc.invalidateQueries({ queryKey: ["servico-fotos"] });
      void qc.invalidateQueries({ queryKey: ["servico-centrais"] });
      void qc.invalidateQueries({ queryKey: ["financeiro-servicos"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar o registro"),
  });

  const removerFoto = async (foto: ServicoFoto) => {
    const { error } = await supabase.from("servico_fotos").delete().eq("id", foto.id);
    if (error) {
      toast.error("Não foi possível excluir a foto");
      return;
    }
    setFotos((atual) => atual.filter((f) => f.id !== foto.id));
    toast.success("Foto removida");
    void supabase.storage.from("servico-fotos").remove([foto.storage_path]);
  };

  const jaPronto = servico?.status === "pronto";

  return (
    <Dialog open={!!servico} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar o que foi feito</DialogTitle></DialogHeader>

        <div className="grid gap-5">
          <div className="space-y-2">
            <Label>Serviço executado</Label>
            <Textarea rows={4} placeholder="Descreva o que foi feito no cliente" value={relatorio} onChange={(e) => setRelatorio(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Horas de mão de obra</Label>
              <Input type="number" min="0" step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valor da mão de obra</Label>
              <Input readOnly value={formatMoney(maoObra)} />
              <p className="text-xs text-muted-foreground">1ª hora R$ 100 · demais R$ 60/h</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Fotos do serviço executado</Label>
                <p className="text-xs text-muted-foreground">As fotos serão colocadas na página 2 do PDF.</p>
              </div>
              <label className="inline-flex cursor-pointer">
                <Button type="button" variant="outline" asChild>
                  <span><ImagePlus className="mr-2 h-4 w-4" /> Adicionar fotos</span>
                </Button>
                <input className="hidden" type="file" accept="image/*" multiple onChange={(e) => { adicionarFotos(e.target.files); e.currentTarget.value = ""; }} />
              </label>
            </div>
            {(fotos.length > 0 || novasFotos.length > 0) && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {fotos.map((foto) => (
                  <div key={foto.id} className="relative overflow-hidden rounded-lg border">
                    <img src={foto.url} alt="Foto do serviço" className="h-28 w-full object-cover" />
                    <Button type="button" size="icon" variant="destructive" className="absolute right-1 top-1 h-7 w-7" onClick={() => void removerFoto(foto)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {novasFotos.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="relative overflow-hidden rounded-lg border">
                    <img src={URL.createObjectURL(file)} alt={file.name} className="h-28 w-full object-cover" />
                    <Button type="button" size="icon" variant="destructive" className="absolute right-1 top-1 h-7 w-7" onClick={() => setNovasFotos((x) => x.filter((_, i) => i !== idx))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Dados da central</Label>
                <p className="text-xs text-muted-foreground">Cadastre uma ou várias centrais do cliente.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={adicionarCentral}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar central
              </Button>
            </div>

            {centrais.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma central cadastrada.</p>}
            <div className="grid gap-4">
              {centrais.map((central, idx) => (
                <div key={central.id ?? idx} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-medium">{central.nome || `Central ${idx + 1}`}</span>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setCentrais((x) => x.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome da central</Label>
                      <Input value={central.nome} onChange={(e) => atualizarCentral(idx, { nome: e.target.value })} placeholder="Ex.: Central de câmeras" />
                    </div>
                    <div className="space-y-2">
                      <Label>MAC</Label>
                      <Input value={central.mac} onChange={(e) => atualizarCentral(idx, { mac: e.target.value })} placeholder="00:11:22:33:44:55" />
                    </div>
                    <div className="space-y-2">
                      <Label>Usuário</Label>
                      <Input value={central.usuario} onChange={(e) => atualizarCentral(idx, { usuario: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Senha</Label>
                      <Input type="text" value={central.senha} onChange={(e) => atualizarCentral(idx, { senha: e.target.value })} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Foto da central</Label>
                      <Input type="file" accept="image/*" onChange={(e) => atualizarCentral(idx, { foto_file: e.target.files?.[0] ?? null })} />
                      {central.foto_url && !central.foto_file && <img src={central.foto_url} alt={central.nome} className="mt-2 h-24 rounded border object-cover" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Produtos usados</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por código ou nome do produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {resultados.length > 0 && (
              <div className="surface-card divide-y">
                {resultados.map((p) => (
                  <button key={p.id} type="button" onClick={() => adicionar(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                    <span><span className="font-mono text-xs text-muted-foreground">{p.codigo ?? "—"}</span>{" "}{p.produto}</span>
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
            {itens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum produto selecionado.</p> : (
              <div className="space-y-2">
                {itens.map((i, idx) => (
                  <div key={`${i.estoque_id}-${idx}`} className="flex items-center gap-2 rounded-md border p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.produto}</p>
                      <p className="font-mono text-xs text-muted-foreground">{i.codigo ?? "—"}{verValores ? ` · ${formatMoney(i.valor_unitario)}` : ""}</p>
                    </div>
                    <Input className="h-8 w-20" type="number" min="0" step="0.01" value={i.quantidade} onChange={(e) => setItens((atual) => atual.map((x, j) => j === idx ? { ...x, quantidade: Number(e.target.value) } : x))} />
                    <Button size="icon" variant="ghost" onClick={() => setItens((atual) => atual.filter((_, j) => j !== idx))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                {verValores && <p className="text-right text-sm text-muted-foreground">Total em produtos: {formatMoney(total)}</p>}
              </div>
            )}
          </div>

          {verValores && (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Produtos</span><span>{formatMoney(total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Mão de obra</span><span>{formatMoney(maoObra)}</span></div>
              <div className="mt-1 flex justify-between border-t pt-1 font-medium"><span>Total do serviço</span><span>{formatMoney(bruto)}</span></div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => salvar.mutate(false)} disabled={salvar.isPending}>Salvar alterações</Button>
          {!jaPronto && <Button onClick={() => salvar.mutate(true)} disabled={!relatorio || salvar.isPending}>Marcar como pronto</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
