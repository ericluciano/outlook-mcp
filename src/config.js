/**
 * config.js — Configurações compartilhadas do Azure / Microsoft Graph
 * Importado por auth.js e src/graph.js para evitar duplicação.
 *
 * Variáveis de ambiente (opcional): OUTLOOK_CLIENT_ID, OUTLOOK_TENANT_ID
 * Se não definidas, usa os valores padrão do app Azure cadastrado.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CLIENT_ID = process.env.OUTLOOK_CLIENT_ID ?? "b044cdc1-5c75-4c25-be87-46e51f036ae6";
export const TENANT_ID = process.env.OUTLOOK_TENANT_ID ?? "ac4a752a-850f-4705-9525-7270b98b20b4";
export const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const SCOPES = [
  "Mail.Send",
  "Mail.Read",
  "Calendars.ReadWrite",
  "People.Read",
  "offline_access",
  "User.Read",
];

// Token cache fica na raiz do projeto (um nível acima de src/)
export const TOKEN_CACHE_PATH = path.join(__dirname, "../.token-cache.json");

export function buildCachePlugin() {
  return {
    beforeCacheAccess: async (cacheContext) => {
      if (fs.existsSync(TOKEN_CACHE_PATH)) {
        cacheContext.tokenCache.deserialize(
          fs.readFileSync(TOKEN_CACHE_PATH, "utf-8")
        );
      }
    },
    afterCacheAccess: async (cacheContext) => {
      if (cacheContext.cacheHasChanged) {
        fs.writeFileSync(
          TOKEN_CACHE_PATH,
          cacheContext.tokenCache.serialize(),
          { mode: 0o600 }
        );
      }
    },
  };
}
