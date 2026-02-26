/**
 * send-email.js — Ferramenta MCP para envio de e-mail via Outlook
 */

import { z } from "zod";
import { graphRequest } from "../graph.js";

export const sendEmailSchema = z.object({
  para: z
    .string()
    .describe("E-mail do destinatário. Para múltiplos, separe por vírgula."),
  assunto: z.string().describe("Assunto do e-mail"),
  corpo: z.string().describe("Corpo do e-mail em texto simples ou HTML"),
  cc: z
    .string()
    .optional()
    .describe("E-mails em cópia (CC). Separe por vírgula se mais de um."),
  html: z
    .boolean()
    .optional()
    .default(false)
    .describe("Se true, o corpo será enviado como HTML. Padrão: false (texto simples)"),
});

export async function sendEmail(params) {
  const { para, assunto, corpo, cc, html } = params;

  const toRecipients = para.split(",").map((email) => ({
    emailAddress: { address: email.trim() },
  }));

  const ccRecipients = cc
    ? cc.split(",").map((email) => ({
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
  };

  await graphRequest("POST", "/me/sendMail", { message });

  const destinatarios = toRecipients.map((r) => r.emailAddress.address).join(", ");
  return `E-mail enviado com sucesso para: ${destinatarios}`;
}
