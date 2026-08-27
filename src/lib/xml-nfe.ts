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
  tipo_sugerido?: "compra" | "emitida";
};

function texto(el: Element | Document | null | undefined, tag: string): string {
  if (!el) return "";
  // Direct tag search
  const nodes = el.getElementsByTagName(tag);
  if (nodes && nodes.length > 0 && nodes[0]?.textContent) {
    const val = nodes[0].textContent.trim();
    if (val) return val;
  }
  // Case-insensitive / namespace tag search
  const allEls = el.getElementsByTagName("*");
  const targetLower = tag.toLowerCase();
  for (let i = 0; i < allEls.length; i++) {
    const node = allEls[i];
    const local = (node.localName || node.nodeName || "").split(":").pop()?.toLowerCase();
    if (local === targetLower && node.textContent) {
      const val = node.textContent.trim();
      if (val) return val;
    }
  }
  return "";
}

function numero(valor: string | number | null | undefined): number {
  if (typeof valor === "number") return isNaN(valor) ? 0 : valor;
  if (!valor) return 0;
  const limpo = String(valor).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function formatarDataIso(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const limpa = raw.trim();
  // ISO com timestamp: 2026-01-08T10:30:05...
  const matchIsoTime = limpa.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIsoTime) return `${matchIsoTime[1]}-${matchIsoTime[2]}-${matchIsoTime[3]}`;
  // YYYYMMDD
  const matchCompact = limpa.match(/^(\d{4})(\d{2})(\d{2})/);
  if (matchCompact) return `${matchCompact[1]}-${matchCompact[2]}-${matchCompact[3]}`;
  // DD/MM/YYYY
  const matchBr = limpa.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchBr) return `${matchBr[3]}-${matchBr[2]}-${matchBr[1]}`;
  return new Date().toISOString().slice(0, 10);
}

/** Lê uma NF-e ou NFS-e (XML) e devolve os produtos/serviços com custo e preço de venda. */
export function parseNfeXml(conteudo: string): ItemXml[] {
  return parseNfe(conteudo).itens;
}

/** Lê uma NF-e (produtos) ou NFS-e (serviços): fornecedor/cliente, itens, chave, número, data, total e duplicatas/boletos. */
export function parseNfe(conteudo: string): NotaXml {
  const doc = new DOMParser().parseFromString(conteudo, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Arquivo XML inválido ou corrompido");
  }

  // 1. Identificar Número da Nota
  const ide = doc.getElementsByTagName("ide")[0];
  const numeroNf =
    texto(doc, "nNFSe") ||
    texto(ide, "nNF") ||
    texto(doc, "nNF") ||
    texto(doc, "Numero") ||
    texto(doc, "NumeroNfse") ||
    texto(doc, "nDPS") ||
    texto(doc, "nDFSe") ||
    texto(doc, "NumeroRps") ||
    "";

  // 2. Identificar Série
  const serieNf =
    texto(ide, "serie") ||
    texto(doc, "serie") ||
    texto(doc, "Serie") ||
    texto(doc, "SerieRps") ||
    (texto(doc, "nNFSe") ? "NFS-e" : "");

  // 3. Identificar Chave / Identificador
  const infNfe = doc.getElementsByTagName("infNFe")[0];
  const infNfse = doc.getElementsByTagName("infNFSe")[0] || doc.getElementsByTagName("InfNfse")[0];
  const infDps = doc.getElementsByTagName("infDPS")[0] || doc.getElementsByTagName("InfDeclaracaoPrestacaoServico")[0];

  const idAttrNfe = infNfe?.getAttribute("Id") ?? "";
  const idAttrNfse = infNfse?.getAttribute("Id") ?? "";
  const idAttrDps = infDps?.getAttribute("Id") ?? "";

  const chave =
    idAttrNfe.replace(/^NFe/i, "").trim() ||
    idAttrNfse ||
    idAttrDps ||
    texto(doc, "chNFe") ||
    texto(doc, "CodigoVerificacao") ||
    texto(doc, "nDFSe") ||
    texto(doc, "Id") ||
    numeroNf;

  // 4. Data de Emissão
  const rawData =
    texto(ide, "dhEmi") ||
    texto(ide, "dEmi") ||
    texto(doc, "dhProc") ||
    texto(doc, "dhEmi") ||
    texto(doc, "DataEmissao") ||
    texto(doc, "dCompet") ||
    texto(doc, "dEmi") ||
    texto(doc, "DataEmissaoRps") ||
    "";
  const dataEmissao = formatarDataIso(rawData);

  // 5. Valor Total
  const totalIcms = doc.getElementsByTagName("ICMSTot")[0];
  const valoresNfse = doc.getElementsByTagName("valores")[0] || doc.getElementsByTagName("Valores")[0];
  const vServPrest = doc.getElementsByTagName("vServPrest")[0];

  const rawValor =
    texto(totalIcms, "vNF") ||
    texto(valoresNfse, "vLiq") ||
    texto(vServPrest, "vServ") ||
    texto(valoresNfse, "vServ") ||
    texto(doc, "ValorServicos") ||
    texto(doc, "vLiq") ||
    texto(doc, "vServ") ||
    texto(doc, "vNF") ||
    texto(doc, "ValorLiquidoNfse") ||
    texto(doc, "vOrig") ||
    "0";
  const valorTotal = numero(rawValor);

  // 6. Emitente (Prestador / Fornecedor)
  const emit = doc.getElementsByTagName("emit")[0];
  const prest = doc.getElementsByTagName("prest")[0];
  const prestadorServico = doc.getElementsByTagName("PrestadorServico")[0] || doc.getElementsByTagName("Prestador")[0];

  const emitente =
    texto(emit, "xNome") ||
    texto(prestadorServico, "RazaoSocial") ||
    texto(prestadorServico, "NomeFantasia") ||
    texto(emit, "xFant") ||
    texto(emit, "CNPJ") ||
    texto(prest, "CNPJ") ||
    texto(emit, "CPF") ||
    "Emitente";

  // 7. Destinatário (Tomador / Cliente)
  const dest = doc.getElementsByTagName("dest")[0];
  const toma = doc.getElementsByTagName("toma")[0];
  const tomadorServico = doc.getElementsByTagName("TomadorServico")[0] || doc.getElementsByTagName("Tomador")[0];

  const destinatario =
    texto(toma, "xNome") ||
    texto(dest, "xNome") ||
    texto(tomadorServico, "RazaoSocial") ||
    texto(tomadorServico, "NomeFantasia") ||
    texto(toma, "xFant") ||
    texto(dest, "xFant") ||
    texto(toma, "CNPJ") ||
    texto(dest, "CNPJ") ||
    texto(toma, "CPF") ||
    texto(dest, "CPF") ||
    "Destinatário";

  const ehMinhaEmpresa = (textoOuCnpj: string) => {
    if (!textoOuCnpj) return false;
    const limpo = textoOuCnpj.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      limpo.includes("31649330") ||
      limpo.includes("guilhermerenan") ||
      limpo.includes("nascimentosistema") ||
      limpo.includes("07427684907")
    );
  };

  const emitenteCnpj = texto(emit, "CNPJ") || texto(prest, "CNPJ");
  const emitenteSouEu =
    ehMinhaEmpresa(emitente) ||
    ehMinhaEmpresa(emitenteCnpj) ||
    ehMinhaEmpresa(texto(prestadorServico, "RazaoSocial"));

  const isNfse = Boolean(texto(doc, "nNFSe") || texto(doc, "infNFSe") || texto(doc, "infDPS"));
  const tipoSugerido: "compra" | "emitida" = emitenteSouEu || isNfse ? "emitida" : "compra";
  const fornecedor = tipoSugerido === "emitida" ? destinatario : emitente;

  // 8. Itens / Produtos / Serviços
  const itens: ItemXml[] = [];

  // 8.1 Verifica se é NF-e com tags <det><prod>
  let dets = Array.from(doc.getElementsByTagName("det"));
  if (dets.length === 0) {
    const all = Array.from(doc.getElementsByTagName("*"));
    dets = all.filter((el) => (el.localName || el.nodeName).toLowerCase().endsWith("det") && el.getElementsByTagName("prod").length > 0);
  }

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

  // 8.2 Se não tiver tags <det><prod>, extrai da NFS-e (<serv>, <cServ>, <xDescServ>, <Discriminacao>, etc.)
  if (itens.length === 0) {
    const serv = doc.getElementsByTagName("serv")[0] || doc.getElementsByTagName("Servico")[0] || doc;
    const descServico =
      texto(serv, "xDescServ") ||
      texto(doc, "xDescServ") ||
      texto(doc, "Discriminacao") ||
      texto(doc, "DiscriminacaoServico") ||
      texto(doc, "xTribNac") ||
      texto(doc, "xNBS") ||
      "Prestação de Serviços";

    const codServico =
      texto(serv, "cTribNac") ||
      texto(doc, "cTribNac") ||
      texto(serv, "cNBS") ||
      texto(doc, "cNBS") ||
      texto(doc, "ItemListaServico") ||
      texto(doc, "cServ") ||
      "SRV-01";

    // Se houver múltiplas linhas de serviço descritas com detalhes
    const linhasServico = descServico
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const descFormatada = linhasServico.join(" · ") || descServico;

    itens.push({
      codigo: codServico,
      produto: descFormatada,
      unidade: "un",
      quantidade: 1,
      valor_custo: valorTotal,
      valor_venda: valorTotal,
    });
  }

  // 9. Duplicatas e Boletos no XML (cobr -> dup ou dup avulsa)
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
    tipo_sugerido: tipoSugerido,
  };
}

