export const MARGEM_VENDA = 1.37;

export type ItemXml = {
  codigo: string;
  produto: string;
  unidade: string;
  quantidade: number;
  valor_custo: number;
  valor_venda: number;
};

export type BoletoXml = {
  numero: string;
  vencimento: string;
  valor: number;
};

export type NotaXml = {
  fornecedor: string;
  emitente: string;
  destinatario: string;
  itens: ItemXml[];
  boletos: BoletoXml[];
  chave: string;
  numero: string;
  serie: string;
  data_emissao: string;
  valor_total: number;
};

function texto(el: Element | null | undefined, tag: string) {
  const node = el?.getElementsByTagName(tag)[0];
  return node?.textContent?.trim() ?? "";
}

function numero(valor: string) {
  return Number((valor || "0").replace(",", ".")) || 0;
}

function dataNfe(doc: Document) {
  const raw = texto(doc.getElementsByTagName("ide")[0], "dhEmi") || texto(doc.getElementsByTagName("ide")[0], "dEmi");
  if (!raw) return new Date().toISOString().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : new Date().toISOString().slice(0, 10);
}

/** Lê uma NF-e (XML) e devolve os produtos com custo e preço de venda (+37%). */
export function parseNfeXml(conteudo: string): ItemXml[] {
  return parseNfe(conteudo).itens;
}

/** Lê uma NF-e: fornecedor, produtos, chave, número, data, total e duplicatas. */
export function parseNfe(conteudo: string): NotaXml {
  const doc = new DOMParser().parseFromString(conteudo, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Arquivo XML inválido");
  }

  const dets = Array.from(doc.getElementsByTagName("det"));
  const itens: ItemXml[] = [];

  for (const det of dets) {
    const prod = det.getElementsByTagName("prod")[0];
    if (!prod) continue;
    const nome = texto(prod, "xProd");
    if (!nome) continue;
    const quantidade = numero(texto(prod, "qCom") || texto(prod, "qTrib"));
    const custo = numero(texto(prod, "vUnCom") || texto(prod, "vUnTrib"));
    itens.push({
      codigo: texto(prod, "cProd"),
      produto: nome,
      unidade: texto(prod, "uCom") || texto(prod, "uTrib") || "un",
      quantidade,
      valor_custo: Number(custo.toFixed(4)),
      valor_venda: Number((custo * MARGEM_VENDA).toFixed(2)),
    });
  }

  const emit = doc.getElementsByTagName("emit")[0];
  const emitente = texto(emit, "xNome") || texto(emit, "xFant");
  const dest = doc.getElementsByTagName("dest")[0];
  const destinatario = texto(dest, "xNome") || texto(dest, "xFant");
  const fornecedor = emitente;
  const ide = doc.getElementsByTagName("ide")[0];
  const total = doc.getElementsByTagName("ICMSTot")[0];

  const infNfe = doc.getElementsByTagName("infNFe")[0];
  const id = infNfe?.getAttribute("Id") ?? "";
  const chave = id.replace(/^NFe/i, "") || texto(doc.getElementsByTagName("chNFe")[0], "chNFe");

  const boletos: BoletoXml[] = Array.from(doc.getElementsByTagName("dup"))
    .map((d) => ({
      numero: texto(d, "nDup"),
      vencimento: texto(d, "dVenc"),
      valor: numero(texto(d, "vDup")),
    }))
    .filter((b) => b.vencimento);

  return {
    fornecedor,
    emitente,
    destinatario,
    itens,
    boletos,
    chave,
    numero: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    data_emissao: dataNfe(doc),
    valor_total: numero(texto(total, "vNF")),
  };
}
