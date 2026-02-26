/**
 * send-email.js — Ferramenta MCP para envio de e-mail via Outlook
 */

import { z } from "zod";
import { graphRequest } from "../graph.js";
import { validateRecipients, checkRateLimit, registerAction } from "../guardrails.js";

export const sendEmailSchema = z.object({
  para: z
    .string()
    .describe(
      "E-mail do destinatário. Para múltiplos, separe por vírgula. O total de para + CC + CCO não pode ultrapassar 5."
    ),
  assunto: z.string().describe("Assunto do e-mail"),
  corpo: z.string().describe("Corpo do e-mail em texto simples ou HTML"),
  cc: z
    .string()
    .optional()
    .describe("E-mails em cópia (CC). Separe por vírgula se mais de um."),
  cco: z
    .string()
    .optional()
    .describe("E-mails em cópia oculta (CCO / BCC). Separe por vírgula se mais de um."),
  html: z
    .boolean()
    .optional()
    .default(false)
    .describe("Se true, o corpo será enviado como HTML. Padrão: false (texto simples)"),
  confirmacao: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Obrigatório true ao enviar o 11º e-mail da hora (ou múltiplos de 10). Confirma que você está ciente do volume."
    ),
});

export async function sendEmail(params) {
  const { para, assunto, corpo, cc, cco, html, confirmacao } = params;

  // 1. Valida total de destinatários (para + cc + cco ≤ 5)
  validateRecipients({ para, cc, cco });

  // 2. Verifica rate limit
  await checkRateLimit("email", confirmacao);

  const toRecipients = para.split(",").map((email) => ({
    emailAddress: { address: email.trim() },
  }));

  const ccRecipients = cc
    ? cc.split(",").map((email) => ({
        emailAddress: { address: email.trim() },
      }))
    : [];

  const bccRecipients = cco
    ? cco.split(",").map((email) => ({
        emailAddress: { address: email.trim() },
      }))
    : [];

  const message = {
    subject: assunto,
    body: {
      contentType: html ? "HTML" : "Text",
      content: corpo,
    },
    toRecipients,
    ...(ccRecipients.length > 0 && { ccRecipients }),
    ...(bccRecipients.length > 0 && { bccRecipients }),
  };

  await graphRequest("POST", "/me/sendMail", { message });

  // 3. Registra ação após sucesso
  await registerAction("email");

  const destinatarios = toRecipients.map((r) => r.emailAddress.address).join(", ");
  return `E-mail enviado com sucesso para: ${destinatarios}`;
}
