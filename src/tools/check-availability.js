/**
 * check-availability.js — Ferramenta MCP para verificar disponibilidade de pessoas
 * Usa o endpoint /me/calendar/getSchedule da Microsoft Graph API.
 * Respeita o nível de compartilhamento de cada pessoa:
 *   - Compartilhamento só de disponibilidade → retorna blocos "busy" sem título
 *   - Compartilhamento com nome → retorna título dos eventos também
 */

import { z } from "zod";
import { graphRequest } from "../graph.js";

export const checkAvailabilitySchema = z.object({
  pessoas: z
    .string()
    .describe(
      "E-mails das pessoas separados por vírgula. Ex: joao@empresa.com, maria@empresa.com"
    ),
  data_inicio: z
    .string()
    .describe(
      "Data e hora de início da janela de consulta no formato ISO 8601. Ex: 2026-03-10T08:00:00"
    ),
  data_fim: z
    .string()
    .describe(
      "Data e hora de fim da janela de consulta no formato ISO 8601. Ex: 2026-03-10T18:00:00"
    ),
  intervalo_minutos: z
    .number()
    .optional()
    .default(15)
    .describe(
      "Granularidade em minutos para identificar janelas livres. Padrão: 15"
    ),
  fuso_horario: z
    .string()
    .optional()
    .default("America/Sao_Paulo")
    .describe("Fuso horário da consulta. Padrão: America/Sao_Paulo"),
});

export async function checkAvailability(params) {
  const { pessoas, data_inicio, data_fim, intervalo_minutos, fuso_horario } = params;

  const emails = pessoas.split(",").map((e) => e.trim()).filter(Boolean);

  const body = {
    schedules: emails,
    startTime: {
      dateTime: data_inicio,
      timeZone: fuso_horario,
    },
    endTime: {
      dateTime: data_fim,
      timeZone: fuso_horario,
    },
    availabilityViewInterval: intervalo_minutos,
  };

  const result = await graphRequest("POST", "/me/calendar/getSchedule", body);

  if (!result || !result.value || result.value.length === 0) {
    return "Nenhuma informação de disponibilidade retornada.";
  }

  // A Graph API retorna scheduleItems[].start.dateTime sem sufixo de timezone —
  // o valor já está no fuso enviado na requisição. Tratar como local appending o fuso
  // via Intl para evitar que o JS interprete como UTC.
  function localDateTimeToHHMM(dateTimeStr) {
    // dateTimeStr ex: "2026-02-26T14:20:00" (sem Z, sem offset) — já é horário local
    // Parseamos as partes diretamente para não sofrer conversão UTC
    const [, timePart] = dateTimeStr.split("T");
    const [hh, mm] = timePart.split(":");
    return `${hh}:${mm}`;
  }

  // Monta mapa de disponibilidade por pessoa
  const pessoasInfo = result.value.map((schedule) => {
    const email = schedule.scheduleId;
    const status = schedule.availabilityView || "";
    // availabilityView: string de chars onde 0=livre, 1=tentativa, 2=ocupado, 3=fora do escritório, 4=trabalhando em outro local

    const blocos = schedule.scheduleItems || [];
    const ocupados = blocos.map((item) => {
      const iniStr = localDateTimeToHHMM(item.start.dateTime);
      const fimStr = localDateTimeToHHMM(item.end.dateTime);
      const titulo = item.subject ? ` — "${item.subject}"` : "";
      const tipoStatus = item.status === "oof" ? " [Fora do escritório]" : item.status === "tentative" ? " [Tentativa]" : "";
      return `  • ${iniStr} – ${fimStr}${titulo}${tipoStatus}`;
    });

    return { email, status, ocupados };
  });

  // Encontra janelas livres em comum para TODOS
  // availabilityView é uma string: cada char = um intervalo de `intervalo_minutos` minutos a partir de data_inicio
  const views = pessoasInfo.map((p) => p.status);
  const minLen = Math.min(...views.map((v) => v.length));

  const janelasLivres = [];
  let inicioJanela = null;

  for (let i = 0; i < minLen; i++) {
    const todosLivres = views.every((v) => v[i] === "0");

    if (todosLivres && inicioJanela === null) {
      inicioJanela = i;
    } else if (!todosLivres && inicioJanela !== null) {
      janelasLivres.push({ inicio: inicioJanela, fim: i });
      inicioJanela = null;
    }
  }
  if (inicioJanela !== null) {
    janelasLivres.push({ inicio: inicioJanela, fim: minLen });
  }

  // Converte índices para horários legíveis a partir da hora de início (já local)
  const [baseDate, baseTime] = data_inicio.split("T");
  const [baseH, baseM] = baseTime.split(":").map(Number);
  const baseMinutes = baseH * 60 + baseM;

  function minutesToHHMM(totalMinutes) {
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
    const m = (totalMinutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  const janelasStr = janelasLivres
    .map((j) => {
      const iniStr = minutesToHHMM(baseMinutes + j.inicio * intervalo_minutos);
      const fimStr = minutesToHHMM(baseMinutes + j.fim * intervalo_minutos);
      const durMin = (j.fim - j.inicio) * intervalo_minutos;
      return `  ✅ ${iniStr} – ${fimStr} (${durMin} min livre)`;
    })
    .join("\n");

  // Monta output por pessoa
  const detalhes = pessoasInfo.map((p) => {
    const ocupStr =
      p.ocupados.length > 0 ? p.ocupados.join("\n") : "  (sem compromissos no período)";
    return `👤 ${p.email}\n${ocupStr}`;
  });

  const [, iniTimePart] = data_inicio.split("T");
  const [, fimTimePart] = data_fim.split("T");
  const dataExib = baseDate.split("-").reverse().join("/");
  const iniExib = iniTimePart.substring(0, 5);
  const fimExib = fimTimePart.substring(0, 5);

  const header = `Disponibilidade — ${dataExib} — ${iniExib} até ${fimExib}\n${"─".repeat(50)}`;
  const blocoDetalhes = `\n📅 Compromissos no período:\n${detalhes.join("\n\n")}`;
  const blocoJanelas =
    janelasLivres.length > 0
      ? `\n\n🟢 Janelas livres para TODOS (${emails.join(", ")}):\n${janelasStr}`
      : `\n\n🔴 Nenhuma janela livre em comum no período.`;

  return header + blocoDetalhes + blocoJanelas;
}
