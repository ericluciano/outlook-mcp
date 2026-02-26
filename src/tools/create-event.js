/**
 * create-event.js — Ferramenta MCP para criar compromissos no Calendário
 */

import { z } from "zod";
import { graphRequest } from "../graph.js";

export const createEventSchema = z.object({
  titulo: z.string().describe("Título do compromisso"),
  inicio: z
    .string()
    .describe(
      "Data e hora de início no formato ISO 8601. Ex: 2026-03-10T14:00:00"
    ),
  fim: z
    .string()
    .describe(
      "Data e hora de término no formato ISO 8601. Ex: 2026-03-10T15:00:00"
    ),
  descricao: z
    .string()
    .optional()
    .describe("Descrição ou pauta do compromisso"),
  local: z.string().optional().describe("Local do compromisso ou link da reunião"),
  convidados: z
    .string()
    .optional()
    .describe("E-mails dos convidados separados por vírgula"),
  dia_inteiro: z
    .boolean()
    .optional()
    .default(false)
    .describe("Se true, cria como evento de dia inteiro (ignora hora de início/fim)"),
  fuso_horario: z
    .string()
    .optional()
    .default("America/Sao_Paulo")
    .describe("Fuso horário do evento. Padrão: America/Sao_Paulo"),
});

export async function createEvent(params) {
  const { titulo, inicio, fim, descricao, local, convidados, dia_inteiro, fuso_horario } = params;

  const attendees = convidados
    ? convidados.split(",").map((email) => ({
        emailAddress: { address: email.trim() },
        type: "required",
      }))
    : [];

  const event = {
    subject: titulo,
    isAllDay: dia_inteiro,
    start: {
      dateTime: inicio,
      timeZone: fuso_horario,
    },
    end: {
      dateTime: fim,
      timeZone: fuso_horario,
    },
    ...(descricao && {
      body: {
        contentType: "Text",
        content: descricao,
      },
    }),
    ...(local && {
      location: {
        displayName: local,
      },
    }),
    ...(attendees.length > 0 && { attendees }),
  };

  const result = await graphRequest("POST", "/me/events", event);

  const link = result.webLink || "";
  const convidadosStr =
    attendees.length > 0
      ? ` | Convidados: ${attendees.map((a) => a.emailAddress.address).join(", ")}`
      : "";

  // result.start.dateTime retornado pela API não tem sufixo de timezone — exibir diretamente
  const iniExib = result.start.dateTime.replace("T", " ").substring(0, 16);
  const fimExib = result.end.dateTime.replace("T", " ").substring(0, 16);

  return `Compromisso criado com sucesso!\n- Título: ${result.subject}\n- Início: ${iniExib} (${fuso_horario})\n- Fim: ${fimExib}${convidadosStr}\n- Link: ${link}`;
}
