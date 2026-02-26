# Outlook MCP Server

MCP (Model Context Protocol) server para integração com Microsoft 365 (Outlook). Permite que assistentes AI (Claude Code, Claude Desktop, etc.) enviem e-mails, criem compromissos e consultem a agenda via Microsoft Graph API.

> **Credenciais são pessoais.** Cada pessoa usa sua própria conta Microsoft 365. Nenhuma credencial está incluída neste repositório.

## Funcionalidades

- **E-mail**: enviar mensagens, ler inbox/enviados/rascunhos, marcar como lido
- **Calendário**: criar compromissos, listar eventos por período, verificar disponibilidade
- **Contatos**: buscar no diretório Microsoft 365

## Pré-requisitos

- Node.js 18+
- Conta Microsoft 365 (corporativa ou pessoal)
- Acesso ao Azure App Registration da empresa (falar com o admin)

## Como usar

### 1. Clonar e instalar

```bash
git clone https://github.com/ericluciano/outlook-mcp.git
cd outlook-mcp
npm install
```

### 2. Autenticar com sua conta

```bash
node auth.js
```

Siga as instruções no terminal: acesse a URL exibida, insira o código e faça login com **sua conta Microsoft 365**. O token é salvo localmente em `.token-cache.json` (apenas na sua máquina, nunca no repositório).

### 3. Registrar no Claude Desktop

Edite `C:\Users\SeuUsuario\AppData\Roaming\Claude\claude_desktop_config.json` e adicione:

```json
{
  "mcpServers": {
    "outlook": {
      "command": "node",
      "args": ["C:\\caminho\\para\\outlook-mcp\\index.js"]
    }
  }
}
```

> Não é necessário incluir credenciais no config — a autenticação é feita via token local gerado pelo `auth.js`.

### 4. Reiniciar o Claude Desktop

Feche e reabra o Claude Desktop para carregar o MCP.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm start` | Inicia o MCP server |
| `node auth.js` | Autentica com sua conta Microsoft 365 (primeira vez ou ao renovar) |

## Ferramentas disponíveis

| Ferramenta | Descrição |
|---|---|
| `enviar_email` | Envia e-mail pela sua conta Outlook (máx 5 destinatários) |
| `criar_compromisso` | Cria compromisso no seu Calendário |
| `ler_emails` | Lê e-mails da inbox, enviados ou rascunhos |
| `listar_compromissos` | Lista seus compromissos por período |
| `buscar_contato` | Busca contatos no diretório Microsoft 365 |
| `verificar_disponibilidade` | Encontra horários livres em comum com outras pessoas |
| `marcar_email` | Marca e-mail como lido ou não lido |

## Permissões solicitadas (Microsoft Graph)

- `Mail.Send` — enviar e-mails
- `Mail.Read` — ler e-mails
- `Calendars.ReadWrite` — criar e listar compromissos
- `People.Read` — buscar contatos
- `User.Read` — identificar a conta autenticada
- `offline_access` — renovar token sem re-autenticar

## Segurança

- Token armazenado localmente em `.token-cache.json` com permissão `0600`
- `.token-cache.json` está no `.gitignore` — nunca vai para o repositório
- Nenhum dado é enviado para servidores externos além da Microsoft Graph API
- Código 100% auditável e open source

## Licença

MIT
