/**
 * index.js — Servidor MCP Outlook
 * Ferramentas: enviar_email, ler_emails, criar_compromisso, listar_compromissos
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { sendEmail, sendEmailSchema } from "./src/tools/send-email.js";
import { createEvent, createEventSchema } from "./src/tools/create-event.js";
import { readEmails, readEmailsSchema } from "./src/tools/read-emails.js";
import { listEvents, listEventsSchema } from "./src/tools/list-events.js";
import { searchContacts, searchContactsSchema } from "./src/tools/search-contacts.js";
import { checkAvailability, checkAvailabilitySchema } from "./src/tools/check-availability.js";
import { markEmail, markEmailSchema } from "./src/tools/mark-email.js";
import { updateEvent, updateEventSchema } from "./src/tools/update-event.js";
import { deleteEvent, deleteEventSchema } from "./src/tools/delete-event.js";
import { replyEmail, replyEmailSchema } from "./src/tools/reply-email.js";

const server = new McpServer({
  name: "outlook-mcp",
  version: "1.0.0",
});

function errMsg(err, contexto) {
  const hint = err.hint ? `\n💡 ${err.hint}` : "";
  return `Erro ao ${contexto}: ${err.message}${hint}`;
}

// ─── Ferramenta: Enviar E-mail ───────────────────────────────────────────────

server.tool(
  "enviar_email",
  "Envia um e-mail pelo Outlook da conta Microsoft 365 autenticada",
  sendEmailSchema.shape,
  async (params) => {
    try {
      const result = await sendEmail(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "enviar e-mail") }], isError: true };
    }
  }
);

// ─── Ferramenta: Criar Compromisso ───────────────────────────────────────────

server.tool(
  "criar_compromisso",
  "Cria um compromisso no Calendário do Outlook (Microsoft 365)",
  createEventSchema.shape,
  async (params) => {
    try {
      const result = await createEvent(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "criar compromisso") }], isError: true };
    }
  }
);

// ─── Ferramenta: Ler E-mails ─────────────────────────────────────────────────

server.tool(
  "ler_emails",
  "Lê e-mails do Outlook (caixa de entrada, enviados ou rascunhos) com opção de filtro",
  readEmailsSchema.shape,
  async (params) => {
    try {
      const result = await readEmails(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "ler e-mails") }], isError: true };
    }
  }
);

// ─── Ferramenta: Listar Compromissos ─────────────────────────────────────────

server.tool(
  "listar_compromissos",
  "Lista compromissos do Calendário do Outlook para uma data ou período",
  listEventsSchema.shape,
  async (params) => {
    try {
      const result = await listEvents(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "listar compromissos") }], isError: true };
    }
  }
);

// ─── Ferramenta: Buscar Contatos ─────────────────────────────────────────────

server.tool(
  "buscar_contato",
  "Busca contatos pelo nome no diretório Microsoft 365 (People API) retornando e-mail, cargo e telefone",
  searchContactsSchema.shape,
  async (params) => {
    try {
      const result = await searchContacts(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "buscar contato") }], isError: true };
    }
  }
);

// ─── Ferramenta: Verificar Disponibilidade ───────────────────────────────────

server.tool(
  "verificar_disponibilidade",
  "Verifica disponibilidade de uma ou mais pessoas do domínio Microsoft 365 em uma janela de tempo, encontrando automaticamente os horários livres em comum",
  checkAvailabilitySchema.shape,
  async (params) => {
    try {
      const result = await checkAvailability(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "verificar disponibilidade") }], isError: true };
    }
  }
);

// ─── Ferramenta: Marcar E-mail ────────────────────────────────────────────────

server.tool(
  "marcar_email",
  "Marca um e-mail como lido ou não lido no Outlook",
  markEmailSchema.shape,
  async (params) => {
    try {
      const result = await markEmail(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "marcar e-mail") }], isError: true };
    }
  }
);

// ─── Ferramenta: Atualizar Compromisso ───────────────────────────────────────

server.tool(
  "atualizar_compromisso",
  "Atualiza campos de um compromisso existente no Calendário do Outlook (título, descrição, local, horário, disponibilidade). Busca o evento pelo título e data.",
  updateEventSchema.shape,
  async (params) => {
    try {
      const result = await updateEvent(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "atualizar compromisso") }], isError: true };
    }
  }
);

// ─── Ferramenta: Deletar Compromisso ─────────────────────────────────────────

server.tool(
  "deletar_compromisso",
  "Deleta/cancela um compromisso do Calendário do Outlook. USE ESTA FERRAMENTA quando o usuário pedir para cancelar, deletar, remover ou excluir um compromisso. NÃO use atualizar_compromisso para cancelar — use esta. Busca pelo título e data, mostra preview e exige confirmacao: true para confirmar a exclusão definitiva.",
  deleteEventSchema.shape,
  async (params) => {
    try {
      const result = await deleteEvent(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "deletar compromisso") }], isError: true };
    }
  }
);

// ─── Ferramenta: Responder E-mail ─────────────────────────────────────────────

server.tool(
  "responder_email",
  "Responde a um e-mail existente mantendo o threading. Pode responder apenas ao remetente ou a todos. Aceita email_id diretamente ou busca pelo assunto.",
  replyEmailSchema.shape,
  async (params) => {
    try {
      const result = await replyEmail(params);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: errMsg(err, "responder e-mail") }], isError: true };
    }
  }
);

// ─── Inicialização ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
