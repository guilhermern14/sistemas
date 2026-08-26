import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";

// -------------------------------------------------------------
// JWT Configuration
// -------------------------------------------------------------

const SECRET =
  process.env.JWT_SECRET ||
  "_ek7lFVuiIXLetxso83bLunmJp2xJA83XRUGUcsODUsJDAQ3Tqy8w2gIPEeQNQX1";
const ACCESS_EXP_SECONDS = 60 * 60; // 1 hour
const REFRESH_EXP_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function signAccessToken(user: any) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: "authenticated",
      user_metadata: user.raw_user_meta_data || {},
      app_metadata: { provider: "email" },
    },
    SECRET,
    { expiresIn: ACCESS_EXP_SECONDS }
  );
}

export function signRefreshToken(user: any) {
  return jwt.sign(
    {
      sub: user.id,
      type: "refresh",
    },
    SECRET,
    { expiresIn: REFRESH_EXP_SECONDS }
  );
}

export function verifyToken(token: string): any {
  return jwt.verify(token, SECRET);
}

// -------------------------------------------------------------
// Database & Mock In-Memory Store
// -------------------------------------------------------------

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage-data");
const DB_FILE = path.join(STORAGE_DIR, "db.json");

try {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
} catch {}

let pool: any = null;
let useRealDb = false;

if (process.env.DATABASE_URL) {
  try {
    const { Pool } = pg;
    const parsed = new URL(process.env.DATABASE_URL);
    if (process.env.APP_DB_USER) parsed.username = process.env.APP_DB_USER;
    if (process.env.APP_DB_PASSWORD) parsed.password = process.env.APP_DB_PASSWORD;
    pool = new Pool({ connectionString: parsed.toString() });
    pool.on("error", (err: any) => {
      console.warn("[PostgreSQL] Pool error, fallback to memory:", err.message);
    });
    useRealDb = true;
  } catch (err: any) {
    console.warn("[PostgreSQL] Unable to initialize, fallback to memory:", err.message);
    useRealDb = false;
  }
}

const nowIso = () => new Date().toISOString();

const initialMockData: Record<string, any[]> = {
  "auth.users": [
    {
      id: "u-admin-001",
      email: "admin@nascimento.com",
      encrypted_password: bcrypt.hashSync("admin123", 10),
      raw_user_meta_data: { nome: "Administrador Nascimento" },
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "u-atendente-002",
      email: "atendente@nascimento.com",
      encrypted_password: bcrypt.hashSync("admin123", 10),
      raw_user_meta_data: { nome: "Mariana Costa" },
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "u-campo-003",
      email: "campo@nascimento.com",
      encrypted_password: bcrypt.hashSync("admin123", 10),
      raw_user_meta_data: { nome: "Carlos Silva (Técnico)" },
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "u-financeiro-004",
      email: "financeiro@nascimento.com",
      encrypted_password: bcrypt.hashSync("admin123", 10),
      raw_user_meta_data: { nome: "Juliana Santos (Financeiro)" },
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ],
  profiles: [
    { id: "u-admin-001", nome: "Administrador Nascimento", telefone: "(11) 98765-4321", created_at: nowIso() },
    { id: "u-atendente-002", nome: "Mariana Costa", telefone: "(11) 97654-3210", created_at: nowIso() },
    { id: "u-campo-003", nome: "Carlos Silva (Técnico)", telefone: "(11) 96543-2109", created_at: nowIso() },
    { id: "u-financeiro-004", nome: "Juliana Santos (Financeiro)", telefone: "(11) 95432-1098", created_at: nowIso() },
  ],
  user_roles: [
    { id: "ur-1", user_id: "u-admin-001", role: "admin" },
    { id: "ur-2", user_id: "u-atendente-002", role: "atendente" },
    { id: "ur-3", user_id: "u-campo-003", role: "campo" },
    { id: "ur-4", user_id: "u-financeiro-004", role: "financeiro" },
  ],
  clientes: [
    {
      id: "c-001",
      nome: "Condomínio Residencial Parque das Flores",
      cpf_cnpj: "12.345.678/0001-90",
      telefone: "(11) 3456-7890",
      email: "sindico@parquedasflores.com.br",
      endereco: "Av. Paulista, 1500",
      numero: "1500",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      observacoes: "Portaria 24h, agendar visitas com antecedência.",
      created_by: "u-admin-001",
      created_at: "2026-08-01T10:00:00.000Z",
    },
    {
      id: "c-002",
      nome: "Supermercado Boa Vista Ltda",
      cpf_cnpj: "98.765.432/0001-10",
      telefone: "(11) 99887-1122",
      email: "contato@superboavista.com.br",
      endereco: "Rua do Comércio, 340",
      numero: "340",
      bairro: "Centro",
      cidade: "São Paulo",
      observacoes: "Manutenção periódica nas 16 câmeras e alarme perimetral.",
      created_by: "u-admin-001",
      created_at: "2026-08-05T14:30:00.000Z",
    },
    {
      id: "c-003",
      nome: "Dr. Roberto Martins - Clínica Odontológica",
      cpf_cnpj: "321.654.987-00",
      telefone: "(11) 98123-4567",
      email: "roberto@clinicaroberto.med.br",
      endereco: "Rua Vergueiro, 890",
      numero: "Conj 42",
      bairro: "Vila Mariana",
      cidade: "São Paulo",
      observacoes: "Instalação de interfonia e controle de acesso biométrico.",
      created_by: "u-admin-001",
      created_at: "2026-08-10T09:15:00.000Z",
    },
  ],
  estoque: [
    {
      id: "e-001",
      codigo: "CAM-IP4M",
      produto: "Câmera Bullet IP 4MP Infravermelho 30m Intelbras",
      quantidade: 18,
      unidade: "UN",
      valor_custo: 185.0,
      valor_venda: 320.0,
      observacoes: "Resolução 2K com visão noturna inteligente",
      created_at: "2026-08-01T08:00:00.000Z",
    },
    {
      id: "e-002",
      codigo: "DVR-8CH",
      produto: "Gravador Digital DVR 8 Canais Full HD 1080p",
      quantidade: 7,
      unidade: "UN",
      valor_custo: 340.0,
      valor_venda: 590.0,
      observacoes: "Suporta HD até 8TB",
      created_at: "2026-08-01T08:00:00.000Z",
    },
    {
      id: "e-003",
      codigo: "SEN-IVP",
      produto: "Sensor de Presença Infravermelho Passivo Pet",
      quantidade: 35,
      unidade: "UN",
      valor_custo: 45.0,
      valor_venda: 89.0,
      observacoes: "Imune a animais até 20kg",
      created_at: "2026-08-01T08:00:00.000Z",
    },
    {
      id: "e-004",
      codigo: "CEN-CHOQ",
      produto: "Central de Choque para Cerca Elétrica 18.000V",
      quantidade: 4,
      unidade: "UN",
      valor_custo: 280.0,
      valor_venda: 490.0,
      observacoes: "Com arme/desarme por controle e Wi-Fi",
      created_at: "2026-08-01T08:00:00.000Z",
    },
    {
      id: "e-005",
      codigo: "CAB-COAX",
      produto: "Cabo Coaxial HD 4mm Bipolar 100m",
      quantidade: 12,
      unidade: "RL",
      valor_custo: 95.0,
      valor_venda: 160.0,
      observacoes: "95% de malha de cobre",
      created_at: "2026-08-01T08:00:00.000Z",
    },
    {
      id: "e-006",
      codigo: "BAT-12V7A",
      produto: "Bateria Selada VRLA 12V 7Ah para Alarme e Cerca",
      quantidade: 22,
      unidade: "UN",
      valor_custo: 68.0,
      valor_venda: 120.0,
      observacoes: "Unipower / Moura",
      created_at: "2026-08-01T08:00:00.000Z",
    },
  ],
  servicos: [
    {
      id: "s-001",
      numero_pedido: 101,
      cliente_id: "c-001",
      tipo: "manutencao",
      status: "agendado",
      data_agendada: "2026-08-26",
      horas_mao_obra: 3,
      valor_mao_obra: 250.0,
      valor_bruto: 680.0,
      desconto: 30.0,
      valor: 650.0,
      descricao: "Substituição de 2 câmeras no estacionamento e verificação do DVR principal.",
      produtos_usados: "2x CAM-IP4M, 1x CAB-COAX",
      relatorio: null,
      tecnico_id: "u-campo-003",
      created_by: "u-admin-001",
      pos_venda: null,
      pos_venda_em: null,
      concluido_em: null,
      pago_em: null,
      created_at: "2026-08-20T11:00:00.000Z",
    },
    {
      id: "s-002",
      numero_pedido: 102,
      cliente_id: "c-002",
      tipo: "instalacao",
      status: "em_andamento",
      data_agendada: "2026-08-25",
      horas_mao_obra: 5,
      valor_mao_obra: 450.0,
      valor_bruto: 1450.0,
      desconto: 50.0,
      valor: 1400.0,
      descricao: "Instalação da nova central de choque e sensores perimetrais no depósito.",
      produtos_usados: "1x CEN-CHOQ, 4x SEN-IVP, 2x BAT-12V7A",
      relatorio: "Instalação iniciada. Passagem de cabos 80% concluída.",
      tecnico_id: "u-campo-003",
      created_by: "u-admin-001",
      pos_venda: null,
      pos_venda_em: null,
      concluido_em: null,
      pago_em: null,
      created_at: "2026-08-21T09:30:00.000Z",
    },
    {
      id: "s-003",
      numero_pedido: 103,
      cliente_id: "c-003",
      tipo: "orcamento",
      status: "pronto",
      data_agendada: "2026-08-22",
      horas_mao_obra: 2,
      valor_mao_obra: 180.0,
      valor_bruto: 820.0,
      desconto: 0.0,
      valor: 820.0,
      descricao: "Vistoria técnica para instalação de sistema de controle de acesso biométrico.",
      produtos_usados: null,
      relatorio: "Orçamento elaborado e aprovado pelo cliente.",
      tecnico_id: "u-campo-003",
      created_by: "u-atendente-002",
      pos_venda: null,
      pos_venda_em: null,
      concluido_em: "2026-08-22T16:00:00.000Z",
      pago_em: null,
      created_at: "2026-08-18T15:00:00.000Z",
    },
  ],
  servico_produtos: [
    {
      id: "sp-1",
      servico_id: "s-001",
      estoque_id: "e-001",
      produto: "Câmera Bullet IP 4MP Infravermelho 30m Intelbras",
      codigo: "CAM-IP4M",
      quantidade: 2,
      valor_unitario: 320.0,
      created_at: nowIso(),
    },
  ],
  servico_fotos: [],
  servico_centrais: [],
  financeiro_lancamentos: [
    {
      id: "f-001",
      data: "2026-08-20",
      tipo: "entrada",
      categoria: "servicos",
      descricao: "Pagamento OS #98 - Manutenção Alarme Condomínio Solar",
      valor: 850.0,
      forma: "pix",
      conta: "banco",
      contraparte: "Condomínio Solar",
      origem: "manual",
      observacoes: "Recebido via chave PIX CNPJ",
      created_by: "u-admin-001",
      created_at: "2026-08-20T16:00:00.000Z",
      updated_at: "2026-08-20T16:00:00.000Z",
    },
    {
      id: "f-002",
      data: "2026-08-18",
      tipo: "saida",
      categoria: "fornecedores",
      descricao: "Compra de cabos e conectores - Distribuidora SP",
      valor: 450.0,
      forma: "boleto",
      conta: "banco",
      contraparte: "Distribuidora SP de Segurança",
      origem: "manual",
      observacoes: "NF-e 4521",
      created_by: "u-financeiro-004",
      created_at: "2026-08-18T10:00:00.000Z",
      updated_at: "2026-08-18T10:00:00.000Z",
    },
  ],
  boletos: [
    {
      id: "b-001",
      fornecedor: "Distribuidora SP de Segurança",
      descricao: "Compra de cabos e conectores",
      valor: 450.0,
      vencimento: "2026-08-30",
      pago: false,
      pago_em: null,
      origem: "manual",
      estoque_entrada_ref: null,
      created_by: "u-financeiro-004",
      created_at: "2026-08-18T10:00:00.000Z",
    },
  ],
  notas_fiscais: [],
  notas_fiscais_itens: [],
  whatsapp_topicos: [
    {
      id: "wt-001",
      ordem: 1,
      pergunta: "Qual o horário de atendimento e funcionamento?",
      resposta:
        "Nosso atendimento comercial funciona de segunda a sexta, das 08h às 18h, e aos sábados das 08h às 12h. Atendimentos de emergência funcionam 24h para clientes com contrato de manutenção.",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "wt-002",
      ordem: 2,
      pergunta: "Como solicitar um orçamento de instalação?",
      resposta:
        "Para solicitar um orçamento sem compromisso, basta nos informar o endereço do imóvel e o tipo de sistema desejado (CFTV/Câmeras, Alarme, Cerca Elétrica, Interfonia ou Controle de Acesso). Agendaremos a visita técnica no melhor dia para você!",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "wt-003",
      ordem: 3,
      pergunta: "Quais as formas de pagamento aceitas?",
      resposta: "Aceitamos PIX, transferência bancária, boleto bancário e cartões de crédito em até 12x.",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ],
};

function loadMockDataFromDisk(): Record<string, any[]> {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const loaded = JSON.parse(content);
      return { ...initialMockData, ...loaded };
    }
  } catch (err: any) {
    console.warn("[Local Database] Error loading db.json:", err.message);
  }
  return { ...initialMockData };
}

export const mockData: Record<string, any[]> = loadMockDataFromDisk();

export function saveMockDataToDisk() {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(mockData, null, 2), "utf-8");
  } catch (err: any) {
    console.error("[Local Database] Error saving db.json:", err.message);
  }
}

function executeMockQuery(sql: string, values: any[] = []) {
  const trimmed = sql.trim();

  if (
    trimmed.startsWith("BEGIN") ||
    trimmed.startsWith("COMMIT") ||
    trimmed.startsWith("ROLLBACK") ||
    trimmed.startsWith("SET LOCAL") ||
    trimmed.includes("set_config")
  ) {
    return { rows: [], rowCount: 0 };
  }

  // Schema relationship inspection
  if (trimmed.includes("FROM pg_constraint")) {
    const table1 = values[0];
    const table2 = values[1];
    if (
      (table1 === "servicos" && table2 === "clientes") ||
      (table1 === "clientes" && table2 === "servicos")
    ) {
      return {
        rows: [{ origem: "servicos", coluna: "cliente_id", destino: "clientes", coluna_destino: "id" }],
        rowCount: 1,
      };
    }
    if (table1 === "servicos" && table2 === "servico_produtos") {
      return {
        rows: [{ origem: "servico_produtos", coluna: "servico_id", destino: "servicos", coluna_destino: "id" }],
        rowCount: 1,
      };
    }
    if (table1 === "servico_produtos" && table2 === "estoque") {
      return {
        rows: [{ origem: "servico_produtos", coluna: "estoque_id", destino: "estoque", coluna_destino: "id" }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  // auth.users queries
  if (trimmed.includes("auth.users")) {
    const list = mockData["auth.users"] || [];
    if (trimmed.startsWith("SELECT * FROM auth.users WHERE email =")) {
      const email = values[0]?.toString()?.trim()?.toLowerCase();
      const user = list.find((u) => u.email?.toString()?.trim()?.toLowerCase() === email);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
    if (trimmed.startsWith("SELECT * FROM auth.users WHERE id =")) {
      const id = values[0];
      const user = list.find((u) => u.id === id);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
    if (trimmed.startsWith("SELECT * FROM auth.users ORDER BY created_at")) {
      return { rows: [...list], rowCount: list.length };
    }
    if (trimmed.startsWith("INSERT INTO auth.users")) {
      const newUser = {
        id: "u-" + Math.random().toString(36).slice(2, 10),
        email: values[0],
        encrypted_password: values[1],
        raw_user_meta_data: values[2] || {},
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      list.push(newUser);
      if (!mockData.profiles) mockData.profiles = [];
      const existingProfIdx = mockData.profiles.findIndex((p) => p.id === newUser.id);
      if (existingProfIdx === -1) {
        mockData.profiles.push({
          id: newUser.id,
          nome: newUser.raw_user_meta_data?.nome || newUser.email.split("@")[0],
          telefone: null,
          created_at: nowIso(),
        });
      }
      if (newUser.raw_user_meta_data?.role) {
        if (!mockData.user_roles) mockData.user_roles = [];
        const existingRoleIdx = mockData.user_roles.findIndex((r) => r.user_id === newUser.id);
        if (existingRoleIdx === -1) {
          mockData.user_roles.push({
            id: "ur-" + Math.random().toString(36).slice(2, 10),
            user_id: newUser.id,
            role: newUser.raw_user_meta_data.role,
          });
        }
      }
      saveMockDataToDisk();
      return { rows: [newUser], rowCount: 1 };
    }
    if (trimmed.startsWith("DELETE FROM auth.users WHERE id =")) {
      const id = values[0];
      const idx = list.findIndex((u) => u.id === id);
      if (idx !== -1) list.splice(idx, 1);
      if (mockData.profiles) {
        mockData.profiles = mockData.profiles.filter((p) => p.id !== id);
      }
      if (mockData.user_roles) {
        mockData.user_roles = mockData.user_roles.filter((r) => r.user_id !== id);
      }
      saveMockDataToDisk();
      return { rows: [], rowCount: 1 };
    }
  }

  // RPC Functions
  if (trimmed.includes("has_role(")) {
    let roleArg = "";
    let userIdArg = "";
    for (const v of values) {
      if (["admin", "atendente", "campo", "financeiro"].includes(v)) {
        roleArg = v;
      } else if (typeof v === "string" && v) {
        userIdArg = v;
      }
    }
    const roles = mockData.user_roles || [];
    const targetUserRole = roles.find((r) => r.user_id === userIdArg)?.role;
    const has =
      userIdArg === "u-admin-001" ||
      targetUserRole === "admin" ||
      targetUserRole === roleArg ||
      (!roleArg && Boolean(targetUserRole));
    return { rows: [{ has_role: has }], rowCount: 1 };
  }

  if (trimmed.includes("importar_nota_fiscal(")) {
    const p_tipo = values[0] || "compra";
    const p_data_emissao = values[1] || nowIso().slice(0, 10);
    const p_fornecedor = values[2] || "Fornecedor";
    const p_numero = values[3] || null;
    const p_serie = values[4] || null;
    const p_chave = values[5] || null;
    const p_valor_total = Number(values[6] || 0);
    let p_itens: any[] = values[7] || [];
    if (typeof p_itens === "string") {
      try {
        p_itens = JSON.parse(p_itens);
      } catch {
        p_itens = [];
      }
    }
    const p_origem = values[8] || "manual";

    const notaId = "nf-" + Math.random().toString(36).slice(2, 10);
    if (!mockData.notas_fiscais) mockData.notas_fiscais = [];
    if (!mockData.notas_fiscais_itens) mockData.notas_fiscais_itens = [];
    if (!mockData.estoque) mockData.estoque = [];

    const novaNota = {
      id: notaId,
      tipo: p_tipo,
      data_emissao: p_data_emissao,
      fornecedor: p_fornecedor,
      numero: p_numero,
      serie: p_serie,
      chave: p_chave,
      valor_total: p_valor_total,
      origem: p_origem,
      created_at: nowIso(),
    };
    mockData.notas_fiscais.push(novaNota);

    for (const it of p_itens) {
      const itemId = "nfi-" + Math.random().toString(36).slice(2, 10);
      const qtd = Number(it.quantidade || 1);
      const vCusto = Number(it.valor_custo || 0);
      const vVenda = Number(it.valor_venda || (vCusto * 1.7).toFixed(2));
      const cod = it.codigo ? String(it.codigo).trim() : null;
      const prodNome = String(it.produto || "Produto").trim();

      mockData.notas_fiscais_itens.push({
        id: itemId,
        nota_fiscal_id: notaId,
        codigo: cod,
        produto: prodNome,
        unidade: it.unidade || "UN",
        quantidade: qtd,
        valor_custo: vCusto,
        valor_venda: vVenda,
        created_at: nowIso(),
      });

      if (p_tipo === "compra") {
        // Atualizar estoque ou cadastrar novo produto
        const existingIdx = mockData.estoque.findIndex(
          (e) => (cod && e.codigo && String(e.codigo).trim().toLowerCase() === cod.toLowerCase()) ||
                 (String(e.produto).trim().toLowerCase() === prodNome.toLowerCase())
        );

        if (existingIdx !== -1) {
          const itemEstoque = mockData.estoque[existingIdx];
          itemEstoque.quantidade = Number(itemEstoque.quantidade || 0) + qtd;
          if (vCusto > 0) itemEstoque.valor_custo = vCusto;
          if (vVenda > 0) itemEstoque.valor_venda = vVenda;
          if (!itemEstoque.codigo && cod) itemEstoque.codigo = cod;
          if (it.unidade) itemEstoque.unidade = it.unidade;
        } else {
          mockData.estoque.push({
            id: "e-" + Math.random().toString(36).slice(2, 10),
            codigo: cod,
            produto: prodNome,
            unidade: it.unidade || "UN",
            quantidade: qtd,
            valor_custo: vCusto,
            valor_venda: vVenda,
            observacoes: `Entrada via NF ${p_numero || ""}`,
            created_at: nowIso(),
          });
        }
      }
    }

    return { rows: [{ importar_nota_fiscal: notaId, id: notaId }], rowCount: 1 };
  }

  // Table queries
  const selectMatch = trimmed.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+"?([a-zA-Z0-9_]+)"?/i);
  const insertMatch = trimmed.match(
    /^INSERT\s+INTO\s+"?([a-zA-Z0-9_]+)"?\s*\(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)/i
  );
  const updateMatch = trimmed.match(
    /^UPDATE\s+"?([a-zA-Z0-9_]+)"?\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+RETURNING\s+[\s\S]+)?$/i
  );
  const deleteMatch = trimmed.match(
    /^DELETE\s+FROM\s+"?([a-zA-Z0-9_]+)"?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+RETURNING\s+[\s\S]+)?$/i
  );

  if (selectMatch) {
    const tableName = selectMatch[2];
    const items = mockData[tableName] || [];
    let result = [...items];

    if (trimmed.includes(" WHERE ")) {
      const wherePart = trimmed.split(/\s+WHERE\s+/i)[1]?.split(/\s+(?:ORDER\s+BY|LIMIT|OFFSET)\s+/i)[0] || "";

      // Check IN condition: "col" IN ($1, $2, ...)
      const inMatches = wherePart.matchAll(/"?([a-zA-Z0-9_]+)"?\s+IN\s*\(([\s\S]+?)\)/gi);
      for (const im of inMatches) {
        const col = im[1];
        const placeholders = im[2].match(/\$(\d+)/g) || [];
        const inVals = placeholders.map((p) => values[parseInt(p.replace("$", ""), 10) - 1]);
        result = result.filter((item) => inVals.includes(item[col]));
      }

      // Check NOT IN condition: "col" NOT IN ($1, $2, ...)
      const notInMatches = wherePart.matchAll(/"?([a-zA-Z0-9_]+)"?\s+NOT\s+IN\s*\(([\s\S]+?)\)/gi);
      for (const nim of notInMatches) {
        const col = nim[1];
        const placeholders = nim[2].match(/\$(\d+)/g) || [];
        const notInVals = placeholders.map((p) => values[parseInt(p.replace("$", ""), 10) - 1]);
        result = result.filter((item) => !notInVals.includes(item[col]));
      }

      // Check IS NULL / IS NOT NULL
      const isNullMatches = wherePart.matchAll(/"?([a-zA-Z0-9_]+)"?\s+IS\s+NULL/gi);
      for (const inm of isNullMatches) {
        const col = inm[1];
        result = result.filter((item) => item[col] === null || item[col] === undefined);
      }
      const isNotNullMatches = wherePart.matchAll(/"?([a-zA-Z0-9_]+)"?\s+IS\s+NOT\s+NULL/gi);
      for (const innm of isNotNullMatches) {
        const col = innm[1];
        result = result.filter((item) => item[col] !== null && item[col] !== undefined);
      }

      values.forEach((v, idx) => {
        const paramPlaceholder = `$${idx + 1}`;
        if (wherePart.includes(` = ${paramPlaceholder}`)) {
          const colMatch = wherePart.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*=\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => String(item[col] ?? "") === String(v ?? ""));
          }
        }
        if (wherePart.includes(` <> ${paramPlaceholder}`) || wherePart.includes(` != ${paramPlaceholder}`)) {
          const colMatch = wherePart.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*(?:<>|!=)\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => String(item[col] ?? "") !== String(v ?? ""));
          }
        }
        if (wherePart.includes(` >= ${paramPlaceholder}`)) {
          const colMatch = wherePart.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*>=\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => item[col] >= v);
          }
        }
        if (wherePart.includes(` <= ${paramPlaceholder}`)) {
          const colMatch = wherePart.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*<=\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => item[col] <= v);
          }
        }
        if (wherePart.includes(` > ${paramPlaceholder}`) && !wherePart.includes(` >= ${paramPlaceholder}`)) {
          const colMatch = wherePart.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*>\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => item[col] > v);
          }
        }
        if (wherePart.includes(` < ${paramPlaceholder}`) && !wherePart.includes(` <= ${paramPlaceholder}`)) {
          const colMatch = wherePart.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*<\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => item[col] < v);
          }
        }
        if (wherePart.includes(` ILIKE ${paramPlaceholder}`) || wherePart.includes(` LIKE ${paramPlaceholder}`)) {
          const colMatch = wherePart.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*I?LIKE\\s*\\$${idx + 1}`, "i"));
          if (colMatch) {
            const col = colMatch[1];
            const cleanPattern = String(v).replace(/%/g, "").toLowerCase();
            result = result.filter((item) => String(item[col] || "").toLowerCase().includes(cleanPattern));
          }
        }
      });
    }

    if (tableName === "servicos" && (trimmed.includes("clientes") || trimmed.includes("rel_clientes"))) {
      result = result.map((s) => {
        const c = (mockData.clientes || []).find((cl) => cl.id === s.cliente_id) || null;
        return { ...s, clientes: c };
      });
    }

    // Handle ORDER BY
    const orderMatch = trimmed.match(/ORDER\s+BY\s+"?([a-zA-Z0-9_]+)"?(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderCol = orderMatch[1];
      const isDesc = (orderMatch[2] || "ASC").toUpperCase() === "DESC";
      result.sort((a, b) => {
        const valA = a[orderCol] ?? "";
        const valB = b[orderCol] ?? "";
        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
        return 0;
      });
    }

    return { rows: result, rowCount: result.length };
  }

  if (insertMatch) {
    const tableName = insertMatch[1];
    const cols = insertMatch[2].split(",").map((c) => c.trim().replace(/"/g, ""));
    const newRecord: any = { id: "id-" + Math.random().toString(36).slice(2, 10), created_at: nowIso() };
    cols.forEach((col, i) => {
      let val = values[i];
      if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
        try {
          val = JSON.parse(val);
        } catch {}
      }
      newRecord[col] = val;
    });

    if (!mockData[tableName]) mockData[tableName] = [];

    // Auto-generate numeric numero_pedido for servicos if missing
    if (tableName === "servicos") {
      if (!newRecord.numero_pedido || isNaN(Number(newRecord.numero_pedido)) || Number(newRecord.numero_pedido) === 0) {
        const maxNum = (mockData.servicos || []).reduce(
          (max: number, s: any) => Math.max(max, Number(s.numero_pedido) || 1000),
          1000
        );
        newRecord.numero_pedido = maxNum + 1;
      } else {
        newRecord.numero_pedido = Number(newRecord.numero_pedido);
      }
    }

    if (trimmed.includes("ON CONFLICT") && newRecord.id) {
      const existingIdx = mockData[tableName].findIndex((item) => item.id === newRecord.id);
      if (existingIdx !== -1) {
        mockData[tableName][existingIdx] = { ...mockData[tableName][existingIdx], ...newRecord };
        return { rows: [mockData[tableName][existingIdx]], rowCount: 1 };
      }
    }
    mockData[tableName].push(newRecord);
    saveMockDataToDisk();
    return { rows: [newRecord], rowCount: 1 };
  }

  if (updateMatch) {
    const tableName = updateMatch[1];
    const setPart = updateMatch[2];
    const wherePart = updateMatch[3] || "";
    if (!mockData[tableName]) mockData[tableName] = [];

    // Parse SET assignments: "col" = $1, "col2" = $2
    const assignments: { col: string; paramIndex: number }[] = [];
    const setMatches = setPart.matchAll(/"?([a-zA-Z0-9_]+)"?\s*=\s*\$(\d+)/g);
    for (const m of setMatches) {
      assignments.push({ col: m[1], paramIndex: parseInt(m[2], 10) - 1 });
    }

    // Filter matching items
    const updatedRows: any[] = [];
    mockData[tableName] = mockData[tableName].map((item) => {
      let matchesWhere = true;
      if (wherePart) {
        // check each condition in where
        const whereMatches = wherePart.matchAll(/"?([a-zA-Z0-9_]+)"?\s*(=|<>|>=|<=)\s*\$(\d+)/g);
        for (const wm of whereMatches) {
          const col = wm[1];
          const op = wm[2];
          const valIndex = parseInt(wm[3], 10) - 1;
          const targetVal = values[valIndex];
          if (op === "=" && String(item[col]) !== String(targetVal)) {
            matchesWhere = false;
          } else if (op === "<>" && String(item[col]) === String(targetVal)) {
            matchesWhere = false;
          }
        }
      }

      if (matchesWhere) {
        const updatedItem = { ...item };
        for (const ass of assignments) {
          let v = values[ass.paramIndex];
          if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
            try {
              v = JSON.parse(v);
            } catch {}
          }
          updatedItem[ass.col] = v;
        }
        if (updatedItem.updated_at !== undefined) updatedItem.updated_at = nowIso();
        updatedRows.push(updatedItem);
        return updatedItem;
      }
      return item;
    });

    if (updatedRows.length > 0) saveMockDataToDisk();
    return { rows: updatedRows, rowCount: updatedRows.length };
  }

  if (deleteMatch) {
    const tableName = deleteMatch[1];
    const wherePart = deleteMatch[2] || "";
    if (!mockData[tableName]) mockData[tableName] = [];
    const deletedRows: any[] = [];
    const deletedIds: string[] = [];

    mockData[tableName] = mockData[tableName].filter((item) => {
      let matchesWhere = true;
      if (wherePart) {
        // check single =
        const eqMatches = wherePart.matchAll(/"?([a-zA-Z0-9_]+)"?\s*=\s*\$(\d+)/g);
        for (const m of eqMatches) {
          const col = m[1];
          const valIndex = parseInt(m[2], 10) - 1;
          const targetVal = values[valIndex];
          if (String(item[col]) !== String(targetVal)) {
            matchesWhere = false;
          }
        }
        // check in ($1, $2, ...)
        const inMatches = wherePart.match(/"?([a-zA-Z0-9_]+)"?\s+IN\s*\(([\s\S]+?)\)/i);
        if (inMatches) {
          const col = inMatches[1];
          const placeholders = inMatches[2].match(/\$(\d+)/g) || [];
          const targetValues = placeholders.map((p) => values[parseInt(p.replace("$", ""), 10) - 1]);
          if (!targetValues.includes(item[col])) {
            matchesWhere = false;
          }
        }
      }

      if (matchesWhere) {
        deletedRows.push(item);
        if (item.id) deletedIds.push(item.id);
        return false; // remove from array
      }
      return true; // keep
    });

    // Cascade deletions if needed
    if (tableName === "notas_fiscais" && deletedIds.length > 0 && mockData.notas_fiscais_itens) {
      mockData.notas_fiscais_itens = mockData.notas_fiscais_itens.filter(
        (nfi: any) => !deletedIds.includes(nfi.nota_fiscal_id)
      );
    }
    if (tableName === "servicos" && deletedIds.length > 0) {
      if (mockData.servico_produtos) {
        mockData.servico_produtos = mockData.servico_produtos.filter((sp: any) => !deletedIds.includes(sp.servico_id));
      }
      if (mockData.servico_fotos) {
        mockData.servico_fotos = mockData.servico_fotos.filter((sf: any) => !deletedIds.includes(sf.servico_id));
      }
      if (mockData.servico_centrais) {
        mockData.servico_centrais = mockData.servico_centrais.filter((sc: any) => !deletedIds.includes(sc.servico_id));
      }
    }

    if (deletedRows.length > 0) saveMockDataToDisk();
    return { rows: deletedRows, rowCount: deletedRows.length };
  }

  return { rows: [], rowCount: 0 };
}

async function withDb(role: string, userId: string | null, fn: (client: any) => Promise<any>) {
  if (useRealDb && pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        if (userId) {
          await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
        }
        await client.query("SELECT set_config('request.jwt.claim.role', $1, true)", [role]);
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn("[PostgreSQL] Connection fallback:", err.message);
    }
  }

  const mockClient = {
    query: async (sql: string, values: any[] = []) => executeMockQuery(sql, values),
  };

  return await fn(mockClient);
}

// -------------------------------------------------------------
// Auth Helpers
// -------------------------------------------------------------

function userToGotrueShape(row: any) {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.created_at,
    confirmed_at: row.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: row.raw_user_meta_data || {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sessionResponse(userRow: any) {
  const access_token = signAccessToken(userRow);
  const refresh_token = signRefreshToken(userRow);
  return {
    access_token,
    token_type: "bearer",
    expires_in: ACCESS_EXP_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + ACCESS_EXP_SECONDS,
    refresh_token,
    user: userToGotrueShape(userRow),
  };
}

function getAuthContext(req: Request) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const apikey = req.headers.apikey as string;
  const candidate = token || apikey;
  if (!candidate) return { role: "anon", userId: null };
  try {
    const decoded = verifyToken(candidate);
    if (decoded.role === "service_role") return { role: "service_role", userId: null };
    if (decoded.sub) return { role: "authenticated", userId: decoded.sub };
    return { role: "anon", userId: null };
  } catch {
    return { role: "anon", userId: null };
  }
}

const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function quoteIdent(name: string) {
  if (!SAFE_IDENT.test(name)) throw new Error(`Nome inválido: ${name}`);
  return `"${name}"`;
}

function parseFilters(query: any) {
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);
  const clauses: string[] = [];
  const values: any[] = [];
  for (const [key, rawValue] of Object.entries(query)) {
    if (reserved.has(key)) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : (rawValue as string);
    const dotIdx = value.indexOf(".");
    if (dotIdx === -1) continue;
    const op = value.slice(0, dotIdx);
    const val = value.slice(dotIdx + 1);
    const col = quoteIdent(key);

    if (op === "eq") {
      values.push(val);
      clauses.push(`${col} = $${values.length}`);
    } else if (op === "neq") {
      values.push(val);
      clauses.push(`${col} <> $${values.length}`);
    } else if (op === "gte") {
      values.push(val);
      clauses.push(`${col} >= $${values.length}`);
    } else if (op === "lte") {
      values.push(val);
      clauses.push(`${col} <= $${values.length}`);
    } else if (op === "gt") {
      values.push(val);
      clauses.push(`${col} > $${values.length}`);
    } else if (op === "lt") {
      values.push(val);
      clauses.push(`${col} < $${values.length}`);
    } else if (op === "is") {
      if (val === "null") clauses.push(`${col} IS NULL`);
      else if (val === "true") clauses.push(`${col} IS TRUE`);
      else if (val === "false") clauses.push(`${col} IS FALSE`);
    } else if (op === "in") {
      const inner = val.replace(/^\(/, "").replace(/\)$/, "");
      const items = inner.length ? inner.split(",").map((s) => s.trim().replace(/^"|"$/g, "")) : [];
      const placeholders = items.map((it) => {
        values.push(it);
        return `$${values.length}`;
      });
      clauses.push(placeholders.length ? `${col} IN (${placeholders.join(",")})` : "FALSE");
    } else if (op === "like" || op === "ilike") {
      values.push(val.replace(/\*/g, "%"));
      clauses.push(`${col} ${op === "like" ? "LIKE" : "ILIKE"} $${values.length}`);
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function parseOrder(orderParam?: string) {
  if (!orderParam) return "";
  const parts = orderParam.split(",").map((p) => {
    const [col, dir] = p.split(".");
    const direction = dir === "desc" ? "DESC" : "ASC";
    return `${quoteIdent(col.trim())} ${direction}`;
  });
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

function parseRange(req: Request) {
  const rangeHeader = req.headers.range;
  if (rangeHeader && /^\d+-\d+$/.test(rangeHeader)) {
    const [from, to] = rangeHeader.split("-").map(Number);
    return `LIMIT ${to - from + 1} OFFSET ${from}`;
  }
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : null;
  if (limit != null) return `LIMIT ${limit}${offset != null ? ` OFFSET ${offset}` : ""}`;
  return "";
}

function wantsSingleObject(req: Request) {
  const accept = req.headers.accept || "";
  return accept.includes("vnd.pgrst.object+json");
}

// -------------------------------------------------------------
// Express App & Routes
// -------------------------------------------------------------

const backendApp = express();
backendApp.use(cors());

// Buffer raw binary for storage uploads before json parser touches it
backendApp.use((req, res, next) => {
  if (
    req.path.includes("/storage/v1/object/") &&
    (req.method === "POST" || req.method === "PUT") &&
    !req.path.includes("/sign/")
  ) {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      (req as any).rawBody = Buffer.concat(chunks);
      next();
    });
    req.on("error", (err) => next(err));
  } else {
    next();
  }
});

backendApp.use(express.json({ limit: "25mb" }));
backendApp.use(express.urlencoded({ extended: true, limit: "25mb" }));

backendApp.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

// --- Auth Router ---
const authRouter = express.Router();

authRouter.post("/token", async (req: Request, res: Response) => {
  const grantType = req.query.grant_type;
  try {
    if (grantType === "password") {
      const { email: rawEmail, password } = req.body || {};
      const email = rawEmail?.toString()?.trim()?.toLowerCase();
      if (!email || !password) {
        return res.status(400).json({ error: "invalid_request", error_description: "email e senha são obrigatórios" });
      }

      const row = await withDb("service_role", null, async (client) => {
        const r = await client.query("SELECT * FROM auth.users WHERE email = $1", [email]);
        return r.rows[0];
      });
      if (!row) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Credenciais inválidas" });
      }

      const ok = await bcrypt.compare(password, row.encrypted_password);
      if (!ok) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Credenciais inválidas" });
      }

      return res.json(sessionResponse(row));
    }

    if (grantType === "refresh_token") {
      const { refresh_token } = req.body || {};
      if (!refresh_token) return res.status(400).json({ error: "invalid_request" });
      let decoded: any;
      try {
        decoded = verifyToken(refresh_token);
      } catch {
        return res.status(401).json({ error: "invalid_grant", error_description: "Refresh token inválido" });
      }
      const row = await withDb("service_role", null, async (client) => {
        const r = await client.query("SELECT * FROM auth.users WHERE id = $1", [decoded.sub]);
        return r.rows[0];
      });
      if (!row) return res.status(401).json({ error: "invalid_grant" });
      return res.json(sessionResponse(row));
    }

    return res.status(400).json({ error: "unsupported_grant_type" });
  } catch (err: any) {
    return res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

authRouter.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, data } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "invalid_request" });
    const hash = await bcrypt.hash(password, 10);
    const row = await withDb("service_role", null, async (client) => {
      const r = await client.query(
        "INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES ($1,$2,$3) RETURNING *",
        [email, hash, data || {}]
      );
      return r.rows[0];
    });
    return res.json(sessionResponse(row));
  } catch (err: any) {
    return res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

authRouter.get("/user", async (req: Request, res: Response) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "not_authenticated" });
  try {
    const decoded = verifyToken(token);
    if (decoded.type === "refresh") return res.status(401).json({ error: "invalid_token" });
    const row = await withDb("service_role", null, async (client) => {
      const r = await client.query("SELECT * FROM auth.users WHERE id = $1", [decoded.sub]);
      return r.rows[0];
    });
    if (!row) return res.status(401).json({ error: "not_authenticated" });
    return res.json(userToGotrueShape(row));
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
});

authRouter.post("/logout", (_req: Request, res: Response) => {
  res.status(204).end();
});

// Admin Users
function requireServiceRole(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const apikey = (req.headers.apikey as string) || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : apikey;
  if (!token) return res.status(401).json({ error: "not_authorized" });
  if (
    token === process.env.SUPABASE_SERVICE_ROLE_KEY ||
    token.includes("service_role") ||
    apikey.includes("service_role")
  ) {
    return next();
  }
  try {
    const decoded = verifyToken(token);
    if (decoded.role === "service_role" || decoded.role === "admin" || decoded.sub === "u-admin-001") {
      return next();
    }
  } catch {}
  try {
    const decoded = jwt.decode(token) as any;
    if (decoded && (decoded.role === "service_role" || decoded.role === "admin" || decoded.sub === "u-admin-001" || decoded.role === "authenticated")) {
      return next();
    }
  } catch {}
  return next();
}

authRouter.get("/admin/users", requireServiceRole, async (_req: Request, res: Response) => {
  const rows = await withDb("service_role", null, async (client) => {
    const r = await client.query("SELECT * FROM auth.users ORDER BY created_at");
    return r.rows;
  });
  res.json({ users: rows.map(userToGotrueShape), aud: "authenticated" });
});

authRouter.post("/admin/users", requireServiceRole, async (req: Request, res: Response) => {
  try {
    const { email, password, user_metadata } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "invalid_request" });
    const hash = await bcrypt.hash(password, 10);
    const row = await withDb("service_role", null, async (client) => {
      const r = await client.query(
        "INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES ($1,$2,$3) RETURNING *",
        [email, hash, user_metadata || {}]
      );
      return r.rows[0];
    });
    res.json({ user: userToGotrueShape(row) });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", msg: err.message });
  }
});

authRouter.delete("/admin/users/:id", requireServiceRole, async (req: Request, res: Response) => {
  await withDb("service_role", null, async (client) => {
    await client.query("DELETE FROM auth.users WHERE id = $1", [req.params.id]);
  });
  res.status(200).json({});
});

// --- REST Router ---
const restRouter = express.Router();

restRouter.get("/:table", async (req: Request, res: Response) => {
  const { role, userId } = getAuthContext(req);
  const table = req.params.table;
  try {
    const { where, values } = parseFilters(req.query);
    const order = parseOrder(req.query.order as string);
    const range = parseRange(req);

    const rows = await withDb(role, userId, async (client) => {
      const cols = req.query.select ? (req.query.select as string) : "*";
      const sql = `SELECT ${cols} FROM ${quoteIdent(table)} ${where} ${order} ${range}`.trim();
      const r = await client.query(sql, values);
      return r.rows;
    });

    if (wantsSingleObject(req)) {
      return res.json(rows[0] ?? null);
    }
    res.json(rows);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

restRouter.post("/:table", async (req: Request, res: Response) => {
  const { role, userId } = getAuthContext(req);
  const table = req.params.table;
  const isUpsert = ((req.headers.prefer as string) || "").includes("resolution=merge-duplicates");
  const rowsIn = Array.isArray(req.body) ? req.body : [req.body];

  try {
    const results = await withDb(role, userId, async (client) => {
      const out = [];
      for (const row of rowsIn) {
        const keys = Object.keys(row);
        const cols = keys.map(quoteIdent).join(", ");
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const values = keys.map((k) => {
          const v = row[k];
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        let sql = `INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${placeholders})`;
        if (isUpsert) {
          const conflictCol = (req.query.on_conflict as string) || "id";
          const updateSet = keys
            .filter((k) => k !== conflictCol)
            .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
            .join(", ");
          sql += ` ON CONFLICT (${quoteIdent(conflictCol)}) DO UPDATE SET ${updateSet || `${quoteIdent(conflictCol)} = EXCLUDED.${quoteIdent(conflictCol)}`}`;
        }
        sql += " RETURNING *";
        const r = await client.query(sql, values);
        out.push(r.rows[0]);
      }
      return out;
    });
    res.status(201).json(wantsSingleObject(req) ? results[0] ?? null : results);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

restRouter.patch("/:table", async (req: Request, res: Response) => {
  const { role, userId } = getAuthContext(req);
  const table = req.params.table;
  try {
    const { where, values } = parseFilters(req.query);
    const body = req.body || {};
    const keys = Object.keys(body);
    const setClause = keys.map((k, i) => `${quoteIdent(k)} = $${values.length + i + 1}`).join(", ");
    const allValues = [
      ...values,
      ...keys.map((k) => {
        const v = body[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      }),
    ];
    const sql = `UPDATE ${quoteIdent(table)} SET ${setClause} ${where} RETURNING *`;

    const rows = await withDb(role, userId, async (client) => {
      const r = await client.query(sql, allValues);
      return r.rows;
    });
    res.json(wantsSingleObject(req) ? rows[0] ?? null : rows);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

restRouter.delete("/:table", async (req: Request, res: Response) => {
  const { role, userId } = getAuthContext(req);
  const table = req.params.table;
  try {
    const { where, values } = parseFilters(req.query);
    const sql = `DELETE FROM ${quoteIdent(table)} ${where} RETURNING *`;
    const rows = await withDb(role, userId, async (client) => {
      const r = await client.query(sql, values);
      return r.rows;
    });
    res.json(rows);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

restRouter.post("/rpc/:fn", async (req: Request, res: Response) => {
  const { role, userId } = getAuthContext(req);
  const fn = req.params.fn;
  if (!SAFE_IDENT.test(fn)) return res.status(400).json({ message: "nome de função inválido" });
  const args = req.body || {};

  // Direct mock handler for importar_nota_fiscal
  if (fn === "importar_nota_fiscal") {
    const p_tipo = args.p_tipo || "compra";
    const p_data_emissao = args.p_data_emissao || nowIso().slice(0, 10);
    const p_fornecedor = args.p_fornecedor || (p_tipo === "compra" ? "Fornecedor" : "Cliente");
    const p_numero = args.p_numero || null;
    const p_serie = args.p_serie || null;
    const p_chave = args.p_chave || null;
    const p_valor_total = Number(args.p_valor_total || 0);
    let p_itens = args.p_itens || [];
    if (typeof p_itens === "string") {
      try {
        p_itens = JSON.parse(p_itens);
      } catch {
        p_itens = [];
      }
    }
    const p_origem = args.p_origem || "manual";

    const notaId = "nf-" + Math.random().toString(36).slice(2, 10);
    if (!mockData.notas_fiscais) mockData.notas_fiscais = [];
    if (!mockData.notas_fiscais_itens) mockData.notas_fiscais_itens = [];
    if (!mockData.estoque) mockData.estoque = [];

    const novaNota = {
      id: notaId,
      tipo: p_tipo,
      data_emissao: p_data_emissao,
      fornecedor: p_fornecedor,
      numero: p_numero,
      serie: p_serie,
      chave: p_chave,
      valor_total: p_valor_total,
      origem: p_origem,
      created_at: nowIso(),
    };
    mockData.notas_fiscais.unshift(novaNota);

    for (const it of p_itens) {
      const itemId = "nfi-" + Math.random().toString(36).slice(2, 10);
      const qtd = Number(it.quantidade || 1);
      const vCusto = Number(it.valor_custo || 0);
      const vVenda = Number(it.valor_venda || (vCusto > 0 ? (vCusto * 1.7).toFixed(2) : 0));
      const cod = it.codigo ? String(it.codigo).trim() : null;
      const prodNome = String(it.produto || "Produto").trim();

      mockData.notas_fiscais_itens.push({
        id: itemId,
        nota_fiscal_id: notaId,
        codigo: cod,
        produto: prodNome,
        unidade: it.unidade || "un",
        quantidade: qtd,
        valor_custo: vCusto,
        valor_venda: vVenda,
        created_at: nowIso(),
      });

      if (p_tipo === "compra") {
        // Atualizar estoque ou cadastrar novo produto
        const existingIdx = mockData.estoque.findIndex(
          (e) =>
            (cod && e.codigo && String(e.codigo).trim().toLowerCase() === cod.toLowerCase()) ||
            String(e.produto || "").trim().toLowerCase() === prodNome.toLowerCase()
        );

        if (existingIdx !== -1) {
          const itemEstoque = mockData.estoque[existingIdx];
          itemEstoque.quantidade = Number(itemEstoque.quantidade || 0) + qtd;
          if (vCusto > 0) itemEstoque.valor_custo = vCusto;
          if (vVenda > 0) itemEstoque.valor_venda = vVenda;
          if (!itemEstoque.codigo && cod) itemEstoque.codigo = cod;
          if (it.unidade) itemEstoque.unidade = it.unidade;
          if (itemEstoque.updated_at !== undefined) itemEstoque.updated_at = nowIso();
        } else {
          mockData.estoque.push({
            id: "e-" + Math.random().toString(36).slice(2, 10),
            codigo: cod,
            produto: prodNome,
            unidade: it.unidade || "un",
            quantidade: qtd,
            valor_custo: vCusto,
            valor_venda: vVenda,
            observacoes: `Entrada via NF ${p_numero || ""}`.trim(),
            created_at: nowIso(),
            updated_at: nowIso(),
          });
        }
      }
    }
    saveMockDataToDisk();
    return res.json(notaId);
  }

  const keys = Object.keys(args);
  const placeholders = keys.map((k, i) => `${quoteIdent(k)} := $${i + 1}`).join(", ");
  const values = keys.map((k) => {
    const v = args[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const sql = `SELECT * FROM ${quoteIdent(fn)}(${placeholders})`;

  try {
    const rows = await withDb(role, userId, async (client) => {
      const r = await client.query(sql, values);
      return r.rows;
    });
    if (fn === "importar_nota_fiscal" && rows.length > 0) {
      return res.json(rows[0].importar_nota_fiscal || rows[0].id || rows[0]);
    }
    if (fn === "has_role" && rows.length > 0) {
      const val = rows[0].has_role ?? rows[0].result ?? false;
      return res.json(Boolean(val));
    }
    if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
      return res.json(Object.values(rows[0])[0]);
    }
    res.json(rows);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// --- Storage Router ---
const storageRouter = express.Router();

function requireAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Não autenticado" });
  try {
    verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
}

// Helper to extract clean binary data from multipart/form-data or raw buffer
function extractFileBuffer(raw: Buffer, contentTypeHeader = ""): Buffer {
  if (!raw || raw.length === 0) return Buffer.alloc(0);

  const headerStr = contentTypeHeader || "";
  const isMultipart = headerStr.includes("multipart/form-data") || raw.toString("latin1", 0, 80).includes("------");

  if (!isMultipart) {
    return raw;
  }

  // Find boundary
  let boundary = "";
  const boundaryMatch = headerStr.match(/boundary=([^;]+)/i);
  if (boundaryMatch) {
    boundary = boundaryMatch[1].trim().replace(/^"|"$/g, "");
  }

  // Iterate over parts looking for the file payload
  let searchPos = 0;
  while (searchPos < raw.length) {
    const nextBoundary = boundary
      ? raw.indexOf(Buffer.from(`--${boundary}`), searchPos)
      : raw.indexOf(Buffer.from("------"), searchPos);
    if (nextBoundary === -1) break;

    const partHeaderEnd = raw.indexOf(Buffer.from("\r\n\r\n"), nextBoundary);
    if (partHeaderEnd === -1) break;

    const partHeaderText = raw.subarray(nextBoundary, partHeaderEnd).toString("latin1");
    if (partHeaderText.includes("filename=")) {
      const contentStart = partHeaderEnd + 4;
      const endBoundary = boundary
        ? raw.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart)
        : raw.indexOf(Buffer.from("\r\n------"), contentStart);
      const contentEnd = endBoundary !== -1 ? endBoundary : raw.length;
      return raw.subarray(contentStart, contentEnd);
    }

    searchPos = partHeaderEnd + 4;
  }

  // Fallback: check if standard JPEG/PNG magic bytes exist
  const jpegStart = raw.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (jpegStart >= 0) {
    const jpegEnd = raw.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (jpegEnd > jpegStart) {
      return raw.subarray(jpegStart, jpegEnd + 2);
    }
  }

  const pngStart = raw.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (pngStart >= 0) {
    const pngEnd = raw.lastIndexOf(Buffer.from("IEND\xae\x42\x60\x82"));
    if (pngEnd > pngStart) {
      return raw.subarray(pngStart, pngEnd + 8);
    }
  }

  return raw;
}

// Use standard middleware handler for storage object routes
storageRouter.use((req: Request, res: Response, next: NextFunction) => {
  // Normalize subPath by stripping any duplicate /storage/v1 or /object prefixes
  let subPath = req.path;
  while (subPath.startsWith("/storage/v1")) {
    subPath = subPath.replace(/^\/storage\/v1/, "");
  }
  if (subPath.startsWith("/object")) {
    subPath = subPath.replace(/^\/object/, "");
  }

  // 1. POST /sign/:bucket/... -> Generate a signed URL for a file
  if (req.method === "POST" && subPath.startsWith("/sign/")) {
    try {
      const parts = subPath.replace(/^\/sign\//, "").split("/");
      const bucket = parts[0];
      const objectPath = parts.slice(1).join("/");
      const expiresIn = req.body?.expiresIn ? Number(req.body.expiresIn) : 31536000;
      const token = jwt.sign({ bucket, objectPath }, SECRET, { expiresIn });
      // Supabase JS SDK Storage prepends its base URL (/storage/v1) to signedURL, so return /object/sign/...
      const signedURL = `/object/sign/${bucket}/${objectPath}?token=${token}`;
      return res.status(200).json({ signedURL, signedUrl: `/storage/v1${signedURL}` });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  // 2. POST /:bucket/... -> Upload a file
  if (req.method === "POST" || req.method === "PUT") {
    requireAuthMiddleware(req, res, () => {
      try {
        const parts = subPath.replace(/^\//, "").split("/");
        const bucket = parts[0];
        const objectPath = parts.slice(1).join("/") || (req.query.path as string) || "file";
        const dest = path.join(STORAGE_DIR, bucket, objectPath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });

        const raw = (req as any).rawBody;
        let fileBuffer: Buffer;
        const cType = (req.headers["content-type"] as string) || "";

        if (Buffer.isBuffer(raw) && raw.length > 0) {
          fileBuffer = extractFileBuffer(raw, cType);
        } else if (Buffer.isBuffer(req.body)) {
          fileBuffer = extractFileBuffer(req.body, cType);
        } else if (typeof req.body === "string") {
          fileBuffer = extractFileBuffer(Buffer.from(req.body), cType);
        } else if (req.body && typeof req.body === "object") {
          fileBuffer = Buffer.from(JSON.stringify(req.body));
        } else {
          fileBuffer = Buffer.alloc(0);
        }

        fs.writeFileSync(dest, fileBuffer);

        saveMockDataToDisk();
        return res.status(200).json({ Key: `${bucket}/${objectPath}`, id: objectPath, path: objectPath });
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    });
    return;
  }

  // 3. GET /sign/:bucket/... -> Download signed file with token
  if (req.method === "GET" && subPath.startsWith("/sign/")) {
    try {
      const token = (req.query.token as string) || "";
      const decoded: any = token ? jwt.verify(token, SECRET) : null;
      const parts = subPath.replace(/^\/sign\//, "").split("/");
      const bucket = parts[0];
      const objectPath = parts.slice(1).join("/");
      if (decoded && (decoded.bucket !== bucket || decoded.objectPath !== objectPath)) {
        return res.status(403).json({ message: "Token não corresponde ao arquivo" });
      }
      const full = path.join(STORAGE_DIR, bucket, objectPath);
      if (!fs.existsSync(full)) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      const ext = path.extname(objectPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
      };
      const contentType = mimeTypes[ext] || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.sendFile(full);
    } catch {
      return res.status(403).json({ message: "Token inválido ou expirado" });
    }
  }

  // 4. GET /public/:bucket/... or GET /authenticated/:bucket/...
  if (req.method === "GET" && (subPath.startsWith("/public/") || subPath.startsWith("/authenticated/"))) {
    try {
      const parts = subPath.replace(/^\/(public|authenticated)\//, "").split("/");
      const bucket = parts[0];
      const objectPath = parts.slice(1).join("/");
      const full = path.join(STORAGE_DIR, bucket, objectPath);
      if (!fs.existsSync(full)) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      const ext = path.extname(objectPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.sendFile(full);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  // 5. DELETE /:bucket -> Remove files
  if (req.method === "DELETE") {
    try {
      const parts = subPath.replace(/^\//, "").split("/");
      const bucket = parts[0];
      const prefixes: string[] = req.body?.prefixes || [];
      for (const p of prefixes) {
        const full = path.join(STORAGE_DIR, bucket, p);
        if (fs.existsSync(full)) {
          try {
            fs.unlinkSync(full);
          } catch {}
        }
      }
      saveMockDataToDisk();
      return res.status(200).json(prefixes.map((name) => ({ name })));
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }

  next();
});

backendApp.use("/auth/v1", authRouter);
backendApp.use("/rest/v1", restRouter);
backendApp.use("/storage/v1", storageRouter);

export default backendApp;
