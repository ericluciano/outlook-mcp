/**
 * test-security.js — Testes de invasão / penetração nos guardrails
 *
 * Simula vetores de ataque reais que um LLM malicioso (ou instrução errada)
 * poderia tentar para contornar os guardrails do outlook-mcp.
 *
 * Execute: node test-security.js
 * NÃO bate na API real (não importa graphRequest).
 */

import fs from "fs";
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
import { sendEmailSchema } from "./src/tools/send-email.js";
import { createEventSchema } from "./src/tools/create-event.js";

// ─── Utilitários ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function blocked(name, fn) {
  // Espera que fn() LANCE erro (guardrail ativo)
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      console.log(`  ⏳ ${name} — async, use blockedAsync`);
      return;
    }
    failures.push(name);
    console.log(`  ❌ BYPASS DETECTADO: ${name} — não lançou erro quando deveria`);
    failed++;
  } catch (e) {
    console.log(`  ✅ BLOQUEADO: ${name}`);
    console.log(`     → ${e.message}`);
    passed++;
  }
}

async function blockedAsync(name, fn) {
  try {
    await fn();
    failures.push(name);
    console.log(`  ❌ BYPASS DETECTADO: ${name} — não lançou erro quando deveria`);
    failed++;
  } catch (e) {
    console.log(`  ✅ BLOQUEADO: ${name}`);
    console.log(`     → ${e.message}`);
    passed++;
  }
}

function allowed(name, fn) {
  // Espera que fn() NÃO lance (ação legítima permitida)
  try {
    fn();
    console.log(`  ✅ PERMITIDO: ${name}`);
    passed++;
  } catch (e) {
    failures.push(name);
    console.log(`  ❌ FALSO POSITIVO: ${name} — bloqueou indevidamente: ${e.message}`);
    failed++;
  }
}

async function allowedAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PERMITIDO: ${name}`);
    passed++;
  } catch (e) {
    failures.push(name);
    console.log(`  ❌ FALSO POSITIVO: ${name} — bloqueou indevidamente: ${e.message}`);
    failed++;
  }
}

// ─── Backup/restore do arquivo de rate limit ─────────────────────────────────

function backupRateLimit() {
  return fs.existsSync(RATE_LIMIT_PATH) ? fs.readFileSync(RATE_LIMIT_PATH, "utf-8") : null;
}

function restoreRateLimit(backup) {
  if (backup !== null) {
    fs.writeFileSync(RATE_LIMIT_PATH, backup);
  } else if (fs.existsSync(RATE_LIMIT_PATH)) {
    fs.unlinkSync(RATE_LIMIT_PATH);
  }
}

// =============================================================================
// VETOR 1 — Bypass de destinatários via formatação criativa (para + cc + cco)
// =============================================================================

console.log("\n🔴 VETOR 1 — Bypass de destinatários (validateRecipients — total para+cc+cco)\n" + "─".repeat(60));

// 1a. 6 só em para
blocked("6 destinatários só em para", () =>
  validateRecipients({ para: "a@b.com,b@b.com,c@b.com,d@b.com,e@b.com,f@b.com" })
);

// 1b. 5 para + 1 cc = 6 total — deve bloquear
blocked("5 para + 1 cc = 6 total", () =>
  validateRecipients({ para: "a@b.com,b@b.com,c@b.com,d@b.com,e@b.com", cc: "f@b.com" })
);

// 1c. 4 para + 1 cc + 1 cco = 6 total — deve bloquear
blocked("4 para + 1 cc + 1 cco = 6 total", () =>
  validateRecipients({ para: "a@b.com,b@b.com,c@b.com,d@b.com", cc: "e@b.com", cco: "f@b.com" })
);

// 1d. 1 para + 2 cc + 20 cco = 23 total — deve bloquear
blocked("1 para + 2 cc + 20 cco = 23 total (ataque via cco)", () =>
  validateRecipients({
    para: "a@b.com",
    cc: "b@b.com,c@b.com",
    cco: Array.from({ length: 20 }, (_, i) => `x${i}@b.com`).join(","),
  })
);

// 1e. Espaços extras entre vírgulas não enganam o split
blocked("6 com espaços extras distribuídos entre para+cc", () =>
  validateRecipients({ para: "a@b.com ,  b@b.com , c@b.com", cc: "d@b.com ,  e@b.com , f@b.com" })
);

// 1f. Vírgulas duplicadas (ruído) não reduzem a contagem real
blocked("6 reais com vírgulas duplicadas distribuídas", () =>
  validateRecipients({ para: "a@b.com,,b@b.com,,c@b.com", cc: "d@b.com,,e@b.com,,f@b.com" })
);

// 1g. Separador `;` não é reconhecido — conta como 1 string, não 6
allowed("Ponto e vírgula em para — conta como 1 destinatário (não é separador)", () =>
  validateRecipients({ para: "a@b.com;b@b.com;c@b.com;d@b.com;e@b.com;f@b.com" })
);

// 1h. Limite exato 5 (3+1+1) — deve passar
allowed("3 para + 1 cc + 1 cco = 5 total — dentro do limite", () =>
  validateRecipients({ para: "a@b.com,b@b.com,c@b.com", cc: "d@b.com", cco: "e@b.com" })
);

// 1i. Sem cc e cco (undefined) — não causa crash
allowed("5 só em para, cc e cco ausentes (undefined)", () =>
  validateRecipients({ para: "a@b.com,b@b.com,c@b.com,d@b.com,e@b.com", cc: undefined, cco: undefined })
);

// 1j. cc e cco vazios (string vazia) — não somam à contagem
allowed("4 para + cc='' + cco='' = 4 total — strings vazias não contam", () =>
  validateRecipients({ para: "a@b.com,b@b.com,c@b.com,d@b.com", cc: "", cco: "" })
);

// =============================================================================
// VETOR 2 — Bypass de recorrência (validateNotRecurring)
// =============================================================================

console.log("\n🔴 VETOR 2 — Bypass de recorrência (validateNotRecurring)\n" + "─".repeat(60));

// 2a. Campo recurrence direto
blocked("payload com 'recurrence' explícito", () =>
  validateNotRecurring({ titulo: "Daily", recurrence: { pattern: { type: "daily" } } })
);

// 2b. Campo seriesMasterId
blocked("payload com 'seriesMasterId'", () =>
  validateNotRecurring({ seriesMasterId: "AAMkXXX" })
);

// 2c. Objeto recurrence vazio (truthy = objeto, porém {} é truthy em JS)
blocked("payload com 'recurrence' como objeto vazio ({})", () =>
  validateNotRecurring({ recurrence: {} })
);

// 2d. recurrence como string vazia — corrigido: "" é tratado como ausência (não bloqueia)
// A Graph API ignora recurrence: "" — não cria recorrência — então não bloquear é correto.
allowed("recurrence como string vazia '' — Graph API ignora, não bloquear é correto", () =>
  validateNotRecurring({ recurrence: "" })
);

// 2e. recurrence: null — deve ser permitido (null = ausente intencionalmente)
allowed("recurrence: null — tratado como ausente, não bloqueia", () =>
  validateNotRecurring({ recurrence: null })
);

// 2f. Payload limpo
allowed("payload sem campos de recorrência — deve passar", () =>
  validateNotRecurring({ titulo: "Reunião", inicio: "2026-03-10T14:00:00" })
);

// 2f. Tentar esconder recorrência via casing diferente (recurrENCE)
// JS é case-sensitive: params.recurrENCE !== params.recurrence
allowed("campo 'recurrENCE' (case errado) não é detectado — JS é case-sensitive", () =>
  validateNotRecurring({ recurrENCE: { pattern: { type: "weekly" } } })
);
// NOTA: Não é ameaça real — o schema do Zod não aceita campos extras fora do schema,
// e a Graph API só reconhece 'recurrence' (lowercase).

// =============================================================================
// VETOR 3 — Bypass de rate limit
// =============================================================================

console.log("\n🔴 VETOR 3 — Bypass de rate limit (checkRateLimit + registerAction)\n" + "─".repeat(60));

const bk3 = backupRateLimit();

try {
  // 3a. Confirmacao como string "true" em vez de boolean true
  writeRateLimitFile({ email: { count: LIMIT, window_start: new Date().toISOString() }, event: { count: 0, window_start: new Date().toISOString() } });
  await blockedAsync('confirmacao como string "true" (não é boolean true)', async () =>
    checkRateLimit("email", "true")
  );

  // 3b. Confirmacao como número 1
  writeRateLimitFile({ email: { count: LIMIT, window_start: new Date().toISOString() }, event: { count: 0, window_start: new Date().toISOString() } });
  await blockedAsync("confirmacao como número 1 (não é boolean true)", async () =>
    checkRateLimit("email", 1)
  );

  // 3c. Confirmacao como objeto truthy
  writeRateLimitFile({ email: { count: LIMIT, window_start: new Date().toISOString() }, event: { count: 0, window_start: new Date().toISOString() } });
  await blockedAsync("confirmacao como objeto {} (truthy mas não === true)", async () =>
    checkRateLimit("email", {})
  );

  // 3d. Domain inválido — não deveria criar entry de forma inesperada
  // Se domain="email_bonus", entry seria undefined → .count explodiria com TypeError
  // Testamos que isso não permite bypass silencioso
  writeRateLimitFile(getDefaultData());
  await blockedAsync("domain inexistente causa TypeError controlado (não bypassa)", async () => {
    await checkRateLimit("dominio_inexistente", false);
    // Se não lançar aqui, registerAction em domain inexistente vai corromper mas não bypassar
  });

  // 3e. Manipulação direta do arquivo — simula atacante que edita .rate-limit.json
  // Colocar count negativo para "enganar" o guardrail
  writeRateLimitFile({ email: { count: -999, window_start: new Date().toISOString() }, event: { count: 0, window_start: new Date().toISOString() } });
  await allowedAsync("count negativo no arquivo não causa bloqueio indevido (count < 10)", async () =>
    checkRateLimit("email", false)
  );
  // count=-999 < 10 → não bloqueia. Isso é esperado e correto.

  // 3f. Manipulação do arquivo colocando count=9999 — deve bloquear
  writeRateLimitFile({ email: { count: 9999, window_start: new Date().toISOString() }, event: { count: 0, window_start: new Date().toISOString() } });
  await blockedAsync("arquivo manipulado com count=9999 ainda bloqueia", async () =>
    checkRateLimit("email", false)
  );

  // 3g. window_start no FUTURO — verificar comportamento
  // now - futuro = negativo → não >= WINDOW_MS → não reseta → bloqueia corretamente
  const futuro = new Date(Date.now() + 7_200_000).toISOString(); // +2h
  writeRateLimitFile({ email: { count: LIMIT, window_start: futuro }, event: { count: 0, window_start: new Date().toISOString() } });
  await blockedAsync("window_start no futuro: não reseta (bloqueia corretamente)", async () =>
    checkRateLimit("email", false)
  );

  // 3h. window_start inválido (string lixo) — new Date("lixo") = NaN
  writeRateLimitFile({ email: { count: LIMIT, window_start: "nao_e_uma_data" }, event: { count: 0, window_start: new Date().toISOString() } });
  // now - NaN = NaN, NaN >= WINDOW_MS = false → NÃO reseta → bloqueia
  await blockedAsync("window_start com string inválida: bloqueia por segurança", async () =>
    checkRateLimit("email", false)
  );

  // 3i. registerAction não deve sobrescrever o domínio com valor errado
  writeRateLimitFile(getDefaultData());
  await registerAction("email");
  const d = readRateLimitFile();
  if (d.email.count === 1 && d.event.count === 0) {
    console.log("  ✅ PERMITIDO: registerAction incrementa só o domínio correto (email=1, event=0)");
    passed++;
  } else {
    console.log(`  ❌ FALSO POSITIVO: registerAction corrompeu outro domínio — email=${d.email.count}, event=${d.event.count}`);
    failed++;
  }

  // 3j. Confirmacao true com count < 10 — deve funcionar normalmente
  writeRateLimitFile(getDefaultData());
  await allowedAsync("confirmacao: true com count=0 (não deve dar erro)", async () =>
    checkRateLimit("email", true)
  );

} finally {
  restoreRateLimit(bk3);
}

// =============================================================================
// VETOR 4 — Bypass via schema Zod (injeção nos campos do schema)
// =============================================================================

console.log("\n🔴 VETOR 4 — Bypass via validação Zod dos schemas\n" + "─".repeat(60));

// 4a. confirmacao como string "true" — Zod deve rejeitar (type = boolean)
{
  const r = sendEmailSchema.safeParse({ para: "a@b.com", assunto: "X", corpo: "Y", confirmacao: "true" });
  if (!r.success) {
    console.log('  ✅ BLOQUEADO: sendEmailSchema rejeita confirmacao="true" (string)');
    console.log(`     → ${r.error.errors[0].message}`);
    passed++;
  } else {
    // Zod com .default(false) pode coagir — verificar se coagiu para true
    if (r.data.confirmacao === true) {
      console.log('  ❌ BYPASS DETECTADO: Zod coagiu confirmacao="true" para boolean true');
      failed++;
    } else {
      console.log(`  ✅ BLOQUEADO (coagido para false): confirmacao="true" → ${r.data.confirmacao}`);
      passed++;
    }
  }
}

// 4b. confirmacao: 1 (número) — Zod deve rejeitar
{
  const r = sendEmailSchema.safeParse({ para: "a@b.com", assunto: "X", corpo: "Y", confirmacao: 1 });
  if (!r.success) {
    console.log("  ✅ BLOQUEADO: sendEmailSchema rejeita confirmacao=1 (número)");
    passed++;
  } else {
    if (r.data.confirmacao === true) {
      console.log("  ❌ BYPASS DETECTADO: Zod coagiu confirmacao=1 para boolean true");
      failed++;
    } else {
      console.log(`  ✅ COAGIDO PARA false: confirmacao=1 → ${r.data.confirmacao}`);
      passed++;
    }
  }
}

// 4c. Campos extras no schema (prototype pollution attempt)
{
  const r = sendEmailSchema.safeParse({
    para: "a@b.com", assunto: "X", corpo: "Y",
    __proto__: { admin: true },
    constructor: { name: "hacked" },
  });
  r.success
    ? console.log("  ✅ PERMITIDO: campos extras ignorados pelo Zod (strip mode)") || passed++
    : console.log(`  ✅ BLOQUEADO: schema rejeitou campos suspeitos — ${r.error.errors[0].message}`) || passed++;
}

// 4d. para com lista de 6 emails como array (tentativa de bypassar o split)
{
  const r = sendEmailSchema.safeParse({ para: ["a@b.com","b@b.com","c@b.com","d@b.com","e@b.com","f@b.com"], assunto: "X", corpo: "Y" });
  if (!r.success) {
    console.log("  ✅ BLOQUEADO: sendEmailSchema rejeita para[] como array (espera string)");
    passed++;
  } else {
    console.log(`  ⚠️  ATENÇÃO: Zod coagiu array para string: "${r.data.para}" — verificar se validateRecipients bloqueia`);
    // Verifica se validateRecipients bloquearia
    try {
      validateRecipients({ para: r.data.para });
      console.log("  ❌ BYPASS TOTAL: array coagido para string e validateRecipients não bloqueou");
      failed++;
    } catch {
      console.log("  ✅ BLOQUEADO em 2º nível: validateRecipients bloqueou mesmo após coerção");
      passed++;
    }
  }
}

// 4e. createEventSchema com recurrence embutido
{
  const r = createEventSchema.safeParse({
    titulo: "Reunião diária",
    inicio: "2026-03-10T08:00:00",
    fim: "2026-03-10T09:00:00",
    recurrence: { pattern: { type: "daily" } },
  });
  if (!r.success) {
    console.log("  ✅ BLOQUEADO: createEventSchema rejeita campo recurrence (não está no schema)");
    passed++;
  } else if (r.data.recurrence !== undefined) {
    console.log("  ❌ BYPASS POTENCIAL: Zod passou recurrence no data — validateNotRecurring precisa barrar");
    // Verifica segunda linha de defesa
    try {
      validateNotRecurring(r.data);
      console.log("  ❌ BYPASS TOTAL: validateNotRecurring não bloqueou recurrence passado pelo Zod");
      failed++;
    } catch {
      console.log("  ✅ BLOQUEADO em 2º nível: validateNotRecurring bloqueou mesmo após Zod passar");
      passed++;
    }
  } else {
    console.log("  ✅ BLOQUEADO (strip): createEventSchema removeu recurrence silenciosamente (Zod strip mode)");
    passed++;
  }
}

// =============================================================================
// VETOR 5 — Arquivo .rate-limit.json corrompido / ausente
// =============================================================================

console.log("\n🔴 VETOR 5 — Resiliência do arquivo .rate-limit.json\n" + "─".repeat(60));

const bk5 = backupRateLimit();

try {
  // 5a. Arquivo ausente — deve criar defaults e não lançar
  if (fs.existsSync(RATE_LIMIT_PATH)) fs.unlinkSync(RATE_LIMIT_PATH);
  await allowedAsync("arquivo ausente: readRateLimitFile retorna defaults sem crash", async () =>
    checkRateLimit("email", false)
  );

  // 5b. Arquivo com JSON inválido
  fs.writeFileSync(RATE_LIMIT_PATH, "{ corrupto: sem aspas }");
  await allowedAsync("JSON inválido: readRateLimitFile retorna defaults sem crash", async () =>
    checkRateLimit("email", false)
  );

  // 5c. Arquivo com estrutura parcial (falta entry 'event') — readRateLimitFile agora retorna defaults
  fs.writeFileSync(RATE_LIMIT_PATH, JSON.stringify({ email: { count: 5, window_start: new Date().toISOString() } }));
  await allowedAsync("estrutura parcial (falta 'event'): readRateLimitFile preenche com defaults — não bloqueia", async () =>
    checkRateLimit("event", false)
  );

  // 5d. Arquivo vazio
  fs.writeFileSync(RATE_LIMIT_PATH, "");
  await allowedAsync("arquivo vazio: tratado como JSON inválido → defaults → não bloqueia", async () =>
    checkRateLimit("email", false)
  );

} finally {
  restoreRateLimit(bk5);
}

// =============================================================================
// VETOR 6 — Confirmação de cobertura total: para + CC + CCO
// =============================================================================

console.log("\n🔴 VETOR 6 — Cobertura total para + CC + CCO\n" + "─".repeat(60));

// 6a. CC com 20 endereços agora é bloqueado (gap corrigido)
blocked("CC com 20 endereços bloqueado (limite total)", () =>
  validateRecipients({ para: "a@b.com", cc: Array.from({ length: 20 }, (_, i) => `cc${i}@b.com`).join(",") })
);

// 6b. CCO com 20 endereços agora é bloqueado
blocked("CCO com 20 endereços bloqueado (limite total)", () =>
  validateRecipients({ para: "a@b.com", cco: Array.from({ length: 20 }, (_, i) => `bcc${i}@b.com`).join(",") })
);

// 6c. Distribuição que soma exatamente 5 (2+2+1) — deve passar
allowed("2 para + 2 cc + 1 cco = 5 total — no limite exato", () =>
  validateRecipients({ para: "a@b.com,b@b.com", cc: "c@b.com,d@b.com", cco: "e@b.com" })
);

// 6d. Distribuição que soma 6 (2+2+2) — deve bloquear
blocked("2 para + 2 cc + 2 cco = 6 total — um acima do limite", () =>
  validateRecipients({ para: "a@b.com,b@b.com", cc: "c@b.com,d@b.com", cco: "e@b.com,f@b.com" })
);

// =============================================================================
// RESULTADO FINAL
// =============================================================================

console.log("\n" + "═".repeat(60));
console.log(`\n📊 RESULTADO DOS TESTES DE SEGURANÇA`);
console.log(`   ✅ Bloqueados/Permitidos corretamente: ${passed}`);
console.log(`   ❌ Bypasses ou falsos positivos: ${failed}`);

if (failures.length > 0) {
  console.log(`\n⚠️  ATENÇÃO — Falhas encontradas:`);
  failures.forEach((f) => console.log(`   • ${f}`));
}

console.log("");

if (failed === 0) {
  console.log("🛡️  Nenhum bypass real detectado. Guardrails funcionando conforme o esperado.\n");
} else {
  console.log("🚨 Bypasses ou comportamentos inesperados detectados. Revisar acima.\n");
  process.exit(1);
}
