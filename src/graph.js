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

/**
 * graphRequestPaginated — Faz GET com paginação automática via @odata.nextLink.
 * Segue páginas até atingir o teto máximo (maxItems) ou não haver mais resultados.
 */
export async function graphRequestPaginated(endpoint, maxItems = 1000) {
  let allItems = [];
  let nextEndpoint = endpoint;

  while (nextEndpoint && allItems.length < maxItems) {
    // Se nextEndpoint é URL completa (nextLink), usar direto; senão prefixar com GRAPH_BASE
    const isFullUrl = nextEndpoint.startsWith("https://");
    const token = await getAccessToken();
    const url = isFullUrl ? nextEndpoint : `${GRAPH_BASE}${nextEndpoint}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      const err = new Error(`Graph API error ${response.status}: ${error}`);
      err.statusCode = response.status;
      if (response.status === 401) err.hint = "Token expirado. Execute: node auth.js";
      if (response.status === 403) err.hint = "Sem permissão para esta ação.";
      if (response.status === 429) err.hint = "Rate limit atingido. Aguarde e tente novamente.";
      throw err;
    }

    const text = await response.text();
    if (!text) break;

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error(`Graph API retornou resposta inválida: ${text.substring(0, 200)}`);
    }

    if (result.value) {
      allItems = allItems.concat(result.value);
    }

    // Seguir próxima página se existir e não ultrapassou teto
    nextEndpoint = (result["@odata.nextLink"] && allItems.length < maxItems)
      ? result["@odata.nextLink"]
      : null;
  }

  return { value: allItems.slice(0, maxItems) };
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
    const err = new Error(`Graph API error ${response.status}: ${error}`);
    err.statusCode = response.status;
    // Mensagens amigáveis para erros comuns
    if (response.status === 401) err.hint = "Token expirado. Execute: node auth.js";
    if (response.status === 403) err.hint = "Sem permissão para esta ação. Verifique os escopos do app Azure.";
    if (response.status === 429) err.hint = "Rate limit atingido. Aguarde alguns segundos e tente novamente.";
    throw err;
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
