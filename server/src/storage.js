const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { verifyToken } = require("./jwt");

const router = express.Router();
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage-data");
const SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
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

function safeJoin(bucket, objectPath) {
  const full = path.join(STORAGE_DIR, bucket, objectPath);
  const base = path.join(STORAGE_DIR, bucket);
  if (!full.startsWith(base)) throw new Error("Caminho inválido");
  return full;
}

// upload: POST /object/:bucket/*  (corpo = bytes brutos do arquivo)
router.post(
  "/object/:bucket/*",
  requireAuth,
  express.raw({ type: "*/*", limit: "50mb" }),
  (req, res) => {
    try {
      const bucket = req.params.bucket;
      const objectPath = req.params[0];
      const dest = safeJoin(bucket, objectPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, req.body);
      res.status(200).json({ Key: `${bucket}/${objectPath}` });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

// remover: DELETE /object/:bucket   body: { prefixes: ["caminho1", "caminho2"] }
router.delete("/object/:bucket", requireAuth, express.json(), (req, res) => {
  try {
    const bucket = req.params.bucket;
    const prefixes = (req.body && req.body.prefixes) || [];
    for (const p of prefixes) {
      const full = safeJoin(bucket, p);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
    res.status(200).json({ message: "removido" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// criar URL assinada: POST /object/sign/:bucket/*
router.post("/object/sign/:bucket/*", requireAuth, express.json(), (req, res) => {
  try {
    const bucket = req.params.bucket;
    const objectPath = req.params[0];
    const expiresIn = (req.body && req.body.expiresIn) || 3600;
    const token = jwt.sign({ bucket, objectPath }, SECRET, { expiresIn });
    res.json({ signedURL: `/object/sign/${bucket}/${objectPath}?token=${token}` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// servir o arquivo com o token assinado: GET /object/sign/:bucket/*?token=...
router.get("/object/sign/:bucket/*", (req, res) => {
  try {
    const decoded = jwt.verify(req.query.token, SECRET);
    const bucket = req.params.bucket;
    const objectPath = req.params[0];
    if (decoded.bucket !== bucket || decoded.objectPath !== objectPath) {
      return res.status(403).json({ message: "Token não corresponde ao arquivo" });
    }
    const full = safeJoin(bucket, objectPath);
    if (!fs.existsSync(full)) return res.status(404).json({ message: "Arquivo não encontrado" });
    res.sendFile(full);
  } catch (err) {
    res.status(403).json({ message: "Token inválido ou expirado" });
  }
});

module.exports = router;
