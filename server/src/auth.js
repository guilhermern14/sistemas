const express = require("express");
const bcrypt = require("bcryptjs");
const { withDb } = require("./db");
const { signAccessToken, signRefreshToken, verifyToken, ACCESS_EXP_SECONDS } = require("./jwt");

const router = express.Router();

function userToGotrueShape(row) {
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

function sessionResponse(userRow) {
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

// ---------- login ----------
router.post("/token", async (req, res) => {
  const grantType = req.query.grant_type;
  try {
    if (grantType === "password") {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: "invalid_request", error_description: "email e senha são obrigatórios" });

      const row = await withDb("service_role", null, async (client) => {
        const r = await client.query("SELECT * FROM auth.users WHERE email = $1", [email]);
        return r.rows[0];
      });
      if (!row) return res.status(400).json({ error: "invalid_grant", error_description: "Invalid login credentials" });

      const ok = await bcrypt.compare(password, row.encrypted_password);
      if (!ok) return res.status(400).json({ error: "invalid_grant", error_description: "Invalid login credentials" });

      return res.json(sessionResponse(row));
    }

    if (grantType === "refresh_token") {
      const { refresh_token } = req.body || {};
      if (!refresh_token) return res.status(400).json({ error: "invalid_request" });
      let decoded;
      try {
        decoded = verifyToken(refresh_token);
      } catch {
        return res.status(401).json({ error: "invalid_grant", error_description: "Invalid refresh token" });
      }
      const row = await withDb("service_role", null, async (client) => {
        const r = await client.query("SELECT * FROM auth.users WHERE id = $1", [decoded.sub]);
        return r.rows[0];
      });
      if (!row) return res.status(401).json({ error: "invalid_grant" });
      return res.json(sessionResponse(row));
    }

    return res.status(400).json({ error: "unsupported_grant_type" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

// ---------- signup público (não usado pelas telas hoje, mas disponível) ----------
router.post("/signup", async (req, res) => {
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
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "user_already_exists", error_description: "Já existe um usuário com esse e-mail." });
    console.error(err);
    return res.status(500).json({ error: "server_error", error_description: err.message });
  }
});

// ---------- usuário atual (usado por getClaims/getUser) ----------
router.get("/user", async (req, res) => {
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

router.post("/logout", (req, res) => {
  // JWT sem estado - não há sessão para invalidar no servidor.
  res.status(204).end();
});

// ---------- admin (usa a SERVICE_ROLE_KEY, chamado só pelo servidor) ----------
function requireServiceRole(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.apikey;
  try {
    const decoded = verifyToken(token);
    if (decoded.role !== "service_role") throw new Error("not service role");
    next();
  } catch {
    return res.status(401).json({ error: "not_authorized" });
  }
}

router.get("/admin/users", requireServiceRole, async (req, res) => {
  const rows = await withDb("service_role", null, async (client) => {
    const r = await client.query("SELECT * FROM auth.users ORDER BY created_at");
    return r.rows;
  });
  res.json({ users: rows.map(userToGotrueShape), aud: "authenticated" });
});

router.post("/admin/users", requireServiceRole, async (req, res) => {
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
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "user_already_exists", msg: "Já existe um usuário com esse e-mail." });
    console.error(err);
    res.status(500).json({ error: "server_error", msg: err.message });
  }
});

router.delete("/admin/users/:id", requireServiceRole, async (req, res) => {
  await withDb("service_role", null, async (client) => {
    await client.query("DELETE FROM auth.users WHERE id = $1", [req.params.id]);
  });
  res.status(200).json({});
});

module.exports = router;
