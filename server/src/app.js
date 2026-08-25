require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./auth");
const restRoutes = require("./rest");
const storageRoutes = require("./storage");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth/v1", authRoutes);
app.use("/rest/v1", restRoutes);
app.use("/storage/v1", storageRoutes);

module.exports = app;
