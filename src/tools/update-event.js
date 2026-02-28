/**
 * update-event.js — Ferramenta MCP para atualizar compromissos do Calendário
 *
 * Busca o evento pelo título (e opcionalmente data) e atualiza os campos informados.
 * Campos não informados são mantidos como estão.
 */

import { z } from "zod";
import { graphRequest, graphRequestPaginated } from "../graph.js";

export const updateEventSchema = z.object({
  titulo_busca: z
    .string()
    .min(1, "Título de busca não pode ser vazio")
    .describe("Título (ou parte do título) do compromisso a ser atualizado. Usado para localizar o evento."),
  data_busca: z
    .string()
    .optional()
    .describe("Data do compromisso no formato ISO 8601 (ex: 2026-03-10). Ajuda a encontrar o evento correto quando há múltiplos com título semelhante. Padrão: hoje."),
  titulo: z
    .string()
    .optional()
    .describe("Novo título do compromisso (deixe vazio para não alterar)"),
  descricao: z
    .string()
    .optional()
    .describe("Nova descrição/pauta (deixe vazio para não alterar)"),
  local: z
    .string()
    .optional()
    .describe("Novo local ou link da reunião (deixe vazio para não alterar)"),
  inicio: z
    .string()
    .optional()
    .describe("Novo horário de início no formato ISO 8601. Ex: 2026-03-10T14:00:00 (deixe vazio para não alterar)"),
  fim: z
    .string()
    .optional()
    .describe("Novo horário de término no formato ISO 8601. Ex: 2026-03-10T15:00:00 (deixe vazio para não alterar)"),
  fuso_horario: z
    .string()
    .optional()
    .default("America/Sao_Paulo")
    .describe("Fuso horário para início/fim. Padrão: America/Sao_Paulo"),
  mostrar_como: z
    .enum(["free", "busy", "tentative", "oof", "workingElsewhere"])
    .optional()
    .describe("Status de disponibilidade: free (disponível), busy (ocupado), tentative (provisório). Deixe vazio para não alterar."),
});

export async function updateEvent(params) {
  const { titulo_busca, data_busca, titulo, descricao, local, inicio, fim, fuso_horario, mostrar_como } = params;

  // 1. Buscar o evento pelo título
  const offset = "-03:00";
  const fuso = "America/Sao_Paulo";
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: fuso });
  const dataBusca = data_busca ?? hoje;

  const startISO = new Date(`${dataBusca}T00:00:00${offset}`).toISOString();
  const endISO = new Date(`${dataBusca}T23:59:59${offset}`).toISOString();

  // Buscar eventos do dia para localizar pelo título (paginado, até 500)
  const endpoint = `/me/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$top=500&$orderby=start/dateTime&$select=id,subject,start,end,body,location,showAs`;
  const result = await graphRequestPaginated(endpoint, 500);

  if (!result?.value?.length) {
    return `Nenhum compromisso encontrado para a data ${dataBusca}.`;
  }

  // Filtrar por título (case insensitive, partial match)
  const termoBusca = titulo_busca.toLowerCase();
  const matches = result.value.filter((ev) =>
    (ev.subject || "").toLowerCase().includes(termoBusca)
  );

  if (matches.length === 0) {
    const disponiveis = result.value.map((ev) => `"${ev.subject}"`).join(", ");
    return `Nenhum compromisso encontrado com o título "${titulo_busca}" em ${dataBusca}.\nCompromissos do dia: ${disponiveis}`;
  }

  if (matches.length > 1) {
    const lista = matches.map((ev) => `"${ev.subject}" (${ev.start.dateTime.substring(11, 16)})`).join(", ");
    return `Encontrados ${matches.length} compromissos com "${titulo_busca}": ${lista}\nInforme uma data mais específica ou um título mais preciso.`;
  }

  const evento = matches[0];
  const eventId = evento.id;

  // 2. Montar payload apenas com campos a atualizar
  const patch = {};

  if (titulo) {
    patch.subject = titulo;
  }

  if (descricao !== undefined && descricao !== null) {
    patch.body = {
      contentType: "Text",
      content: descricao,
    };
  }

  if (local) {
    patch.location = { displayName: local };
  }

  if (inicio) {
    patch.start = { dateTime: inicio, timeZone: fuso_horario };
  }

  if (fim) {
    patch.end = { dateTime: fim, timeZone: fuso_horario };
  }

  // Validar ordem inicio/fim se ambos foram informados
  if (inicio && fim && new Date(fim) <= new Date(inicio)) {
    throw new Error(`Horário de término (${fim}) deve ser após o início (${inicio}).`);
  }

  if (mostrar_como) {
    patch.showAs = mostrar_como;
  }

  if (Object.keys(patch).length === 0) {
    return `Nenhum campo para atualizar foi informado. Informe pelo menos um: titulo, descricao, local, inicio, fim ou mostrar_como.`;
  }

  // 3. PATCH no evento
  const updated = await graphRequest("PATCH", `/me/events/${eventId}`, patch);

  const tituloFinal = updated.subject || evento.subject;
  const link = updated.webLink || "";

  const camposAlterados = Object.keys(patch).map((k) => {
    const nomes = { subject: "Título", body: "Descrição", location: "Local", start: "Início", end: "Fim", showAs: "Disponibilidade" };
    return nomes[k] || k;
  }).join(", ");

  return `Compromisso atualizado com sucesso!\n- Título: ${tituloFinal}\n- Campos alterados: ${camposAlterados}\n- Link: ${link}`;
}
