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

function texto(el: Element | Document | null | undefined, tag: string) {
  if (!el) return "";
  // Try getElementsByTagName
  const nodes = el.getElementsByTagName(tag);
  if (nodes && nodes.length > 0 && nodes[0]?.textContent) {
    return nodes[0].textContent.trim();
  }
  // Try case-insensitive or namespaced tag search
  const allEls = el.getElementsByTagName("*");
  const targetLower = tag.toLowerCase();
  for (let i = 0; i < allEls.length; i++) {
    const node = allEls[i];
    const local = (node.localName || node.nodeName || "").split(":").pop()?.toLowerCase();
    if (local === targetLower && node.textContent) {
      return node.textContent.trim();
    }
  }
  return "";
}

function numero(valor: string | number | null | undefined) {
  if (typeof valor === "number") return valor;
  return Number((String(valor || "0")).replace(/\s/g, "").replace(",", ".")) || 0;
}

function formatarDataIso(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const limpa = raw.trim();
  // YYYY-MM-DD
  const matchIso = limpa.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
  // YYYYMMDD
  const matchCompact = limpa.match(/^(\d{4})(\d{2})(\d{2})/);
  if (matchCompact) return `${matchCompact[1]}-${matchCompact[2]}-${matchCompact[3]}`;
  // DD/MM/YYYY
  const matchBr = limpa.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchBr) return `${matchBr[3]}-${matchBr[2]}-${matchBr[1]}`;
  return new Date().toISOString().slice(0, 10);
}

function dataNfe(doc: Document) {
  const raw =
    texto(doc.getElementsByTagName("ide")[0], "dhEmi") ||
    texto(doc.getElementsByTagName("ide")[0], "dEmi") ||
    texto(doc, "dhEmi") ||
    texto(doc, "dEmi");
  return formatarDataIso(raw);
}

/** Lê uma NF-e (XML) e devolve os produtos com custo e preço de venda (+37%). */
export function parseNfeXml(conteudo: string): ItemXml[] {
  return parseNfe(conteudo).itens;
}

/** Lê uma NF-e: fornecedor, produtos, chave, número, data, total e duplicatas/boletos. */
export function parseNfe(conteudo: string): NotaXml {
  const doc = new DOMParser().parseFromString(conteudo, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Arquivo XML inválido ou corrompido");
  }

  // Busca tags det (itens)
  let dets = Array.from(doc.getElementsByTagName("det"));
  if (dets.length === 0) {
    const all = Array.from(doc.getElementsByTagName("*"));
    dets = all.filter((el) => (el.localName || el.nodeName).toLowerCase().endsWith("det"));
  }

  const itens: ItemXml[] = [];

  for (const det of dets) {
    const prod = det.getElementsByTagName("prod")[0] || det;
    const nome = texto(prod, "xProd");
    if (!nome) continue;
    const quantidade = numero(texto(prod, "qCom") || texto(prod, "qTrib") || "1");
    const custo = numero(texto(prod, "vUnCom") || texto(prod, "vUnTrib") || "0");
    const vCusto = Number(custo.toFixed(4));
    const vVenda = Number((custo * MARGEM_VENDA).toFixed(2));
    itens.push({
      codigo: texto(prod, "cProd"),
      produto: nome,
      unidade: texto(prod, "uCom") || texto(prod, "uTrib") || "un",
      quantidade: quantidade > 0 ? quantidade : 1,
      valor_custo: vCusto,
      valor_venda: vVenda,
    });
  }

  const emit = doc.getElementsByTagName("emit")[0];
  const emitente =
    texto(emit, "xNome") ||
    texto(emit, "xFant") ||
    texto(emit, "CNPJ") ||
    texto(emit, "CPF") ||
    "Fornecedor";

  const dest = doc.getElementsByTagName("dest")[0];
  const destinatario =
    texto(dest, "xNome") ||
    texto(dest, "xFant") ||
    texto(dest, "CNPJ") ||
    texto(dest, "CPF") ||
    "Cliente";

  const fornecedor = emitente;
  const ide = doc.getElementsByTagName("ide")[0];
  const total = doc.getElementsByTagName("ICMSTot")[0] || doc.getElementsByTagName("vNF")[0]?.parentElement;

  const infNfe = doc.getElementsByTagName("infNFe")[0];
  const idAttr = infNfe?.getAttribute("Id") ?? "";
  const chave =
    idAttr.replace(/^NFe/i, "").trim() ||
    texto(doc, "chNFe") ||
    texto(doc, "Id");

  const numeroNf = texto(ide, "nNF") || texto(doc, "nNF");
  const serieNf = texto(ide, "serie") || texto(doc, "serie");
  const dataEmissao = dataNfe(doc);
  const valorTotal = numero(texto(total, "vNF") || texto(doc, "vNF") || texto(doc, "vLiq") || texto(doc, "vOrig"));

  // Duplicatas e Boletos no XML (cobr -> dup ou dup avulsa)
  let dupEls = Array.from(doc.getElementsByTagName("dup"));
  if (dupEls.length === 0) {
    const all = Array.from(doc.getElementsByTagName("*"));
    dupEls = all.filter((el) => (el.localName || el.nodeName).toLowerCase().endsWith("dup"));
  }

  const boletos: BoletoXml[] = [];

  for (let idx = 0; idx < dupEls.length; idx++) {
    const d = dupEls[idx];
    const nDup = texto(d, "nDup") || `${idx + 1}`;
    const rawVenc = texto(d, "dVenc");
    const vDup = numero(texto(d, "vDup"));
    if (rawVenc || vDup > 0) {
      boletos.push({
        numero: nDup,
        vencimento: formatarDataIso(rawVenc || dataEmissao),
        valor: vDup > 0 ? Number(vDup.toFixed(2)) : (valorTotal > 0 ? valorTotal : 0),
      });
    }
  }

  // Se não encontrou <dup>, procurar em <pag><detPag> ou <fat>
  if (boletos.length === 0) {
    const detPags = Array.from(doc.getElementsByTagName("detPag"));
    for (let i = 0; i < detPags.length; i++) {
      const dp = detPags[i];
      const vPag = numero(texto(dp, "vPag"));
      const dPag = texto(dp, "dPag") || texto(dp, "dVenc");
      if (vPag > 0) {
        boletos.push({
          numero: `${i + 1}`,
          vencimento: formatarDataIso(dPag || dataEmissao),
          valor: Number(vPag.toFixed(2)),
        });
      }
    }
  }

  // Se não encontrou nenhuma parcela específica, mas o valor total existe
  if (boletos.length === 0 && valorTotal > 0) {
    boletos.push({
      numero: "1",
      vencimento: dataEmissao,
      valor: valorTotal,
    });
  }

  return {
    fornecedor,
    emitente,
    destinatario,
    itens,
    boletos,
    chave,
    numero: numeroNf,
    serie: serieNf,
    data_emissao: dataEmissao,
    valor_total: valorTotal,
  };
}
