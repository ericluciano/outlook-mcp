/**
 * search-contacts.js — Ferramenta MCP para buscar contatos no diretório Microsoft 365
 */

import { z } from "zod";
import { graphRequest } from "../graph.js";

export const searchContactsSchema = z.object({
  nome: z
    .string()
    .describe("Nome ou parte do nome da pessoa para buscar no diretório"),
  quantidade: z
    .number()
    .optional()
    .default(10)
    .describe("Número máximo de resultados. Padrão: 10"),
});

export async function searchContacts(params) {
  const { nome, quantidade } = params;

  const top = Math.min(quantidade, 25);
  const search = encodeURIComponent(`"${nome}"`);

  // Busca no diretório organizacional (People API)
  const endpoint = `/me/people?$search=${search}&$top=${top}&$select=displayName,scoredEmailAddresses,jobTitle,department,phones`;

  const result = await graphRequest("GET", endpoint);

  if (!result || !result.value || result.value.length === 0) {
    return `Nenhum contato encontrado para "${nome}".`;
  }

  const contatos = result.value.map((p, i) => {
    const emails = p.scoredEmailAddresses?.length > 0
      ? p.scoredEmailAddresses.map((e) => e.address).join(", ")
      : "sem e-mail";
    const cargo = p.jobTitle ? `\n   Cargo: ${p.jobTitle}` : "";
    const depto = p.department ? `\n   Departamento: ${p.department}` : "";
    const telefones = p.phones?.length > 0
      ? `\n   Telefone: ${p.phones.map((t) => t.number).join(", ")}`
      : "";

    return `${i + 1}. ${p.displayName}\n   E-mail: ${emails}${cargo}${depto}${telefones}`;
  });

  return `Contatos encontrados para "${nome}":\n${"─".repeat(50)}\n` + contatos.join("\n\n");
}
