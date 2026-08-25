const express = require("express");
const { withDb } = require("./db");
const { verifyToken } = require("./jwt");

const router = express.Router();

// identifica papel (anon/authenticated/service_role) e usuario a partir do
// header Authorization, igual o PostgREST faz a partir do JWT.
function getAuthContext(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const apikey = req.headers.apikey;
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
function quoteIdent(name) {
  if (!SAFE_IDENT.test(name)) throw new Error(`Nome inválido: ${name}`);
  return `"${name}"`;
}

// Divide a lista de colunas respeitando parenteses:
// "*, clientes(nome, telefone)" -> ["*", "clientes(nome, telefone)"]
function splitSelectTokens(selectParam) {
  const tokens = [];
  let depth = 0;
  let atual = "";
  for (const ch of selectParam) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      tokens.push(atual);
      atual = "";
    } else {
      atual += ch;
    }
  }
  if (atual.trim()) tokens.push(atual);
  return tokens.map((t) => t.trim()).filter(Boolean);
}

// Descobre como duas tabelas se relacionam, olhando as chaves estrangeiras.
async function findRelationship(client, baseTable, relTable) {
  // Usa o catalogo do Postgres (visivel para qualquer role) em vez de
  // information_schema, que esconde constraints de tabelas que a role nao possui.
  const sql = `
    SELECT origem.relname AS origem,
           att_origem.attname AS coluna,
           destino.relname AS destino,
           att_destino.attname AS coluna_destino
    FROM pg_constraint c
    JOIN pg_class origem ON origem.oid = c.conrelid
    JOIN pg_class destino ON destino.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = origem.relnamespace
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS cfk(attnum, ord) ON cfk.ord = ck.ord
    JOIN pg_attribute att_origem ON att_origem.attrelid = c.conrelid AND att_origem.attnum = ck.attnum
    JOIN pg_attribute att_destino ON att_destino.attrelid = c.confrelid AND att_destino.attnum = cfk.attnum
    WHERE c.contype = 'f'
      AND ns.nspname = 'public'
      AND ((origem.relname = $1 AND destino.relname = $2) OR (origem.relname = $2 AND destino.relname = $1))
    LIMIT 1
  `;
  const r = await client.query(sql, [baseTable, relTable]);
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  return row.origem === baseTable
    ? { tipo: "um", coluna: row.coluna, colunaDestino: row.coluna_destino }
    : { tipo: "muitos", coluna: row.coluna, colunaDestino: row.coluna_destino };
}

function relColumnsExpr(alias, colsRaw) {
  const inner = colsRaw.trim();
  if (!inner || inner === "*") return `to_jsonb(${alias})`;
  const cols = inner
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const pares = cols.map((c) => `'${c.replace(/'/g, "''")}', ${alias}.${quoteIdent(c)}`).join(", ");
  return `jsonb_build_object(${pares})`;
}

// Monta a lista de colunas do SELECT, incluindo tabelas relacionadas
// no formato do PostgREST: "*, clientes(nome, telefone)".
async function buildSelect(client, table, selectParam) {
  if (!selectParam || selectParam === "*") return "*";
  const partes = [];
  for (const token of splitSelectTokens(selectParam)) {
    const m = token.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/s);
    if (!m) {
      partes.push(token === "*" ? "*" : quoteIdent(token));
      continue;
    }
    const relTable = m[1];
    const rel = await findRelationship(client, table, relTable);
    if (!rel) throw new Error(`Relacionamento nao encontrado entre ${table} e ${relTable}`);
    const alias = "rel_" + relTable;
    const objeto = relColumnsExpr(quoteIdent(alias), m[2]);
    if (rel.tipo === "um") {
      partes.push(
        `(SELECT ${objeto} FROM ${quoteIdent(relTable)} ${quoteIdent(alias)} ` +
          `WHERE ${quoteIdent(alias)}.${quoteIdent(rel.colunaDestino)} = ${quoteIdent(table)}.${quoteIdent(rel.coluna)}) AS ${quoteIdent(relTable)}`,
      );
    } else {
      partes.push(
        `(SELECT COALESCE(jsonb_agg(${objeto}), '[]'::jsonb) FROM ${quoteIdent(relTable)} ${quoteIdent(alias)} ` +
          `WHERE ${quoteIdent(alias)}.${quoteIdent(rel.coluna)} = ${quoteIdent(table)}.${quoteIdent(rel.colunaDestino)}) AS ${quoteIdent(relTable)}`,
      );
    }
  }
  return partes.map((p) => (p === "*" ? `${quoteIdent(table)}.*` : p)).join(", ");
}


function parseFilters(query) {
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);
  const clauses = [];
  const values = [];
  for (const [key, rawValue] of Object.entries(query)) {
    if (reserved.has(key)) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
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
    } else if (op === "not") {
      // formato: not.eq.valor / not.is.null
      const segundoPonto = val.indexOf(".");
      const op2 = segundoPonto === -1 ? val : val.slice(0, segundoPonto);
      const val2 = segundoPonto === -1 ? "" : val.slice(segundoPonto + 1);
      if (op2 === "is") {
        if (val2 === "null") clauses.push(`${col} IS NOT NULL`);
        else if (val2 === "true") clauses.push(`${col} IS NOT TRUE`);
        else if (val2 === "false") clauses.push(`${col} IS NOT FALSE`);
      } else if (op2 === "eq") {
        values.push(val2);
        clauses.push(`${col} IS DISTINCT FROM $${values.length}`);
      } else if (op2 === "in") {
        const inner = val2.replace(/^\(/, "").replace(/\)$/, "");
        const items = inner.length ? inner.split(",").map((s) => s.trim().replace(/^"|"$/g, "")) : [];
        const placeholders = items.map((it) => {
          values.push(it);
          return `$${values.length}`;
        });
        clauses.push(placeholders.length ? `${col} NOT IN (${placeholders.join(",")})` : "TRUE");
      }
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

function parseOrder(orderParam) {
  if (!orderParam) return "";
  const parts = orderParam.split(",").map((p) => {
    const [col, dir] = p.split(".");
    const direction = dir === "desc" ? "DESC" : "ASC";
    return `${quoteIdent(col.trim())} ${direction}`;
  });
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

function parseRange(req) {
  const rangeHeader = req.headers.range;
  if (rangeHeader && /^\d+-\d+$/.test(rangeHeader)) {
    const [from, to] = rangeHeader.split("-").map(Number);
    return `LIMIT ${to - from + 1} OFFSET ${from}`;
  }
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
  const offset = req.query.offset ? parseInt(req.query.offset, 10) : null;
  if (limit != null) return `LIMIT ${limit}${offset != null ? ` OFFSET ${offset}` : ""}`;
  return "";
}

function wantsSingleObject(req) {
  const accept = req.headers.accept || "";
  return accept.includes("vnd.pgrst.object+json");
}

router.get("/:table", async (req, res) => {
  const { role, userId } = getAuthContext(req);
  const table = req.params.table;
  try {
    const { where, values } = parseFilters(req.query);
    const order = parseOrder(req.query.order);
    const range = parseRange(req);

    const rows = await withDb(role, userId, async (client) => {
      const cols = await buildSelect(client, table, req.query.select);
      const sql = `SELECT ${cols} FROM ${quoteIdent(table)} ${where} ${order} ${range}`.trim();
      const r = await client.query(sql, values);
      return r.rows;
    });

    if (wantsSingleObject(req)) {
      return res.json(rows[0] ?? null);
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

router.post("/:table", async (req, res) => {
  const { role, userId } = getAuthContext(req);
  const table = req.params.table;
  const isUpsert = (req.headers.prefer || "").includes("resolution=merge-duplicates");
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
          const conflictCol = req.query.on_conflict || "id";
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
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

router.patch("/:table", async (req, res) => {
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
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

router.delete("/:table", async (req, res) => {
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
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

// chamadas de função (rpc), ex: has_role, importar_nota_fiscal
router.post("/rpc/:fn", async (req, res) => {
  const { role, userId } = getAuthContext(req);
  const fn = req.params.fn;
  if (!SAFE_IDENT.test(fn)) return res.status(400).json({ message: "nome de função inválido" });
  const args = req.body || {};
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
    if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
      return res.json(Object.values(rows[0])[0]);
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
