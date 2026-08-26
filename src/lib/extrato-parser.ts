export type ExtratoItem = {
  data: string; // YYYY-MM-DD
  descricao: string;
  contraparte?: string | null;
  valor: number;
  tipo: "entrada" | "saida";
  forma: "pix" | "dinheiro" | "boleto" | "cartao_credito" | "cartao_debito" | "ted" | "debito_automatico" | "tarifa" | "outro";
  categoria: string;
};

// Linhas a ignorar (saldos, cabeçalhos de extrato, limites, totais)
const IGNORE_PATTERNS = [
  /saldo\s+(anterior|atual|do\s+dia|dispon[ií]vel|final|bloqueado|provis[oó]rio|em\s+conta|projetado)/i,
  /^\s*sdo\s+(ant|atu|dia|fin)/i,
  /total\s+(de\s+)?(entradas?|sa[ií]das?|cr[eé]ditos?|d[eé]bitos?|lan[cç]amentos?)/i,
  /limite\s+(de\s+)?(cheque|cr[eé]dito|especial|conta)/i,
  /extrato\s+(de\s+)?(conta|mensal|consolidado|per[ií]odo|banc[aá]rio)/i,
  /per[ií]odo\s+de\s+\d/i,
  /ag[eê]ncia\s*:\s*\d+/i,
  /conta\s*(\s*corrente)?\s*:\s*\d+/i,
  /folha\s*\d+\s*\/\s*\d+/i,
  /p[aá]gina\s*\d+\s*(de|\/)\s*\d+/i,
  /lan[cç]amentos?\s+futuros?/i,
  /s\s*a\s*l\s*d\s*o/i,
];

function isIgnoredLine(line: string): boolean {
  return IGNORE_PATTERNS.some((p) => p.test(line));
}

function parseBrazilianNumber(str: string): number {
  if (!str) return 0;
  let clean = str.replace(/[R$\s+]/gi, "");
  // Se tem vírgula como decimal (ex: 1.234,56 ou 1234,56)
  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : Math.abs(n);
}

function formatarDataIso(dia: string, mes: string, ano?: string): string {
  const agora = new Date();
  const a = ano ? (ano.length === 2 ? `20${ano}` : ano) : String(agora.getFullYear());
  const m = mes.padStart(2, "0");
  const d = dia.padStart(2, "0");
  return `${a}-${m}-${d}`;
}

function detectarForma(desc: string): ExtratoItem["forma"] {
  const d = desc.toLowerCase();
  if (d.includes("pix")) return "pix";
  if (d.includes("ted") || d.includes("doc") || d.includes("transf") || d.includes("transferencia") || d.includes("transferência")) return "ted";
  if (d.includes("boleto") || d.includes("titulo") || d.includes("título") || d.includes("cobranca") || d.includes("cobrança") || d.includes("pagto elet")) return "boleto";
  if (d.includes("tarifa") || d.includes("taxa") || d.includes("pacote") || d.includes("encargo") || d.includes("iof") || d.includes("manutencao")) return "tarifa";
  if (d.includes("deb auto") || d.includes("deb.auto") || d.includes("debito automatico") || d.includes("débito automático")) return "debito_automatico";
  if (d.includes("cartao") || d.includes("cartão") || d.includes("visa") || d.includes("master") || d.includes("elo") || d.includes("compra")) {
    if (d.includes("debito") || d.includes("débito") || d.includes("deb")) return "cartao_debito";
    return "cartao_credito";
  }
  if (d.includes("dinheiro") || d.includes("especie") || d.includes("espécie") || d.includes("saque")) return "dinheiro";
  return "outro";
}

function detectarCategoria(desc: string, tipo: "entrada" | "saida"): string {
  const d = desc.toLowerCase();
  if (d.includes("tarifa") || d.includes("taxa") || d.includes("iof") || d.includes("manut") || d.includes("bco")) return "tarifas";
  if (d.includes("das ") || d.includes("darf") || d.includes("gps") || d.includes("fgts") || d.includes("imposto") || d.includes("tributo") || d.includes("simples nacional")) return "impostos";
  if (d.includes("salario") || d.includes("salário") || d.includes("folha") || d.includes("pro labore") || d.includes("pró-labore") || d.includes("adiantamento") || d.includes("pagto funcionario")) return "pessoal";
  if (d.includes("posto") || d.includes("combustivel") || d.includes("combustível") || d.includes("gasolina") || d.includes("etanol") || d.includes("diesel") || d.includes("shell") || d.includes("ipiranga") || d.includes("petrobras") || d.includes("auto posto")) return "combustivel";
  if (d.includes("aluguel") || d.includes("condominio") || d.includes("condomínio") || d.includes("iptu") || d.includes("imobiliaria")) return "aluguel";
  if (d.includes("fornecedor") || d.includes("distribuidora") || d.includes("intelbras") || d.includes("hikvision") || d.includes("seguranca") || d.includes("eletronica") || d.includes("eletro") || d.includes("cameras") || d.includes("cabos")) return "fornecedores";
  if (tipo === "entrada") {
    if (d.includes("rend") || d.includes("juros") || d.includes("poupanca") || d.includes("cdb")) return "rendimentos";
    if (d.includes("servico") || d.includes("serviço") || d.includes("instalacao") || d.includes("instalação") || d.includes("manutencao") || d.includes("manutenção")) return "servicos";
    return "vendas";
  }
  return "outros";
}

function extrairContraparte(desc: string): string | null {
  // Procura por nomes após "PIX RECEBIDO - ", "PAGTO PIX ", "TED - ", etc.
  const pixMatch = desc.match(/(?:pix\s*(?:recebido|enviado|transf|de|para)?\s*[-:]?\s*)([A-ZÀ-Úa-zà-ú0-9\s]{3,40})/i);
  if (pixMatch && pixMatch[1] && !/^\d+$/.test(pixMatch[1].trim())) {
    const nome = pixMatch[1].replace(/cpf|cnpj|\d{11,}|\d{2}\.\d{3}/gi, "").trim();
    if (nome.length > 2) return nome;
  }
  const tedMatch = desc.match(/(?:ted|doc|transf(?:erencia)?)\s*[-:]?\s*([A-ZÀ-Úa-zà-ú0-9\s]{3,40})/i);
  if (tedMatch && tedMatch[1] && !/^\d+$/.test(tedMatch[1].trim())) {
    const nome = tedMatch[1].replace(/cpf|cnpj|\d{11,}|\d{2}\.\d{3}/gi, "").trim();
    if (nome.length > 2) return nome;
  }
  return null;
}

/**
 * Parser determinístico de extrato bancário em texto (PDF/OFX).
 * Suporta formatos de bancos brasileiros (BB, Bradesco, Itaú, Santander, Caixa, Nubank, Inter, Sicredi, Sicoob, C6, etc.).
 */
export function extrairLancamentosDeterministicos(texto: string): ExtratoItem[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const itens: ExtratoItem[] = [];

  // Padrão de data brasileira: DD/MM/YYYY ou DD/MM/YY ou DD/MM
  // Padrão de valor: 1.234,56 ou R$ 1.234,56 com indicador C/D ou +/-
  for (let idx = 0; idx < linhas.length; idx++) {
    const linha = linhas[idx];
    if (isIgnoredLine(linha)) continue;

    // Busca data no início ou meio da linha
    const dataMatch = linha.match(/(?:^|\s)(\d{2})[\/\.-](\d{2})(?:[\/\.-](\d{2,4}))?(?:\s|$)/);
    if (!dataMatch) continue;

    const [, dia, mes, ano] = dataMatch;
    const dataIso = formatarDataIso(dia, mes, ano);

    // Remove a data da linha para analisar o resto
    const resto = linha.replace(dataMatch[0], " ").trim();
    if (!resto || isIgnoredLine(resto)) continue;

    // Busca valores monetários no resto da linha (ex: "R$ 1.500,00 D", " -150,00", "3.450,20 C", "100,00-", "50,00+")
    // Expressão flexível para capturar valores
    const valorMatches = [
      ...resto.matchAll(/(?:R\$\s*)?([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*([CDcd\+\-])?/g),
    ];

    if (valorMatches.length === 0) continue;

    // Pega o último valor encontrado na linha (geralmente é o valor da transação no extrato, antes de eventual saldo)
    // Se tiver mais de um valor na linha e um for saldo, o primeiro costuma ser a transação
    const matchEscolhido = valorMatches.length > 1 ? valorMatches[0] : valorMatches[0];
    const valorStr = matchEscolhido[1];
    const flagStr = (matchEscolhido[2] || "").toUpperCase();
    const valor = parseBrazilianNumber(valorStr);

    if (valor <= 0) continue;

    // Determinar se é entrada (crédito) ou saída (débito)
    let tipo: "entrada" | "saida" = "saida";

    const linhaLower = linha.toLowerCase();
    const isCreditoText =
      linhaLower.includes("crédito") ||
      linhaLower.includes("credito") ||
      linhaLower.includes("recebid") ||
      linhaLower.includes("depósito") ||
      linhaLower.includes("deposito") ||
      linhaLower.includes("estorno") ||
      linhaLower.includes("resgate") ||
      linhaLower.includes("rendimento") ||
      linhaLower.includes("salário") ||
      linhaLower.includes("salario") ||
      linhaLower.includes("ted e") ||
      linhaLower.includes("pix e") ||
      linhaLower.includes("créd.");

    const isDebitoText =
      linhaLower.includes("débito") ||
      linhaLower.includes("debito") ||
      linhaLower.includes("pagamento") ||
      linhaLower.includes("pgto") ||
      linhaLower.includes("pagto") ||
      linhaLower.includes("compra") ||
      linhaLower.includes("tarifa") ||
      linhaLower.includes("taxa") ||
      linhaLower.includes("iof") ||
      linhaLower.includes("saque") ||
      linhaLower.includes("boleto") ||
      linhaLower.includes("ted s") ||
      linhaLower.includes("pix s") ||
      linhaLower.includes("deb auto") ||
      linhaLower.includes("deb.");

    if (flagStr === "C" || flagStr === "+" || valorStr.startsWith("+")) {
      tipo = "entrada";
    } else if (flagStr === "D" || flagStr === "-" || valorStr.startsWith("-") || valorStr.endsWith("-")) {
      tipo = "saida";
    } else if (isCreditoText && !isDebitoText) {
      tipo = "entrada";
    } else if (isDebitoText) {
      tipo = "saida";
    } else {
      // Default: se não puder determinar, mas for positivo
      tipo = "saida";
    }

    // Limpa a descrição da linha removendo os valores monetários e números de controle excessivos
    let desc = resto
      .replace(matchEscolhido[0], "")
      .replace(/R\$\s*[\d\.,]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (desc.length < 2) {
      desc = tipo === "entrada" ? "Recebimento extrato" : "Pagamento extrato";
    }

    const contraparte = extrairContraparte(desc);
    const forma = detectarForma(desc);
    const categoria = detectarCategoria(desc, tipo);

    itens.push({
      data: dataIso,
      descricao: desc,
      contraparte,
      valor,
      tipo,
      forma,
      categoria,
    });
  }

  return itens;
}
