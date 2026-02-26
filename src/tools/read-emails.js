/**
 * read-emails.js — Ferramenta MCP para ler e-mails via Outlook
 */

import { z } from "zod";
import { graphRequest } from "../graph.js";

export const readEmailsSchema = z.object({
  pasta: z
    .string()
    .optional()
    .default("inbox")
    .describe("Pasta a ler: 'inbox' (caixa de entrada), 'sentitems' (enviados), 'drafts' (rascunhos). Padrão: inbox"),
  quantidade: z
    .number()
    .optional()
    .default(10)
    .describe("Número de e-mails a retornar. Padrão: 10. Máximo: 50"),
  apenas_nao_lidos: z
    .boolean()
    .optional()
    .default(false)
    .describe("Se true, retorna apenas e-mails não lidos. Padrão: false"),
  busca: z
    .string()
    .optional()
    .describe("Texto para filtrar e-mails por assunto ou remetente"),
});

export async function readEmails(params) {
  const { pasta, quantidade, apenas_nao_lidos, busca } = params;

  const top = Math.min(quantidade, 50);

  // $search e $filter não podem ser combinados; $search também é incompatível com $orderby.
  // Estratégia: se há busca, usar $search (sem $orderby e sem $filter).
  // Se há apenas filtro de não-lidos, usar $filter com $orderby.
  let searchQuery = "";
  let filterQuery = "";
  let orderbyQuery = "&$orderby=receivedDateTime desc";

  if (busca) {
    searchQuery = `&$search=${encodeURIComponent(`"${busca}"`)}`;
    orderbyQuery = ""; // $search é incompatível com $orderby
  } else if (apenas_nao_lidos) {
    // $filter com $orderby requer índice — usar $filter sem $orderby para não-lidos
    filterQuery = `&$filter=${encodeURIComponent("isRead eq false")}`;
    orderbyQuery = ""; // evita InefficientFilter
  }

  const endpoint = `/me/mailFolders/${pasta}/messages?$top=${top}${orderbyQuery}&$select=id,subject,from,receivedDateTime,isRead,bodyPreview${filterQuery}${searchQuery}`;

  const result = await graphRequest("GET", endpoint);

  if (!result || !result.value || result.value.length === 0) {
    return "Nenhum e-mail encontrado.";
  }

  const emails = result.value.map((msg, i) => {
    const de = msg.from?.emailAddress?.name
      ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
      : msg.from?.emailAddress?.address || "Desconhecido";
    const data = new Date(msg.receivedDateTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const lido = msg.isRead ? "✓" : "●";
    const preview = msg.bodyPreview?.substring(0, 100) || "";

    return `${i + 1}. [${lido}] ${msg.subject || "(sem assunto)"}\n   De: ${de}\n   Data: ${data}\n   ${preview}...`;
  });

  const titulo = `E-mails (${pasta}) — ${emails.length} encontrado(s):\n${"─".repeat(50)}\n`;
  return titulo + emails.join("\n\n");
}
