export type ExtratoItem = {
  data: string; // YYYY-MM-DD
  descricao: string;
  contraparte?: string | null;
  valor: number;
  tipo: "entrada" | "saida";
  forma: "pix" | "dinheiro" | "boleto" | "cartao_credito" | "cartao_debito" | "ted" | "debito_automatico" | "tarifa" | "outro";
  categoria: string;
};

// Padrões de linhas que devem ser ignoradas (cabeçalhos, saldos isolados, rodapés, limites)
const IGNORE_PATTERNS = [
  /^\s*(?:saldo\s+(?:anterior|atual|do\s+dia|dispon[ií]vel|final|em\s+conta|bloqueado|provis[oó]rio|projetado))/i,
  /^\s*sdo\s+(?:ant|atu|dia|fin)/i,
  /^\s*total\s+(?:de\s+)?(?:entradas?|sa[ií]das?|cr[eé]ditos?|d[eé]bitos?|lan[cç]amentos?)/i,
  /^\s*limite\s+(?:de\s+)?(?:cheque|cr[eé]dito|especial|conta)/i,
  /^\s*extrato\s+(?:de\s+)?(?:conta|mensal|consolidado|per[ií]odo|banc[aá]rio|simples)/i,
  /^\s*ag[eê]ncia\s*:\s*\d+/i,
  /^\s*conta\s*(?:\s*corrente)?\s*:\s*\d+/i,
  /^\s*folha\s*\d+\s*\/\s*\d+/i,
  /^\s*p[aá]gina\s*\d+\s*(?:de|\/)\s*\d+/i,
  /^\s*lan[cç]amentos?\s+futuros?/i,
  /^\s*s\s*a\s*l\s*d\s*o\s*$/i,
  /^\s*data\s+(?:do\s+)?(?:movimento|lan[cç]amento|lote|hist[oó]rico|doc|documento|valor|saldo)/i,
  /^\s*ouvidoria\s+banco/i,
  /^\s*central\s+de\s+atendimento/i,
];

const MESES_MAP: Record<string, string> = {
  jan: "01",
  janeiro: "01",
  fev: "02",
  fevereiro: "02",
  mar: "03",
  marco: "03",
  março: "03",
  abr: "04",
  abril: "04",
  mai: "05",
  maio: "05",
  jun: "06",
  junho: "06",
  jul: "07",
  julho: "07",
  ago: "08",
  agosto: "08",
  set: "09",
  setembro: "09",
  out: "10",
  outubro: "10",
  nov: "11",
  novembro: "11",
  dez: "12",
  dezembro: "12",
};

function isIgnoredLine(line: string): boolean {
  return IGNORE_PATTERNS.some((p) => p.test(line));
}

function parseBrazilianNumber(str: string): number {
  if (!str) return 0;
  let clean = str.replace(/[R$\s+()]/gi, "");
  // Se contiver sinal de menos no final (ex: "150,00-")
  clean = clean.replace(/-$/, "");
  // Se tem vírgula como decimal (ex: 1.234,56 ou 1234,56)
  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : Math.abs(n);
}

function detectarAnoNoTexto(texto: string): string {
  // Procura por ano no formato 202X em cabeçalhos (ex: "Período: 01/01/2024 a 31/01/2024" ou "Extrato 2025")
  const match = texto.match(/(?:per[ií]odo|extrato|emiss[aã]o|ano|m[eê]s)[^\n]{0,50}(202[0-9])/i);
  if (match && match[1]) {
    return match[1];
  }
  // Segunda tentativa: qualquer ano 2020..2030 nos primeiros 2000 caracteres
  const matchAnoGeral = texto.slice(0, 2000).match(/\b(202[0-9]|203[0-5])\b/);
  if (matchAnoGeral && matchAnoGeral[1]) {
    return matchAnoGeral[1];
  }
  return String(new Date().getFullYear());
}

function formatarDataIso(dia: string, mes: string, ano?: string, anoFallback?: string): string {
  let a = ano ? (ano.length === 2 ? `20${ano}` : ano) : (anoFallback || String(new Date().getFullYear()));
  if (!/^\d{4}$/.test(a)) a = String(new Date().getFullYear());

  let m = mes.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (MESES_MAP[m]) {
    m = MESES_MAP[m];
  } else {
    m = m.padStart(2, "0");
  }

  const d = dia.padStart(2, "0");
  return `${a}-${m}-${d}`;
}

function detectarForma(desc: string): ExtratoItem["forma"] {
  const d = desc.toLowerCase();
  if (d.includes("pix")) return "pix";
  if (d.includes("ted") || d.includes("doc") || d.includes("transf") || d.includes("transferencia") || d.includes("transferência") || d.includes("tbi")) return "ted";
  if (d.includes("boleto") || d.includes("titulo") || d.includes("título") || d.includes("cobranca") || d.includes("cobrança") || d.includes("pagto elet") || d.includes("pagamento titulo") || d.includes("convenio")) return "boleto";
  if (d.includes("tarifa") || d.includes("taxa") || d.includes("pacote") || d.includes("encargo") || d.includes("iof") || d.includes("manutencao") || d.includes("anuidade")) return "tarifa";
  if (d.includes("deb auto") || d.includes("deb.auto") || d.includes("debito automatico") || d.includes("débito automático")) return "debito_automatico";
  if (d.includes("cartao") || d.includes("cartão") || d.includes("visa") || d.includes("master") || d.includes("elo") || d.includes("compra") || d.includes("rshop") || d.includes("pos ")) {
    if (d.includes("debito") || d.includes("débito") || d.includes("deb") || d.includes("rshop")) return "cartao_debito";
    return "cartao_credito";
  }
  if (d.includes("dinheiro") || d.includes("especie") || d.includes("espécie") || d.includes("saque") || d.includes("dep.dinheiro")) return "dinheiro";
  return "outro";
}

function detectarCategoria(desc: string, tipo: "entrada" | "saida"): string {
  const d = desc.toLowerCase();
  if (d.includes("tarifa") || d.includes("taxa") || d.includes("iof") || d.includes("manut") || d.includes("bco") || d.includes("anuidade")) return "tarifas";
  if (d.includes("das ") || d.includes("darf") || d.includes("gps") || d.includes("fgts") || d.includes("imposto") || d.includes("tributo") || d.includes("simples nacional") || d.includes("inss") || d.includes("receita federal") || d.includes("prefeitura") || d.includes("iptu") || d.includes("issqn")) return "impostos";
  if (d.includes("salario") || d.includes("salário") || d.includes("folha") || d.includes("pro labore") || d.includes("pró-labore") || d.includes("adiantamento") || d.includes("pagto funcionario") || d.includes("vale transporte") || d.includes("vale refeicao") || d.includes("rescisao")) return "pessoal";
  if (d.includes("posto") || d.includes("combustivel") || d.includes("combustível") || d.includes("gasolina") || d.includes("etanol") || d.includes("diesel") || d.includes("shell") || d.includes("ipiranga") || d.includes("petrobras") || d.includes("auto posto") || d.includes("abastec")) return "combustivel";
  if (d.includes("aluguel") || d.includes("condominio") || d.includes("condomínio") || d.includes("imobiliaria") || d.includes("locacao") || d.includes("locação")) return "aluguel";
  if (d.includes("fornecedor") || d.includes("distribuidora") || d.includes("intelbras") || d.includes("hikvision") || d.includes("seguranca") || d.includes("eletronica") || d.includes("eletro") || d.includes("cameras") || d.includes("cabos") || d.includes("comercial") || d.includes("materiais")) return "fornecedores";
  if (d.includes("energia") || d.includes("copel") || d.includes("enel") || d.includes("cemig") || d.includes("cpfl") || d.includes("claro") || d.includes("vivo") || d.includes("tim") || d.includes("internet") || d.includes("agua") || d.includes("sanepar") || d.includes("sabesp")) return "utilidades";
  if (tipo === "entrada") {
    if (d.includes("rend") || d.includes("juros") || d.includes("poupanca") || d.includes("cdb") || d.includes("aplic") || d.includes("invest facil") || d.includes("dividend")) return "rendimentos";
    if (d.includes("servico") || d.includes("serviço") || d.includes("instalacao") || d.includes("instalação") || d.includes("manutencao") || d.includes("manutenção") || d.includes("conserto") || d.includes("suporte")) return "servicos";
    return "vendas";
  }
  return "outros";
}

function limparNomeContraparte(str: string): string {
  if (!str) return "";
  let s = str
    // Remove cabeçalhos e prefixos comuns de nomes
    .replace(/^(?:favorecido|destinat[aá]rio|pagador|remetente|cliente|benefici[aá]rio|nome|razao\s*social|raz[aã]o\s*social|para|de)\s*[-:]?\s*/i, " ")
    // Remove identificadores bancários e palavras-chave técnicas
    .replace(/(?:cpf|cnpj|chave\s*pix|aut|autenticacao|ag|cc|nr|doc|terminal|e2e|id)[\s:\.\-]*[a-zA-Z0-9\.\-\/]+/gi, " ")
    // Remove sequências numéricas espaçadas no início (ex: '55 349 398 MAYSON ROGERIO' -> raiz de CNPJ)
    .replace(/^\s*\d{2,3}(?:\s+\d{3}){1,3}\b\s*/g, " ")
    // Remove CPFs mascarados com asteriscos (ex: '***.374.241-**' ou '***374241**')
    .replace(/[\*xX]{2,}\.?[0-9\*xX]{2,}\.?[0-9\*xX]{2,}\-?[0-9\*xX]{2,}/g, " ")
    .replace(/\b\d{11,}\b/g, " ")
    .replace(/\b\d{2,3}\.\d{3}\.\d{3}[\/\.\-]\d{2,4}-\d{2}\b/g, " ")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/[\*\#\@]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Remove pontuação de bordas
  s = s.replace(/^[\s\-_:;,\.]+|[\s\-_:;,\.]+$/g, "");
  return s;
}

export function ehPalavraRuido(str: string): boolean {
  if (!str) return true;
  const s = str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  if (s.length < 2) return true;

  const ruidos = [
    "extrato",
    "saldo",
    "saldo anterior",
    "saldo atual",
    "saldo final",
    "saldo do dia",
    "tarifa",
    "tarifa bancaria",
    "tarifa pacote",
    "tarifa servicos",
    "taxa",
    "iof",
    "juros",
    "encargos",
    "rendimento",
    "rend facil",
    "invest facil",
    "aplicacao",
    "resgate",
    "deposito",
    "saque",
    "dinheiro",
    "debito",
    "credito",
    "transferencia",
    "pagamento",
    "recebimento",
    "cartao",
    "outros",
    "banco",
    "servico",
    "servicos",
    "lancamento",
    "transacao",
    "recebimento pix",
    "envio pix",
    "pix recebido",
    "pix enviado",
    "pix receb",
    "pix transf",
    "pix",
    "ted",
    "doc",
    "tev",
    "tbi",
    "doc pix",
    "doc. pix",
    "doc.: pix",
    "doc: pix",
    "receb outra if",
    "receb.outra if",
    "receb outra",
    "receb.outra",
    "transf outra if",
    "transf.outra if",
    "transf outra",
    "transf.outra",
    "outra if",
    "outra i.f.",
    "comp visa electro",
    "comp visa electron",
    "comp visa debito",
    "comp visa credito",
    "comp visa",
    "comp mastercard",
    "comp master",
    "comp elo",
    "compra cartao",
    "visa electro",
    "visa electron",
    "visa debito",
    "visa credito",
    "mastercard",
    "vencimento cheque especial",
    "vencimento cheque especial empresarial",
    "vencimento cheque especial empresarial:",
    "cheque especial",
    "cheque especial empresarial",
    "adiantamento depositante",
    "pagto eletron cobranca",
    "pagto eletron",
    "pagamento titulo",
    "pagto titulo",
    "cobranca bancaria",
    "debito automatico",
    "deb auto",
    "autenticacao",
    "comprovante",
    "terminal",
    "historico",
    "descricao",
    "documento",
    "valor",
    "data",
  ];

  if (ruidos.includes(s)) return true;

  // Prefixos / Padrões operacionais bancários que não são pessoas
  if (
    s.startsWith("receb.outra") ||
    s.startsWith("receb outra") ||
    s.startsWith("transf.outra") ||
    s.startsWith("transf outra") ||
    s.startsWith("comp visa") ||
    s.startsWith("comp master") ||
    s.startsWith("comp elo") ||
    s.startsWith("compra ") ||
    s.startsWith("comp ") ||
    s.startsWith("vencimento cheque") ||
    s.startsWith("vencimento ") ||
    s.startsWith("cheque especial") ||
    s.startsWith("tarifa ") ||
    s.startsWith("taxa ") ||
    s.startsWith("pagto eletron") ||
    s.startsWith("doc.") ||
    s.startsWith("doc:") ||
    s.startsWith("doc ") ||
    s.startsWith("chave:") ||
    s.startsWith("chave pix") ||
    s.startsWith("autentic") ||
    s.startsWith("aut:") ||
    s.startsWith("terminal") ||
    s.startsWith("agencia") ||
    s.startsWith("conta:") ||
    s.startsWith("saldo ")
  ) {
    return true;
  }

  return false;
}

/**
 * Verifica se uma linha textual de extrato representa o Nome de uma Pessoa / Razão Social.
 */
export function identificarNomeContraparteLinha(linha: string): string | null {
  if (!linha || linha.trim().length < 3) return null;
  const limpo = limparNomeContraparte(linha);
  if (!limpo || limpo.length < 3) return null;
  if (/^\d+$/.test(limpo)) return null;
  if (ehPalavraRuido(limpo)) return null;

  const limpoLower = limpo.toLowerCase();
  // Se a linha começar com termos de pagamento (ex: 'pagto Edivaldo interfone', 'pagamento fatura')
  if (
    limpoLower.startsWith("pagto ") ||
    limpoLower.startsWith("pgto ") ||
    limpoLower.startsWith("pagamento ") ||
    limpoLower.startsWith("compra ") ||
    limpoLower.startsWith("tarifa ") ||
    limpoLower.startsWith("taxa ") ||
    limpoLower.startsWith("recarga ") ||
    limpoLower.startsWith("ref: ") ||
    limpoLower.startsWith("msg: ")
  ) {
    return null;
  }

  // Verifica se tem caracteres alfabéticos suficientes (> 40% alfabético)
  const letras = limpo.replace(/[^a-zA-ZÀ-Úà-ú]/g, "").length;
  if (letras < 3 || letras / limpo.length < 0.4) return null;

  return limpo;
}

export function extrairContraparte(desc: string): string | null {
  if (!desc || desc.trim().length < 3) return null;
  const texto = desc.trim();

  // Se o texto inteiro for ruído/operação bancária, retorna null imediatamente
  if (ehPalavraRuido(texto)) return null;

  // 1. Padrões com marcadores explícitos de extratos brasileiros
  const padroes = [
    /(?:favorecido|destinat[aá]rio|pagador|remetente|cliente|benefici[aá]rio|para|de)\s*[-:]?\s*([A-ZÀ-Úa-zà-ú0-9\s\.\-]{3,60})/i,
    /(?:pix\s*(?:recebido|enviado|transf)\s+(?:de|para)\s*[-:]?\s*)([A-ZÀ-Úa-zà-ú0-9\s\.\-]{3,50})/i,
    /(?:ted|doc|tev|transf(?:erencia)?)\s+(?:de|para)\s*[-:]?\s*([A-ZÀ-Úa-zà-ú0-9\s\.\-]{3,50})/i,
    /(?:pagto|pagamento|pgto)\s+(?:de|para)\s+([A-ZÀ-Úa-zà-ú\s]{3,40})/i,
    /(?:os\s*#?\d+\s*[-–—]\s*)([A-ZÀ-Úa-zà-ú0-9\s\.\-]{3,50})/i,
  ];

  for (const padrao of padroes) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      const nome = identificarNomeContraparteLinha(match[1]);
      if (nome) return nome;
    }
  }

  // 2. Se a descrição contiver separador com nome real: "Manutenção CFTV - Condomínio Solar"
  if (texto.includes(" - ") || texto.includes(" – ") || texto.includes(" — ")) {
    const partes = texto.split(/\s+[-–—]\s+/);
    const ultimaParte = partes[partes.length - 1];
    const nomeLimpo = identificarNomeContraparteLinha(ultimaParte);
    if (nomeLimpo && !ehPalavraRuido(nomeLimpo)) return nomeLimpo;
  }

  return null;
}

/**
 * Parser determinístico e resiliente de extrato bancário em texto estruturado.
 * Suporta formatos de todos os bancos brasileiros (BB, Bradesco, Itaú, Santander, Caixa,
 * Nubank, Inter, Sicredi, Sicoob, C6, Stone, PagBank, Mercado Pago, etc.).
 */
export function extrairLancamentosDeterministicos(texto: string): ExtratoItem[] {
  if (!texto || texto.trim().length === 0) return [];

  const anoPadrao = detectarAnoNoTexto(texto);
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const itens: ExtratoItem[] = [];

  // Expressão regular ampla para captura de datas
  // DD/MM/YYYY, DD/MM/YY, DD/MM, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, DD MMM YYYY, DD MMM
  const REGEX_DATA =
    /(?:^|\s)(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?|(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+(?:de\s+)?(\d{2,4}))?)(?:\s|$)/i;

  // Expressão para capturar valores monetários brasileiros
  // Exemplos: "1.234,56 D", "50,00+", "-150,00", "R$ 3.450,20 C", "100,00 (D)", "2.500,00"
  const REGEX_VALOR =
    /(?:R\$\s*)?([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{1,3}(?:\.\d{3})*\.\d{2})\s*(?:\(?([CDcd\+\-])\)?)?/g;

  for (let idx = 0; idx < linhas.length; idx++) {
    const linha = linhas[idx];
    if (isIgnoredLine(linha)) continue;

    const dataMatch = linha.match(REGEX_DATA);
    if (!dataMatch) {
      // Linha sem data: pode ser detalhe (favorecido / chave pix) do lançamento anterior
      if (itens.length > 0) {
        const linhaLower = linha.toLowerCase();
        if (
          linhaLower.startsWith("favorecido") ||
          linhaLower.startsWith("remetente") ||
          linhaLower.startsWith("pagador") ||
          linhaLower.startsWith("destinatario") ||
          linhaLower.startsWith("destinatário") ||
          linhaLower.startsWith("chave pix") ||
          linhaLower.startsWith("cpf/cnpj") ||
          linhaLower.startsWith("banco")
        ) {
          const ult = itens[itens.length - 1];
          const contra = extrairContraparte(linha);
          if (contra && !ult.contraparte) {
            ult.contraparte = contra;
          }
          if (linha.length < 80) {
            ult.descricao = `${ult.descricao} · ${linha}`.slice(0, 150);
          }
        }
      }
      continue;
    }

    // Identifica e formata a data
    let dataIso = "";
    if (dataMatch[1] && dataMatch[2] && dataMatch[3]) {
      // YYYY-MM-DD
      dataIso = `${dataMatch[1]}-${dataMatch[2]}-${dataMatch[3]}`;
    } else if (dataMatch[4] && dataMatch[5]) {
      // DD/MM ou DD/MM/YYYY
      dataIso = formatarDataIso(dataMatch[4], dataMatch[5], dataMatch[6], anoPadrao);
    } else if (dataMatch[7] && dataMatch[8]) {
      // DD MMM ou DD MMM YYYY
      dataIso = formatarDataIso(dataMatch[7], dataMatch[8], dataMatch[9], anoPadrao);
    }

    if (!dataIso) continue;

    // Remove a data da linha para analisar histórico e valores
    const resto = linha.replace(dataMatch[0], " ").trim();
    if (!resto || isIgnoredLine(resto)) continue;

    // Captura todos os valores numéricos monetários presentes na linha
    const valorMatches = [...resto.matchAll(REGEX_VALOR)];
    if (valorMatches.length === 0) {
      // Se não encontrou valor nesta linha, verifica se o valor está na linha imediatamente seguinte
      if (idx + 1 < linhas.length) {
        const proxLinha = linhas[idx + 1];
        const proxValores = [...proxLinha.matchAll(REGEX_VALOR)];
        if (proxValores.length > 0 && !proxLinha.match(REGEX_DATA)) {
          // Usa a linha seguinte como portadora do valor
          const matchEsc = proxValores[0];
          const vNum = parseBrazilianNumber(matchEsc[1]);
          if (vNum > 0) {
            const flag = (matchEsc[2] || "").toUpperCase();
            let tp: "entrada" | "saida" = "saida";
            if (flag === "C" || flag === "+" || matchEsc[1].startsWith("+") || resto.toLowerCase().includes("crédito") || resto.toLowerCase().includes("receb")) {
              tp = "entrada";
            }
            const descLimpa = resto.replace(/\s+/g, " ").trim();
            itens.push({
              data: dataIso,
              descricao: descLimpa || (tp === "entrada" ? "Recebimento extrato" : "Pagamento extrato"),
              contraparte: extrairContraparte(descLimpa),
              valor: vNum,
              tipo: tp,
              forma: detectarForma(descLimpa),
              categoria: detectarCategoria(descLimpa, tp),
            });
            idx++; // Avança a linha consumida
            continue;
          }
        }
      }
      continue;
    }

    // Se houver 2 ou mais valores na linha (ex: [Valor da Transação] [Saldo]):
    // O valor da transação é o primeiro montante encontrado.
    const matchEscolhido = valorMatches[0];
    const valorStr = matchEscolhido[1];
    const flagStr = (matchEscolhido[2] || "").toUpperCase();
    const valor = parseBrazilianNumber(valorStr);

    if (valor <= 0) continue;

    const linhaLower = linha.toLowerCase();

    // Indicadores explícitos de crédito / entrada
    const isCreditoText =
      linhaLower.includes("crédito") ||
      linhaLower.includes("credito") ||
      linhaLower.includes("recebid") ||
      linhaLower.includes("recebimento") ||
      linhaLower.includes("depósito") ||
      linhaLower.includes("deposito") ||
      linhaLower.includes("estorno") ||
      linhaLower.includes("resgate") ||
      linhaLower.includes("rendimento") ||
      linhaLower.includes("rend facil") ||
      linhaLower.includes("salário") ||
      linhaLower.includes("salario") ||
      linhaLower.includes("ted e") ||
      linhaLower.includes("pix e") ||
      linhaLower.includes("pix rec") ||
      linhaLower.includes("ted r") ||
      linhaLower.includes("doc e") ||
      linhaLower.includes("venda ") ||
      linhaLower.includes("créd.") ||
      linhaLower.includes("cred.");

    // Indicadores explícitos de débito / saída
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
      linhaLower.includes("título") ||
      linhaLower.includes("titulo") ||
      linhaLower.includes("ted s") ||
      linhaLower.includes("pix s") ||
      linhaLower.includes("pix env") ||
      linhaLower.includes("deb auto") ||
      linhaLower.includes("deb.auto") ||
      linhaLower.includes("rshop") ||
      linhaLower.includes("sispag") ||
      linhaLower.includes("deb.");

    let tipo: "entrada" | "saida" = "saida";

    if (flagStr === "C" || flagStr === "+" || valorStr.startsWith("+")) {
      tipo = "entrada";
    } else if (flagStr === "D" || flagStr === "-" || valorStr.startsWith("-") || valorStr.endsWith("-")) {
      tipo = "saida";
    } else if (isCreditoText && !isDebitoText) {
      tipo = "entrada";
    } else if (isDebitoText) {
      tipo = "saida";
    } else {
      tipo = "saida";
    }

    // Limpa a descrição removendo os valores monetários e resíduos de saldos
    let desc = resto;
    for (const vm of valorMatches) {
      desc = desc.replace(vm[0], " ");
    }
    desc = desc
      .replace(/R\$\s*[\d\.,]+/gi, " ")
      .replace(/\b[CDcd]\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (desc.length < 2) {
      desc = tipo === "entrada" ? "Recebimento extrato" : "Pagamento extrato";
    }

    let contraparte = extrairContraparte(desc);
    let msgExtra: string | null = null;

    // Inspeciona as linhas seguintes (bloco de detalhes da transação) até o próximo registro com data
    let lookahead = idx + 1;
    while (lookahead < linhas.length) {
      const proxLinha = linhas[lookahead];
      if (isIgnoredLine(proxLinha)) {
        lookahead++;
        continue;
      }
      // Se a próxima linha contiver uma nova data, encerra o bloco atual
      const hasData = proxLinha.match(REGEX_DATA);
      const hasValor = [...proxLinha.matchAll(REGEX_VALOR)].length > 0;
      if (hasData && hasValor) {
        break;
      }

      const pLower = proxLinha.toLowerCase().trim();

      // Ajusta tipo se houver indicador claro nas linhas subsequentes
      if (pLower.includes("recebimento pix") || pLower.includes("pix recebido") || pLower.includes("transferencia recebida")) {
        tipo = "entrada";
      } else if (pLower.includes("envio pix") || pLower.includes("pix enviado") || pLower.includes("transferencia enviada")) {
        tipo = "saida";
      }

      // Procura pelo nome da pessoa / empresa na linha (ex: "55 349 398 MAYSON ROGERIO DE SOUZA" ou "ROZENEIDE GOMES FERREIRA")
      if (!contraparte) {
        const nomeEncontrado = identificarNomeContraparteLinha(proxLinha) || extrairContraparte(proxLinha);
        if (nomeEncontrado && !ehPalavraRuido(nomeEncontrado)) {
          contraparte = nomeEncontrado;
        }
      }

      // Procura por mensagem / observação do PIX (ex: "pagto Edivaldo interfone")
      if (!msgExtra && !ehPalavraRuido(proxLinha)) {
        if (
          pLower.startsWith("pagto ") ||
          pLower.startsWith("pgto ") ||
          pLower.startsWith("pagamento ") ||
          pLower.startsWith("ref: ") ||
          pLower.startsWith("ref ") ||
          pLower.startsWith("msg: ") ||
          pLower.startsWith("mensagem: ")
        ) {
          msgExtra = proxLinha.replace(/^(?:ref|msg|mensagem)[\s:\.\-]+/i, "").trim();
        }
      }

      lookahead++;
    }

    // Normaliza descrição e anexa observações se houver
    let descFinal = desc;
    if (msgExtra && !descFinal.toLowerCase().includes(msgExtra.toLowerCase())) {
      descFinal = `${descFinal} · ${msgExtra}`.slice(0, 150);
    }

    // Garante que a contraparte nunca seja ruído ou operação bancária
    if (contraparte && ehPalavraRuido(contraparte)) {
      contraparte = null;
    }

    const forma = detectarForma(desc + " " + (msgExtra || ""));
    const categoria = detectarCategoria(descFinal + " " + (contraparte || ""), tipo);

    itens.push({
      data: dataIso,
      descricao: descFinal,
      contraparte: contraparte || null,
      valor,
      tipo,
      forma,
      categoria,
    });
  }

  return itens;
}

