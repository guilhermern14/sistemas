require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./auth");
const restRoutes = require("./rest");
const storageRoutes = require("./storage");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth/v1", authRoutes);
app.use("/rest/v1", restRoutes);
app.use("/storage/v1", storageRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Backend do Nascimento Sistemas rodando em http://localhost:${PORT}`);
});
