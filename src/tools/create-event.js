/**
 * create-event.js — Ferramenta MCP para criar compromissos no Calendário
 */

import { z } from "zod";
import { graphRequest } from "../graph.js";
import { validateNotRecurring, checkRateLimit, registerAction } from "../guardrails.js";

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
    .describe(
      "E-mails dos convidados separados por vírgula. Informe os e-mails ou deixe vazio se não houver convidados."
    ),
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
  confirmacao: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Obrigatório true ao criar o 11º compromisso da hora (ou múltiplos de 10)."
    ),
});

export async function createEvent(params) {
  const { titulo, inicio, fim, descricao, local, convidados, dia_inteiro, fuso_horario, confirmacao } = params;

  // 1. Garante que não há campos de recorrência no payload
  validateNotRecurring(params);

  // Validar que fim > inicio (apenas para eventos com hora)
  if (!dia_inteiro && inicio && fim) {
    if (new Date(fim) <= new Date(inicio)) {
      throw new Error(`Horário de término (${fim}) deve ser após o início (${inicio}).`);
    }
  }

  // 2. Verifica rate limit
  await checkRateLimit("event", confirmacao);

  const attendees = convidados
    ? convidados.split(",").map((email) => ({
        emailAddress: { address: email.trim() },
        type: "required",
      }))
    : [];

  // Eventos de dia inteiro usam start.date/end.date (sem hora), não dateTime
  const startField = dia_inteiro
    ? { date: inicio.split("T")[0] }
    : { dateTime: inicio, timeZone: fuso_horario };
  const endField = dia_inteiro
    ? { date: fim.split("T")[0] }
    : { dateTime: fim, timeZone: fuso_horario };

  const event = {
    subject: titulo,
    isAllDay: dia_inteiro,
    start: startField,
    end: endField,
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

  // 3. Registra ação após sucesso
  await registerAction("event");

  const link = result.webLink || "";
  const convidadosStr =
    attendees.length > 0
      ? ` | Convidados: ${attendees.map((a) => a.emailAddress.address).join(", ")}`
      : "";

  // Eventos de dia inteiro retornam start.date; eventos normais retornam start.dateTime
  const iniExib = dia_inteiro
    ? (result.start.date || inicio.split("T")[0])
    : (result.start.dateTime || inicio).replace("T", " ").substring(0, 16);
  const fimExib = dia_inteiro
    ? (result.end.date || fim.split("T")[0])
    : (result.end.dateTime || fim).replace("T", " ").substring(0, 16);

  const periodoStr = dia_inteiro
    ? `${iniExib} (dia inteiro)`
    : `${iniExib} até ${fimExib} (${fuso_horario})`;

  return `Compromisso criado com sucesso!\n- Título: ${result.subject}\n- Período: ${periodoStr}${convidadosStr}\n- Link: ${link}`;
}
