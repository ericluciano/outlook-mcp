/**
 * auth.js — Autenticação OAuth via Device Code Flow
 * Execute: node auth.js
 * Abre o browser para login Microsoft e salva o token em .token-cache.json
 */

import { PublicClientApplication } from "@azure/msal-node";
import { CLIENT_ID, AUTHORITY, SCOPES, buildCachePlugin } from "./src/config.js";

async function authenticate() {
  const pca = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
    },
    cache: {
      cachePlugin: buildCachePlugin(),
    },
  });

  console.log("\n🔐 Iniciando autenticação Microsoft 365...\n");

  const response = await pca.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback: (info) => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("1. Acesse: " + info.verificationUri);
      console.log("2. Digite o código: " + info.userCode);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    },
  });

  console.log("✅ Autenticado com sucesso!");
  console.log("   Conta: " + response.account.username);
  console.log("   Token salvo em: .token-cache.json\n");
}

authenticate().catch((err) => {
  console.error("❌ Erro na autenticação:", err.message);
  process.exit(1);
});
