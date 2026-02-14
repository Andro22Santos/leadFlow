# LeadFlow - Lead Manager V1

Sistema de gestão de leads automotivos com atendimento automatizado via WhatsApp e IA.

## O que é o LeadFlow?

LeadFlow é uma aplicação de pré-venda digital que:
- Recebe leads via WhatsApp
- Atende automaticamente com IA (OpenAI ou Gemini)
- Realiza agendamentos com validação de horário
- Registra automaticamente na planilha Google Sheets
- Permite transferência para atendente humano

---

## Pré-requisitos

- **Node.js** 18+ 
- **PostgreSQL** 14+
- **Google Chrome** (necessário para WhatsApp Web)
- Conta **OpenAI** ou **Google AI (Gemini)**
- **Google Cloud** com Sheets API habilitada

---

## Instalação

### 1. Clonar e instalar dependências

```bash
git clone <repo-url>
cd App_Lead
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
# Banco de dados
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/leadflow

# IA (escolha openai ou gemini)
AI_PROVIDER=gemini
OPENAI_API_KEY=sua-chave-openai
GEMINI_API_KEY=sua-chave-gemini

# Google Sheets
GOOGLE_SHEETS_ID=id-da-sua-planilha
GOOGLE_SERVICE_ACCOUNT_JSON=./google-service-account.json

# Bot
BOT_NAME=LeadFlow
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=18:00
WORKING_DAYS=1,2,3,4,5,6
```

### 3. Criar banco de dados PostgreSQL

```bash
createdb leadflow
```

Ou via psql:

```sql
CREATE DATABASE leadflow;
```

### 4. Rodar migrações

```bash
npm run migrate
```

### 5. Iniciar a aplicação

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

---

## Conectar WhatsApp

1. Inicie a aplicação com `npm run dev`
2. Acesse `http://localhost:3000/whatsapp/qr`
3. Abra o WhatsApp no celular
4. Vá em **Configurações > Dispositivos conectados > Conectar dispositivo**
5. Escaneie o QR Code exibido na tela
6. Aguarde a confirmação de conexão no console

A sessão é salva automaticamente em `.wwebjs_auth/`. Nas próximas vezes, a conexão será automática.

---

## Configurar Google Sheets

### Passo 1: Criar projeto no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto (ex: "LeadFlow")
3. No menu lateral, vá em **APIs e Serviços > Biblioteca**
4. Pesquise "Google Sheets API" e ative

### Passo 2: Criar Service Account

1. Vá em **APIs e Serviços > Credenciais**
2. Clique em **Criar credenciais > Conta de serviço**
3. Dê um nome (ex: "leadflow-sheets")
4. Clique em **Concluído**

### Passo 3: Gerar chave JSON

1. Clique na conta de serviço criada
2. Vá na aba **Chaves**
3. Clique em **Adicionar chave > Criar nova chave**
4. Selecione **JSON** e clique em **Criar**
5. Salve o arquivo como `google-service-account.json` na raiz do projeto

### Passo 4: Compartilhar a planilha

1. Abra sua planilha do Google Sheets
2. Clique em **Compartilhar**
3. Adicione o email da Service Account (encontrado no arquivo JSON, campo `client_email`)
4. Dê permissão de **Editor**

### Passo 5: Configurar no .env

1. Copie o ID da planilha (está na URL: `docs.google.com/spreadsheets/d/{ID}/edit`)
2. Coloque no `.env`:

```env
GOOGLE_SHEETS_ID=seu-id-aqui
GOOGLE_SERVICE_ACCOUNT_JSON=./google-service-account.json
```

### Estrutura da Planilha

A planilha deve ter abas nomeadas por mês (ex: "JANEIRO 2026", "FEVEREIRO 2026") com as colunas:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| DIA | DIA DA SEMANA | HORA | PRÉ VENDAS | CLIENTE | CARRO | TELEFONE | CIDADE | ORIGEM | COMPARECEU |

---

## Como Testar

### Simulação via API (sem WhatsApp)

```bash
# Enviar primeira mensagem
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999999999", "message": "Oi, quero avaliar meu carro"}'

# Continuar conversa
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999999999", "message": "Tenho um Civic 2020"}'

# Agendar
curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999999999", "message": "Pode ser amanhã às 14:00"}'
```

### Verificar status

```bash
# Health check
curl http://localhost:3000/health

# Status do WhatsApp
curl http://localhost:3000/whatsapp/status

# Listar conversas ativas
curl http://localhost:3000/conversations

# Agendamentos de hoje
curl http://localhost:3000/appointments/today
```

### Transferir para humano

```bash
curl -X POST http://localhost:3000/conversations/5511999999999/transfer \
  -H "Content-Type: application/json" \
  -d '{"agentName": "João"}'
```

---

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Info da aplicação |
| GET | `/health` | Health check |
| POST | `/simulate` | Simular mensagem |
| GET | `/whatsapp/qr` | Página com QR Code |
| GET | `/whatsapp/status` | Status da conexão |
| GET | `/conversations` | Listar conversas ativas |
| GET | `/conversations/:phone` | Histórico por telefone |
| POST | `/conversations/:phone/transfer` | Transferir para humano |
| POST | `/conversations/:phone/message` | Enviar mensagem humana |
| POST | `/conversations/:phone/return-to-ai` | Retornar para IA |
| GET | `/appointments` | Listar agendamentos |
| GET | `/appointments/today` | Agendamentos do dia |

---

## Estrutura do Projeto

```
src/
├── config/
│   ├── env.ts              # Validação de variáveis de ambiente
│   ├── database.ts         # Configuração PostgreSQL + migrações
│   └── ai-providers.ts     # Configuração OpenAI + Gemini
├── whatsapp/
│   ├── client.ts           # Cliente WhatsApp Web
│   ├── qr-handler.ts       # Geração de QR Code
│   └── message-handler.ts  # Processamento de mensagens
├── ai/
│   ├── ai-service.ts       # Orquestrador de IA
│   ├── openai-provider.ts  # Provedor OpenAI
│   ├── gemini-provider.ts  # Provedor Gemini
│   ├── prompts.ts          # System prompts
│   └── personality.ts      # Personalidade do bot
├── conversations/
│   ├── conversation-manager.ts  # Gerenciador de conversas
│   ├── models.ts                # Tipos TypeScript
│   └── repository.ts            # Acesso ao banco
├── scheduling/
│   ├── scheduler.ts        # Lógica de agendamento
│   ├── validator.ts        # Validação de conflitos
│   └── availability.ts     # Consulta de disponibilidade
├── sheets/
│   ├── sheets-client.ts    # Cliente Google Sheets
│   ├── sheet-detector.ts   # Detecta aba do mês atual
│   ├── appointment-writer.ts # Escreve agendamento
│   └── availability-reader.ts # Lê horários ocupados
├── routes/
│   ├── health.ts           # Health check
│   ├── simulate.ts         # Simulação de mensagens
│   ├── conversations.ts    # API de conversas
│   ├── transfer.ts         # Transferência para humano
│   ├── appointments.ts     # API de agendamentos
│   └── whatsapp.ts         # QR Code e status
├── database/
│   └── schema.sql          # Schema SQL
├── utils/
│   ├── logger.ts           # Sistema de logs (Winston)
│   └── date-helpers.ts     # Helpers de data/hora em PT-BR
└── app.ts                  # Entry point
```

---

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia em modo desenvolvimento (hot reload) |
| `npm run build` | Compila TypeScript |
| `npm start` | Inicia versão compilada |
| `npm run migrate` | Roda migrações do banco |

---

## Roadmap

- **V1** (atual): WhatsApp QR + IA + Agendamento + Google Sheets
- **V1.1**: Migração para WhatsApp Business API (Meta)
- **V2**: Interface web de gerenciamento
- **V3**: Multi-lojas / Multi-tenancy (SaaS)
- **V4**: Analytics e relatórios
- **V5**: Integração com CRMs externos

---

## Licença

ISC
