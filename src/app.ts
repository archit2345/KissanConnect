import express from "express";
import cors from "cors";
import helmet from "helmet";
import { prisma } from "./db/index.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "kisanconnect-api" });
});

app.get("/health/db", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", database: "connected" });
});

export default app;
