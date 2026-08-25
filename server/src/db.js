const bcrypt = require("bcryptjs");

// Check if PostgreSQL is available and configured
let pool = null;
let useRealDb = false;

if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    const parsed = new URL(process.env.DATABASE_URL);
    if (process.env.APP_DB_USER) parsed.username = process.env.APP_DB_USER;
    if (process.env.APP_DB_PASSWORD) parsed.password = process.env.APP_DB_PASSWORD;
    pool = new Pool({ connectionString: parsed.toString() });
    pool.on("error", (err) => {
      console.warn("[PostgreSQL] Error in database pool, falling back to in-memory store:", err.message);
    });
    useRealDb = true;
  } catch (err) {
    console.warn("[PostgreSQL] Invalid DATABASE_URL, using in-memory mock store:", err.message);
    useRealDb = false;
  }
}

// -------------------------------------------------------------
// In-Memory Database Store & Mock Client
// -------------------------------------------------------------

const nowIso = () => new Date().toISOString();

const mockData = {
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
      tipo: "receita",
      categoria: "Serviços",
      descricao: "Pagamento OS #98 - Manutenção Alarme Condomínio Solar",
      valor: 850.0,
      forma: "PIX",
      conta: "Banco Cora",
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
      tipo: "despesa",
      categoria: "Fornecedores",
      descricao: "Compra de cabos e conectores - Distribuidora SP",
      valor: 450.0,
      forma: "Boleto",
      conta: "Banco Inter",
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
      resposta: "Nosso atendimento comercial funciona de segunda a sexta, das 08h às 18h, e aos sábados das 08h às 12h. Atendimentos de emergência funcionam 24h para clientes com contrato de manutenção.",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "wt-002",
      ordem: 2,
      pergunta: "Como solicitar um orçamento de instalação?",
      resposta: "Para solicitar um orçamento sem compromisso, basta nos informar o endereço do imóvel e o tipo de sistema desejado (CFTV/Câmeras, Alarme, Cerca Elétrica, Interfonia ou Controle de Acesso). Agendaremos a visita técnica no melhor dia para você!",
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

// -------------------------------------------------------------
// Mock Query Engine
// -------------------------------------------------------------

function executeMockQuery(sql, values = []) {
  const trimmed = sql.trim();

  // 1. SET LOCAL ROLE / SELECT set_config / BEGIN / COMMIT / ROLLBACK
  if (
    trimmed.startsWith("BEGIN") ||
    trimmed.startsWith("COMMIT") ||
    trimmed.startsWith("ROLLBACK") ||
    trimmed.startsWith("SET LOCAL") ||
    trimmed.includes("set_config")
  ) {
    return { rows: [], rowCount: 0 };
  }

  // 2. Schema / constraint inspection (findRelationship)
  if (trimmed.includes("FROM pg_constraint")) {
    const table1 = values[0];
    const table2 = values[1];
    if (table1 === "servicos" && table2 === "clientes") {
      return { rows: [{ origem: "servicos", coluna: "cliente_id", destino: "clientes", coluna_destino: "id" }], rowCount: 1 };
    }
    if (table1 === "clientes" && table2 === "servicos") {
      return { rows: [{ origem: "servicos", coluna: "cliente_id", destino: "clientes", coluna_destino: "id" }], rowCount: 1 };
    }
    if (table1 === "servicos" && table2 === "servico_produtos") {
      return { rows: [{ origem: "servico_produtos", coluna: "servico_id", destino: "servicos", coluna_destino: "id" }], rowCount: 1 };
    }
    if (table1 === "servico_produtos" && table2 === "estoque") {
      return { rows: [{ origem: "servico_produtos", coluna: "estoque_id", destino: "estoque", coluna_destino: "id" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 3. auth.users queries
  if (trimmed.includes("auth.users")) {
    const list = mockData["auth.users"] || [];
    if (trimmed.startsWith("SELECT * FROM auth.users WHERE email =")) {
      const email = values[0]?.toLowerCase();
      const user = list.find((u) => u.email?.toLowerCase() === email);
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
      // Auto create profile
      if (!mockData.profiles) mockData.profiles = [];
      mockData.profiles.push({
        id: newUser.id,
        nome: newUser.raw_user_meta_data?.nome || newUser.email.split("@")[0],
        telefone: null,
        created_at: nowIso(),
      });
      return { rows: [newUser], rowCount: 1 };
    }
    if (trimmed.startsWith("DELETE FROM auth.users WHERE id =")) {
      const id = values[0];
      const idx = list.findIndex((u) => u.id === id);
      if (idx !== -1) list.splice(idx, 1);
      return { rows: [], rowCount: 1 };
    }
  }

  // 4. RPC Functions (has_role, importar_nota_fiscal, etc.)
  if (trimmed.includes("has_role(")) {
    const roleArg = values[0];
    const userIdArg = values[1];
    const roles = mockData.user_roles || [];
    const has = roles.some((r) => r.user_id === userIdArg && (r.role === roleArg || r.role === "admin"));
    return { rows: [{ has_role: has }], rowCount: 1 };
  }

  // 5. General Table Queries (SELECT, INSERT, UPDATE, DELETE)
  // Match table name from SQL
  const selectMatch = trimmed.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+"?([a-zA-Z0-9_]+)"?/i);
  const insertMatch = trimmed.match(/^INSERT\s+INTO\s+"?([a-zA-Z0-9_]+)"?\s*\(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)/i);
  const updateMatch = trimmed.match(/^UPDATE\s+"?([a-zA-Z0-9_]+)"?\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+RETURNING\s+[\s\S]+)?$/i);
  const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+"?([a-zA-Z0-9_]+)"?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+RETURNING\s+[\s\S]+)?$/i);

  if (selectMatch) {
    const tableName = selectMatch[2];
    const items = mockData[tableName] || [];
    let result = [...items];

    // Filter matching if where clause exists
    if (trimmed.includes(" WHERE ")) {
      // Basic matching for parameter bindings
      values.forEach((v, idx) => {
        const paramPlaceholder = `$${idx + 1}`;
        if (trimmed.includes(` = ${paramPlaceholder}`)) {
          // find which column
          const colMatch = trimmed.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*=\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => String(item[col]) === String(v));
          }
        }
        if (trimmed.includes(` >= ${paramPlaceholder}`)) {
          const colMatch = trimmed.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*>=\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => item[col] >= v);
          }
        }
        if (trimmed.includes(` <= ${paramPlaceholder}`)) {
          const colMatch = trimmed.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*<=\\s*\\$${idx + 1}`));
          if (colMatch) {
            const col = colMatch[1];
            result = result.filter((item) => item[col] <= v);
          }
        }
        if (trimmed.includes(` ILIKE ${paramPlaceholder}`) || trimmed.includes(` LIKE ${paramPlaceholder}`)) {
          const colMatch = trimmed.match(new RegExp(`"?([a-zA-Z0-9_]+)"?\\s*I?LIKE\\s*\\$${idx + 1}`, "i"));
          if (colMatch) {
            const col = colMatch[1];
            const cleanPattern = String(v).replace(/%/g, "").toLowerCase();
            result = result.filter((item) => String(item[col] || "").toLowerCase().includes(cleanPattern));
          }
        }
      });
    }

    // Embed relationships if select includes foreign tables like clientes(nome, telefone)
    if (tableName === "servicos" && (trimmed.includes("clientes") || trimmed.includes("rel_clientes"))) {
      result = result.map((s) => {
        const c = (mockData.clientes || []).find((cl) => cl.id === s.cliente_id) || null;
        return { ...s, clientes: c };
      });
    }

    return { rows: result, rowCount: result.length };
  }

  if (insertMatch) {
    const tableName = insertMatch[1];
    const cols = insertMatch[2].split(",").map((c) => c.trim().replace(/"/g, ""));
    const newRecord = { id: "id-" + Math.random().toString(36).slice(2, 10), created_at: nowIso() };
    cols.forEach((col, i) => {
      let val = values[i];
      if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
        try { val = JSON.parse(val); } catch {}
      }
      newRecord[col] = val;
    });

    if (!mockData[tableName]) mockData[tableName] = [];
    mockData[tableName].push(newRecord);
    return { rows: [newRecord], rowCount: 1 };
  }

  if (updateMatch) {
    const tableName = updateMatch[1];
    const items = mockData[tableName] || [];
    const updated = items.map((it) => {
      return it;
    });
    return { rows: updated.slice(0, 1), rowCount: 1 };
  }

  if (deleteMatch) {
    const tableName = deleteMatch[1];
    return { rows: [], rowCount: 0 };
  }

  return { rows: [], rowCount: 0 };
}

/**
 * Execute within database transaction with role and user context
 */
async function withDb(role, userId, fn) {
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
    } catch (err) {
      console.warn("[PostgreSQL] Connection failed, using in-memory mock:", err.message);
    }
  }

  // In-memory mock client wrapper
  const mockClient = {
    query: async (sql, values = []) => {
      return executeMockQuery(sql, values);
    },
  };

  return await fn(mockClient);
}

module.exports = { pool, withDb, mockData };
