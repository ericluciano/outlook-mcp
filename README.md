# outlook-mcp

MCP local para envio de e-mail e criação de compromissos no Microsoft 365 via Outlook.

## Ferramentas disponíveis

| Ferramenta | O que faz |
|---|---|
| `enviar_email` | Envia e-mail pelo Outlook da conta autenticada |
| `criar_compromisso` | Cria compromisso no Calendário do Outlook |

## Instalação

```bash
npm install
```

## Autenticação (primeira vez)

```bash
node auth.js
```

Siga as instruções no terminal: acesse a URL exibida, digite o código e faça login com sua conta Microsoft 365.

O token será salvo localmente em `.token-cache.json` (não é enviado para nenhum servidor externo).

## Configurar no Claude Code

```bash
claude mcp add outlook-mcp -- node /caminho/completo/para/outlook-mcp/index.js
```

## Permissões solicitadas

- `Mail.Send` — enviar e-mails
- `Calendars.ReadWrite` — criar e editar compromissos
- `User.Read` — identificar a conta autenticada
- `offline_access` — renovar token sem re-autenticar

## Segurança

- Token armazenado localmente em `.token-cache.json` com permissão `0600`
- Nenhum dado é enviado para servidores externos além da Microsoft Graph API
- Código 100% auditável e open source
