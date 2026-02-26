/**
 * guardrails.js — Motor de proteção do outlook-mcp
 * Rate limit persistente + validações de segurança para envio de e-mail e criação de eventos.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RATE_LIMIT_PATH = path.join(__dirname, "../.rate-limit.json");

const LIMIT = 10;
const WINDOW_MS = 3_600_000; // 1 hora em ms

// ─── Helpers de arquivo ───────────────────────────────────────────────────────

function readRateLimitFile() {
  if (fs.existsSync(RATE_LIMIT_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(RATE_LIMIT_PATH, "utf-8"));
      // Garante que ambas as entradas existem e têm a estrutura correta
      const defaults = getDefaultData();
      return {
        email: (parsed.email?.count !== undefined && parsed.email?.window_start) ? parsed.email : defaults.email,
        event: (parsed.event?.count !== undefined && parsed.event?.window_start) ? parsed.event : defaults.event,
      };
    } catch {
      // arquivo corrompido → reinicia
    }
  }
  return getDefaultData();
}

function writeRateLimitFile(data) {
  fs.writeFileSync(RATE_LIMIT_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getDefaultData() {
  const now = new Date().toISOString();
  return {
    email: { count: 0, window_start: now },
    event: { count: 0, window_start: now },
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Verifica se o domínio (email|event) está dentro do limite.
 * Se count >= 10 e confirmacao !== true → lança Error.
 * Se count >= 10 e confirmacao === true → reseta janela e continua.
 */
export async function checkRateLimit(domain, confirmacao = false) {
  const data = readRateLimitFile();
  const entry = data[domain];
  const now = Date.now();

  // Reseta janela automaticamente após 1 hora
  if (now - new Date(entry.window_start).getTime() >= WINDOW_MS) {
    entry.count = 0;
    entry.window_start = new Date(now).toISOString();
    writeRateLimitFile(data);
  }

  if (entry.count >= LIMIT) {
    if (confirmacao !== true) {
      const tipo = domain === "email" ? "e-mails" : "compromissos";
      throw new Error(
        `Limite de ${LIMIT} ${tipo}/hora atingido (${entry.count} realizados). ` +
          `Para continuar, inclua confirmacao: true na próxima chamada.`
      );
    }
    // Com confirmacao: true → reseta e continua
    entry.count = 0;
    entry.window_start = new Date(now).toISOString();
    writeRateLimitFile(data);
  }
}

/**
 * Incrementa o contador após uma ação bem-sucedida.
 */
export async function registerAction(domain) {
  const data = readRateLimitFile();
  data[domain].count = (data[domain].count || 0) + 1;
  writeRateLimitFile(data);
}

/**
 * Valida que o campo `para` não ultrapassa 5 destinatários.
 * @param {string} para - string com e-mails separados por vírgula
 */
export function validateRecipients(para) {
  const emails = para.split(",").map((e) => e.trim()).filter(Boolean);
  if (emails.length > 5) {
    throw new Error(
      `Envio bloqueado: máximo de 5 destinatários por e-mail. Informados: ${emails.length}.`
    );
  }
}

/**
 * Garante que o payload de evento não contém campos de recorrência.
 * @param {object} params - parâmetros da criação de evento
 */
export function validateNotRecurring(params) {
  // Bloqueia qualquer valor truthy OU objeto (incluindo {}) nos campos de recorrência.
  // Nota: string vazia "" é falsy e não representa recorrência real na Graph API.
  const hasRecurrence = params.recurrence != null && params.recurrence !== "";
  const hasMasterId = params.seriesMasterId != null && params.seriesMasterId !== "";
  if (hasRecurrence || hasMasterId) {
    throw new Error(
      "Operação bloqueada: eventos recorrentes não são permitidos neste MCP. " +
        "Crie apenas instâncias únicas (sem campos de recorrência)."
    );
  }
}

// ─── Exporta constantes para uso nos testes ───────────────────────────────────
export { LIMIT, WINDOW_MS, RATE_LIMIT_PATH, getDefaultData, readRateLimitFile, writeRateLimitFile };
