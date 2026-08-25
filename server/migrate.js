// Aplica, em ordem, os arquivos de sql/ e depois migrations/, usando o
// usuario "postgres" (super-usuario) definido em DATABASE_URL.
// Rode com: node migrate.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Defina DATABASE_URL no arquivo .env antes de rodar a migracao.");
  process.exit(1);
}

function parseDbName(url) {
  const u = new URL(url);
  return u.pathname.replace(/^\//, "") || "postgres";
}

async function ensureDatabaseExists() {
  const dbName = parseDbName(DATABASE_URL);
  const adminUrl = DATABASE_URL.replace(`/${dbName}`, "/postgres");
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (res.rowCount === 0) {
    console.log(`Criando banco "${dbName}"...`);
    await client.query(`CREATE DATABASE ${JSON.stringify(dbName).replace(/"/g, '"')}`);
  }
  await client.end();
}

async function runSqlFile(client, filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  console.log("  ->", path.basename(filePath));
  await client.query(sql);
}

async function main() {
  await ensureDatabaseExists();

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log("Aplicando estrutura base (roles, auth, storage stub)...");
  const sqlDir = path.join(__dirname, "sql");
  const sqlFiles = fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of sqlFiles) {
    await runSqlFile(client, path.join(sqlDir, f));
  }

  console.log("Aplicando as tabelas do seu sistema...");
  // Controle do que ja foi aplicado, para nao repetir migracoes a cada execucao.
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      arquivo text PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )
  `);
  const aplicadas = new Set(
    (await client.query("SELECT arquivo FROM public.schema_migrations")).rows.map((r) => r.arquivo),
  );

  const migDir = path.join(__dirname, "migrations");
  const migFiles = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of migFiles) {
    if (aplicadas.has(f)) {
      console.log("  (ja aplicada)", f);
      continue;
    }
    try {
      await client.query("BEGIN");
      await runSqlFile(client, path.join(migDir, f));
      await client.query("INSERT INTO public.schema_migrations (arquivo) VALUES ($1)", [f]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      const jaExiste = /already exists|ja existe|duplicate/i.test(err.message);
      if (jaExiste) {
        // Banco criado antes do controle de migracoes: marca como aplicada.
        await client.query(
          "INSERT INTO public.schema_migrations (arquivo) VALUES ($1) ON CONFLICT DO NOTHING",
          [f],
        );
        console.log(`  (ignorada, estrutura ja existia) ${f}`);
      } else {
        console.error(`Erro em ${f}:`, err.message);
      }
    }
  }

  await client.end();
  console.log("Pronto! Estrutura do banco aplicada.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
