/**
 * graph.js — Cliente Microsoft Graph API
 * Responsável por obter token válido e fazer chamadas à API
 */

import { PublicClientApplication } from "@azure/msal-node";
import fs from "fs";
import { CLIENT_ID, AUTHORITY, SCOPES, GRAPH_BASE, TOKEN_CACHE_PATH, buildCachePlugin } from "./config.js";

let _pca = null;

function getPca() {
  if (!_pca) {
    _pca = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
      },
      cache: {
        cachePlugin: buildCachePlugin(),
      },
    });
  }
  return _pca;
}

async function getAccessToken() {
  if (!fs.existsSync(TOKEN_CACHE_PATH)) {
    throw new Error(
      "Token não encontrado. Execute primeiro: node auth.js"
    );
  }

  const pca = getPca();

  const tokenCache = pca.getTokenCache();
  const serialized = fs.readFileSync(TOKEN_CACHE_PATH, "utf-8");
  tokenCache.deserialize(serialized);

  const accounts = await tokenCache.getAllAccounts();

  if (!accounts || accounts.length === 0) {
    throw new Error(
      "Nenhuma conta encontrada no cache. Execute: node auth.js"
    );
  }

  const response = await pca.acquireTokenSilent({
    scopes: SCOPES,
    account: accounts[0],
  });

  return response.accessToken;
}

export async function graphRequest(method, endpoint, body = null) {
  const token = await getAccessToken();

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${GRAPH_BASE}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph API error ${response.status}: ${error}`);
  }

  if (response.status === 204 || response.status === 202) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Graph API retornou resposta inválida: ${text.substring(0, 200)}`);
  }
}
