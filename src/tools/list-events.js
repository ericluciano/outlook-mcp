/**
 * list-events.js — Ferramenta MCP para listar compromissos do Calendário
 */

import { z } from "zod";
import { graphRequestPaginated } from "../graph.js";

export const listEventsSchema = z.object({
  data_inicio: z
    .string()
    .optional()
    .describe("Data de início da consulta no formato ISO 8601. Ex: 2026-02-26. Padrão: hoje"),
  data_fim: z
    .string()
    .optional()
    .describe("Data de fim da consulta no formato ISO 8601. Ex: 2026-02-26. Padrão: mesmo dia que data_inicio"),
  quantidade: z
    .number()
    .optional()
    .default(20)
    .describe("Número máximo de compromissos a retornar. Padrão: 20"),
  filtro: z
    .string()
    .optional()
    .describe("Filtra compromissos pelo título (case-insensitive). Ex: 'podcast', 'G4', 'reunião'"),
});

export async function listEvents(params) {
  const { data_inicio, data_fim, quantidade, filtro } = params;

  const agora = new Date();
  const fuso = "America/Sao_Paulo";

  // Data início: parâmetro ou hoje às 00:00 no fuso de SP
  // Sufixo "-03:00" ancora a data no fuso correto em vez de UTC
  const offset = "-03:00";
  const inicio = data_inicio
    ? new Date(`${data_inicio}T00:00:00${offset}`)
    : new Date(agora.toLocaleDateString("en-CA", { timeZone: fuso }) + `T00:00:00${offset}`);

  // Data fim: parâmetro ou mesmo dia que data_inicio às 23:59 no fuso de SP
  const diaBase = data_inicio ?? agora.toLocaleDateString("en-CA", { timeZone: fuso });
  const fim = data_fim
    ? new Date(`${data_fim}T23:59:59${offset}`)
    : new Date(`${diaBase}T23:59:59${offset}`);

  const startISO = inicio.toISOString();
  const endISO = fim.toISOString();
  const top = Math.min(quantidade, 500);

  const endpoint = `/me/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$top=${top}&$orderby=start/dateTime&$select=id,subject,start,end,location,organizer,isAllDay,bodyPreview,webLink`;

  const result = await graphRequestPaginated(endpoint, 1000);

  if (!result || !result.value || result.value.length === 0) {
    const dataStr = inicio.toLocaleDateString("pt-BR", { timeZone: fuso });
    return `Nenhum compromisso encontrado para ${dataStr}.`;
  }

  // Filtrar por palavra-chave no título se informado
  const eventos_raw = filtro
    ? result.value.filter(ev => (ev.subject || "").toLowerCase().includes(filtro.toLowerCase()))
    : result.value;

  if (filtro && eventos_raw.length === 0) {
    return `Nenhum compromisso encontrado com "${filtro}" no título.`;
  }

  // A Graph API retorna start.dateTime/end.dateTime sem sufixo de timezone —
  // o valor já está no fuso local. Extrair as partes diretamente evita que o
  // JS interprete a string como UTC e adiantando 3h na exibição.
  function fmtLocal(dateTimeStr, soData = false) {
    if (!dateTimeStr || !dateTimeStr.includes("T")) {
      // Formato date-only (ex: "2026-03-10") — eventos de dia inteiro
      const parts = (dateTimeStr || "").split("-");
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dateTimeStr || "";
    }
    const [datePart, timePart] = dateTimeStr.split("T");
    const [ano, mes, dia] = datePart.split("-");
    if (soData) return `${dia}/${mes}/${ano}`;
    const [hh, mm] = timePart.split(":");
    return `${dia}/${mes}/${ano}, ${hh}:${mm}`;
  }

  const eventos = eventos_raw.map((ev, i) => {
    const inicioEv = ev.isAllDay
      ? fmtLocal(ev.start.dateTime, true)
      : fmtLocal(ev.start.dateTime);
    const fimEv = ev.isAllDay
      ? ""
      : ` até ${fmtLocal(ev.end.dateTime).split(", ")[1]}`;
    const local = ev.location?.displayName ? `\n   Local: ${ev.location.displayName}` : "";
    const organizador = ev.organizer?.emailAddress?.name || ev.organizer?.emailAddress?.address || "";
    const orgStr = organizador ? `\n   Organizador: ${organizador}` : "";
    const diaInteiro = ev.isAllDay ? " [Dia inteiro]" : "";

    return `${i + 1}. ${ev.subject || "(sem título)"}${diaInteiro}\n   Horário: ${inicioEv}${fimEv}${local}${orgStr}`;
  });

  const dataExibicao = inicio.toLocaleDateString("pt-BR", { timeZone: fuso }); // inicio é construído com offset explícito, seguro
  const titulo = `Compromissos — ${dataExibicao} — ${eventos.length} encontrado(s):\n${"─".repeat(50)}\n`;
  return titulo + eventos.join("\n\n");
}
