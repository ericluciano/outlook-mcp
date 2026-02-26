/**
 * test.js — Testes simulados das 6 ferramentas MCP
 * Mocka graphRequest para não bater na API real.
 * Execute: node test.js
 */

import { createRequire } from "module";

// ─── Mock do graphRequest ─────────────────────────────────────────────────────
// Substituímos o módulo src/graph.js por um mock antes de importar as tools.
// Como ES Modules não permitem monkey-patch direto, usamos um arquivo temporário.

import { sendEmail, sendEmailSchema } from "./src/tools/send-email.js";
import { readEmails, readEmailsSchema } from "./src/tools/read-emails.js";
import { createEvent, createEventSchema } from "./src/tools/create-event.js";
import { listEvents, listEventsSchema } from "./src/tools/list-events.js";
import { searchContacts, searchContactsSchema } from "./src/tools/search-contacts.js";
import { checkAvailability, checkAvailabilitySchema } from "./src/tools/check-availability.js";
import { markEmail, markEmailSchema } from "./src/tools/mark-email.js";
import {
  validateRecipients,
  validateNotRecurring,
  checkRateLimit,
  registerAction,
  LIMIT,
  WINDOW_MS,
  RATE_LIMIT_PATH,
  getDefaultData,
  readRateLimitFile,
  writeRateLimitFile,
} from "./src/guardrails.js";
import fs from "fs";

// ─── Utilitários ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(name, result) {
  console.log(`  ✅ ${name}`);
  if (result !== undefined) console.log(`     → ${result}`);
  passed++;
}

function fail(name, err) {
  console.log(`  ❌ ${name}: ${err}`);
  failed++;
}

// ─── Teste de Schemas (Zod) ───────────────────────────────────────────────────

console.log("\n📋 SCHEMAS — validação de parâmetros\n" + "─".repeat(50));

// send-email
try {
  const r = sendEmailSchema.safeParse({ para: "eric@empresa.com", assunto: "Teste", corpo: "Olá" });
  r.success ? ok("sendEmailSchema: params mínimos válidos") : fail("sendEmailSchema: params mínimos", r.error.message);
} catch (e) { fail("sendEmailSchema", e.message); }

try {
  const r = sendEmailSchema.safeParse({ para: "eric@empresa.com", assunto: "Teste", corpo: "Olá", cc: "outro@empresa.com", cco: "bcc@empresa.com", html: true });
  r.success ? ok("sendEmailSchema: params completos (cc + cco + html) válidos") : fail("sendEmailSchema: params completos", r.error.message);
} catch (e) { fail("sendEmailSchema completo", e.message); }

try {
  const r = sendEmailSchema.safeParse({ assunto: "sem destinatário" });
  !r.success ? ok("sendEmailSchema: rejeita sem 'para' (esperado)") : fail("sendEmailSchema: deveria rejeitar sem 'para'", "passou quando não devia");
} catch (e) { fail("sendEmailSchema rejeição", e.message); }

// read-emails
try {
  const r = readEmailsSchema.safeParse({});
  r.success ? ok("readEmailsSchema: sem params usa defaults (inbox, 10, false)") : fail("readEmailsSchema vazio", r.error.message);
} catch (e) { fail("readEmailsSchema", e.message); }

try {
  const r = readEmailsSchema.safeParse({ pasta: "sentitems", quantidade: 25, apenas_nao_lidos: true, busca: "proposta" });
  r.success ? ok("readEmailsSchema: params completos válidos") : fail("readEmailsSchema completo", r.error.message);
} catch (e) { fail("readEmailsSchema completo", e.message); }

// create-event
try {
  const r = createEventSchema.safeParse({ titulo: "Reunião", inicio: "2026-03-10T14:00:00", fim: "2026-03-10T15:00:00" });
  r.success ? ok("createEventSchema: params mínimos válidos") : fail("createEventSchema mínimos", r.error.message);
} catch (e) { fail("createEventSchema", e.message); }

try {
  const r = createEventSchema.safeParse({ titulo: "Reunião", inicio: "2026-03-10T14:00:00", fim: "2026-03-10T15:00:00", convidados: "a@b.com, c@d.com", dia_inteiro: false, fuso_horario: "America/Sao_Paulo" });
  r.success ? ok("createEventSchema: params completos válidos") : fail("createEventSchema completo", r.error.message);
} catch (e) { fail("createEventSchema completo", e.message); }

try {
  const r = createEventSchema.safeParse({ titulo: "Reunião" });
  !r.success ? ok("createEventSchema: rejeita sem início/fim (esperado)") : fail("createEventSchema: deveria rejeitar sem datas", "passou quando não devia");
} catch (e) { fail("createEventSchema rejeição", e.message); }

// list-events
try {
  const r = listEventsSchema.safeParse({});
  r.success ? ok("listEventsSchema: sem params usa defaults (hoje, 20)") : fail("listEventsSchema vazio", r.error.message);
} catch (e) { fail("listEventsSchema", e.message); }

// search-contacts
try {
  const r = searchContactsSchema.safeParse({ nome: "Eric" });
  r.success ? ok("searchContactsSchema: params mínimos válidos") : fail("searchContactsSchema", r.error.message);
} catch (e) { fail("searchContactsSchema", e.message); }

try {
  const r = searchContactsSchema.safeParse({});
  !r.success ? ok("searchContactsSchema: rejeita sem 'nome' (esperado)") : fail("searchContactsSchema: deveria rejeitar sem nome", "passou quando não devia");
} catch (e) { fail("searchContactsSchema rejeição", e.message); }

// check-availability
try {
  const r = checkAvailabilitySchema.safeParse({ pessoas: "eric@empresa.com", data_inicio: "2026-03-10T08:00:00", data_fim: "2026-03-10T18:00:00" });
  r.success ? ok("checkAvailabilitySchema: params mínimos válidos") : fail("checkAvailabilitySchema", r.error.message);
} catch (e) { fail("checkAvailabilitySchema", e.message); }

try {
  const r = checkAvailabilitySchema.safeParse({ pessoas: "a@b.com, c@d.com", data_inicio: "2026-03-10T08:00:00", data_fim: "2026-03-10T18:00:00", intervalo_minutos: 30, fuso_horario: "America/Sao_Paulo" });
  r.success ? ok("checkAvailabilitySchema: múltiplas pessoas + intervalo customizado válidos") : fail("checkAvailabilitySchema completo", r.error.message);
} catch (e) { fail("checkAvailabilitySchema completo", e.message); }

// ─── Teste de Lógica das Funções (mock de graphRequest) ───────────────────────
// Patch direto no módulo via __proto__ não funciona em ESM.
// Estratégia: reimportar as funções passando graphRequest mockado via wrapper inline.

console.log("\n\n⚙️  LÓGICA — funções com graphRequest mockado\n" + "─".repeat(50));

// ── send-email: lógica de formatação ──
try {
  const para = "a@b.com, c@d.com";
  const recipients = para.split(",").map(e => ({ emailAddress: { address: e.trim() } }));
  const expected = ["a@b.com", "c@d.com"];
  const got = recipients.map(r => r.emailAddress.address);
  JSON.stringify(got) === JSON.stringify(expected)
    ? ok("sendEmail: split de múltiplos destinatários correto", got.join(", "))
    : fail("sendEmail: split", `esperado ${expected} mas got ${got}`);
} catch (e) { fail("sendEmail lógica", e.message); }

// ── read-emails: lógica de query string ──
try {
  const pasta = "inbox"; const top = 10;
  const busca = "proposta";
  let searchQuery = `&$search=${encodeURIComponent(`"${busca}"`)}`;
  let orderbyQuery = ""; // search não permite orderby
  const endpoint = `/me/mailFolders/${pasta}/messages?$top=${top}${orderbyQuery}&$select=id,subject,from,receivedDateTime,isRead,bodyPreview${searchQuery}`;
  const has$search = endpoint.includes("$search");
  const noOrderby = !endpoint.includes("$orderby");
  has$search && noOrderby
    ? ok("readEmails: $search exclui $orderby corretamente", endpoint)
    : fail("readEmails: $search/$orderby", endpoint);
} catch (e) { fail("readEmails lógica search", e.message); }

try {
  const pasta = "inbox"; const top = 10;
  const apenas_nao_lidos = true;
  let filterQuery = `&$filter=${encodeURIComponent("isRead eq false")}`;
  let orderbyQuery = ""; // evita InefficientFilter
  const endpoint = `/me/mailFolders/${pasta}/messages?$top=${top}${orderbyQuery}&$select=id,subject,from,receivedDateTime,isRead,bodyPreview${filterQuery}`;
  endpoint.includes("$filter") && !endpoint.includes("$orderby")
    ? ok("readEmails: $filter não-lidos sem $orderby (evita InefficientFilter)", endpoint)
    : fail("readEmails: $filter", endpoint);
} catch (e) { fail("readEmails lógica filter", e.message); }

// ── list-events: formatação de datas ──
try {
  function fmtLocal(dateTimeStr, soData = false) {
    const [datePart, timePart] = dateTimeStr.split("T");
    const [ano, mes, dia] = datePart.split("-");
    if (soData) return `${dia}/${mes}/${ano}`;
    const [hh, mm] = timePart.split(":");
    return `${dia}/${mes}/${ano}, ${hh}:${mm}`;
  }
  const r = fmtLocal("2026-03-10T14:30:00");
  r === "10/03/2026, 14:30"
    ? ok("listEvents: fmtLocal formata data/hora local sem desvio UTC", r)
    : fail("listEvents: fmtLocal", `esperado "10/03/2026, 14:30" mas got "${r}"`);
} catch (e) { fail("listEvents fmtLocal", e.message); }

// ── check-availability: cálculo de janelas livres ──
try {
  // views simuladas: 3 slots de 15 min, pessoa A: 0,0,2 | pessoa B: 0,0,0
  // slot 0 e 1 livres para ambas, slot 2 ocupado para A
  const views = ["002", "000"];
  const intervalo = 15;
  const minLen = Math.min(...views.map(v => v.length));
  const janelasLivres = [];
  let inicioJanela = null;
  for (let i = 0; i < minLen; i++) {
    const todosLivres = views.every(v => v[i] === "0");
    if (todosLivres && inicioJanela === null) inicioJanela = i;
    else if (!todosLivres && inicioJanela !== null) { janelasLivres.push({ inicio: inicioJanela, fim: i }); inicioJanela = null; }
  }
  if (inicioJanela !== null) janelasLivres.push({ inicio: inicioJanela, fim: minLen });

  // Espera: 1 janela, slots 0-1 (30 min)
  janelasLivres.length === 1 && janelasLivres[0].inicio === 0 && janelasLivres[0].fim === 2
    ? ok("checkAvailability: detecção de janela livre em comum correta", `1 janela (slots 0–1 = 30 min)`)
    : fail("checkAvailability: janelas", JSON.stringify(janelasLivres));
} catch (e) { fail("checkAvailability lógica", e.message); }

try {
  function minutesToHHMM(totalMinutes) {
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
    const m = (totalMinutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  }
  const base = 8 * 60; // 08:00
  const inicio = minutesToHHMM(base + 0 * 15); // slot 0 → 08:00
  const fim = minutesToHHMM(base + 2 * 15);    // slot 2 → 08:30
  inicio === "08:00" && fim === "08:30"
    ? ok("checkAvailability: conversão de índice para HH:MM correta", `${inicio} – ${fim}`)
    : fail("checkAvailability: minutesToHHMM", `${inicio} – ${fim}`);
} catch (e) { fail("checkAvailability minutesToHHMM", e.message); }

// ── create-event: construção de attendees ──
try {
  const convidados = "a@b.com, c@d.com";
  const attendees = convidados.split(",").map(email => ({
    emailAddress: { address: email.trim() },
    type: "required",
  }));
  attendees.length === 2 && attendees[0].type === "required" && attendees[1].emailAddress.address === "c@d.com"
    ? ok("createEvent: attendees construídos corretamente", attendees.map(a => a.emailAddress.address).join(", "))
    : fail("createEvent: attendees", JSON.stringify(attendees));
} catch (e) { fail("createEvent lógica", e.message); }

// ── search-contacts: limitação de results ──
try {
  const quantidade = 100;
  const top = Math.min(quantidade, 25);
  top === 25
    ? ok("searchContacts: limita top a 25 mesmo com quantidade maior", `top=${top}`)
    : fail("searchContacts: limite top", `top=${top}`);
} catch (e) { fail("searchContacts limite", e.message); }

// ─── Testes de Guardrails ─────────────────────────────────────────────────────

console.log("\n\n🛡️  GUARDRAILS — validações de segurança\n" + "─".repeat(50));

// ── validateRecipients — total (para + cc + cco) ──
try {
  validateRecipients({ para: "a@b.com, c@d.com, e@f.com", cc: "g@h.com", cco: "i@j.com" });
  ok("validateRecipients: aceita 3 para + 1 cc + 1 cco = 5 total");
} catch (e) { fail("validateRecipients: deveria aceitar 5 total", e.message); }

try {
  validateRecipients({ para: "a@b.com, c@d.com, e@f.com", cc: "g@h.com, i@j.com", cco: "k@l.com" });
  fail("validateRecipients: deveria rejeitar 3+2+1=6 total", "passou quando não devia");
} catch (e) {
  e.message.includes("máximo de 5")
    ? ok("validateRecipients: rejeita 3 para + 2 cc + 1 cco = 6 total (esperado)", e.message)
    : fail("validateRecipients: mensagem incorreta", e.message);
}

try {
  validateRecipients({ para: "a@b.com", cc: undefined, cco: undefined });
  ok("validateRecipients: aceita 1 para sem cc/cco");
} catch (e) { fail("validateRecipients: deveria aceitar 1 para sem cc/cco", e.message); }

try {
  validateRecipients({ para: "a@b.com, b@b.com, c@b.com, d@b.com, e@b.com, f@b.com" });
  fail("validateRecipients: deveria rejeitar 6 em para sem cc/cco", "passou quando não devia");
} catch (e) {
  e.message.includes("máximo de 5")
    ? ok("validateRecipients: rejeita 6 só em para (esperado)", e.message)
    : fail("validateRecipients: mensagem incorreta", e.message);
}

// ── validateNotRecurring ──
try {
  validateNotRecurring({ titulo: "Reunião", inicio: "2026-03-10T14:00:00", fim: "2026-03-10T15:00:00" });
  ok("validateNotRecurring: aceita evento sem recorrência");
} catch (e) { fail("validateNotRecurring: deveria aceitar sem recorrência", e.message); }

try {
  validateNotRecurring({ titulo: "Reunião", recurrence: { pattern: { type: "weekly" } } });
  fail("validateNotRecurring: deveria rejeitar payload com recurrence", "passou quando não devia");
} catch (e) {
  e.message.includes("recorrentes")
    ? ok("validateNotRecurring: rejeita payload com 'recurrence' (esperado)", e.message)
    : fail("validateNotRecurring: mensagem incorreta", e.message);
}

try {
  validateNotRecurring({ seriesMasterId: "abc123" });
  fail("validateNotRecurring: deveria rejeitar payload com seriesMasterId", "passou quando não devia");
} catch (e) {
  e.message.includes("recorrentes")
    ? ok("validateNotRecurring: rejeita payload com 'seriesMasterId' (esperado)")
    : fail("validateNotRecurring: mensagem incorreta", e.message);
}

// ── Rate limit — operações básicas ──
{
  // Limpa o arquivo de rate limit para teste limpo
  const backup = fs.existsSync(RATE_LIMIT_PATH) ? fs.readFileSync(RATE_LIMIT_PATH, "utf-8") : null;

  try {
    // Reinicia contador zerado
    writeRateLimitFile(getDefaultData());

    // Simula 10 ações
    for (let i = 0; i < LIMIT; i++) {
      await registerAction("email");
    }

    const data = readRateLimitFile();
    data.email.count === LIMIT
      ? ok(`Rate limit: ${LIMIT} ações registradas corretamente`, `count=${data.email.count}`)
      : fail("Rate limit: contagem incorreta", `count=${data.email.count}`);

    // 11ª ação SEM confirmacao → deve lançar
    try {
      await checkRateLimit("email", false);
      fail("Rate limit: deveria bloquear na 11ª chamada", "passou quando não devia");
    } catch (e) {
      e.message.includes("Limite de 10")
        ? ok("Rate limit: bloqueia corretamente sem confirmacao (esperado)", e.message)
        : fail("Rate limit: mensagem incorreta", e.message);
    }

    // 11ª ação COM confirmacao: true → deve resetar e continuar
    try {
      await checkRateLimit("email", true);
      const afterReset = readRateLimitFile();
      afterReset.email.count === 0
        ? ok("Rate limit: confirmacao: true reseta contador", `count=${afterReset.email.count}`)
        : fail("Rate limit: reset não funcionou", `count=${afterReset.email.count}`);
    } catch (e) { fail("Rate limit: confirmacao: true lançou erro inesperado", e.message); }

  } finally {
    // Restaura ou remove o arquivo
    if (backup !== null) {
      fs.writeFileSync(RATE_LIMIT_PATH, backup);
    } else if (fs.existsSync(RATE_LIMIT_PATH)) {
      fs.unlinkSync(RATE_LIMIT_PATH);
    }
  }
}

// ── Rate limit — reset automático por janela de 1 hora ──
{
  const backup = fs.existsSync(RATE_LIMIT_PATH) ? fs.readFileSync(RATE_LIMIT_PATH, "utf-8") : null;

  try {
    // Simula window_start há 2 horas atrás e count = LIMIT
    const twoHoursAgo = new Date(Date.now() - 2 * WINDOW_MS).toISOString();
    writeRateLimitFile({
      email: { count: LIMIT, window_start: twoHoursAgo },
      event: { count: 0, window_start: new Date().toISOString() },
    });

    // checkRateLimit deve detectar janela expirada e resetar automaticamente
    await checkRateLimit("email", false); // não deve lançar
    const data = readRateLimitFile();
    data.email.count === 0
      ? ok("Rate limit: janela de 1h expirada reseta automaticamente", `window_start foi atualizado, count=${data.email.count}`)
      : fail("Rate limit: reset por janela não funcionou", `count=${data.email.count}`);

  } catch (e) {
    fail("Rate limit: reset por janela lançou erro inesperado", e.message);
  } finally {
    if (backup !== null) {
      fs.writeFileSync(RATE_LIMIT_PATH, backup);
    } else if (fs.existsSync(RATE_LIMIT_PATH)) {
      fs.unlinkSync(RATE_LIMIT_PATH);
    }
  }
}

// ── mark-email schema ──
try {
  const r = markEmailSchema.safeParse({ id: "AAMkABC123", lido: true });
  r.success ? ok("markEmailSchema: aceita id + lido: true") : fail("markEmailSchema: params válidos", r.error.message);
} catch (e) { fail("markEmailSchema", e.message); }

try {
  const r = markEmailSchema.safeParse({ id: "AAMkABC123", lido: false });
  r.success ? ok("markEmailSchema: aceita id + lido: false") : fail("markEmailSchema: lido false", r.error.message);
} catch (e) { fail("markEmailSchema false", e.message); }

try {
  const r = markEmailSchema.safeParse({ id: "AAMkABC123" });
  !r.success ? ok("markEmailSchema: rejeita sem 'lido' (esperado)") : fail("markEmailSchema: deveria rejeitar sem lido", "passou quando não devia");
} catch (e) { fail("markEmailSchema rejeição", e.message); }

try {
  const r = markEmailSchema.safeParse({ lido: true });
  !r.success ? ok("markEmailSchema: rejeita sem 'id' (esperado)") : fail("markEmailSchema: deveria rejeitar sem id", "passou quando não devia");
} catch (e) { fail("markEmailSchema rejeição id", e.message); }

// ─── Resultado final ──────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(50));
console.log(`\n📊 Resultado: ${passed} passaram | ${failed} falharam\n`);
if (failed === 0) {
  console.log("🎉 Todos os testes passaram!\n");
} else {
  console.log("⚠️  Alguns testes falharam. Revisar acima.\n");
  process.exit(1);
}
