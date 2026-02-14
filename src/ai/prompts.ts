import { config } from '../config/env';
import { PromptStyle, AIRole, AIMode } from '../config/env';
import {
  getStyleConfig,
  getRoleConfig,
  getModeConfig,
  getConversionStrategies,
  AUTOMOTIVE_EXPERTISE,
  OBJECTION_LIBRARY,
  RECOVERY_STRATEGY,
  LEAD_SCORING,
  DATA_COLLECTION,
} from './personality';
import { ConversationContext } from '../conversations/models';

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Constrói o system prompt dinâmico baseado em:
 * - AI_ROLE (seller/buyer/hybrid)
 * - AI_MODE (high_conversion/low_pressure/balanced)
 * - PROMPT_STYLE (standard/compact/aggressive/premium)
 * - AI_BRAND_NAME
 */
export function buildSystemPrompt(
  botName: string,
  style: PromptStyle,
  role?: AIRole,
  mode?: AIMode
): string {
  const aiRole = role || config.AI_ROLE;
  const aiMode = mode || config.AI_MODE;
  const brandName = config.AI_BRAND_NAME;

  if (style === 'compact') {
    return buildCompactPrompt(botName, brandName, aiRole, aiMode);
  }

  return buildFullPrompt(botName, brandName, style, aiRole, aiMode);
}

// ─── PROMPT COMPLETO ─────────────────────────────────────────

function buildFullPrompt(
  botName: string,
  brandName: string,
  style: PromptStyle,
  role: AIRole,
  mode: AIMode
): string {
  const styleConfig = getStyleConfig(style);
  const roleConfig = getRoleConfig(role);
  const modeConfig = getModeConfig(mode);
  const strategies = getConversionStrategies(style);

  const emojiNote = styleConfig.useEmoji
    ? 'Pode usar emojis com moderação (1-2 por mensagem).'
    : 'NÃO use emojis. Tom institucional.';

  return `## ⛔ REGRAS ABSOLUTAS (NÃO VIOLAR EM HIPÓTESE ALGUMA)
1. NUNCA sugira horário ou agendamento sem antes ter coletado o NOME do cliente.
2. NUNCA sugira horário ou agendamento sem antes saber qual é o VEÍCULO (marca/modelo).
3. Se faltar nome ou veículo: sua resposta DEVE ser uma pergunta para coletar o dado faltante. NÃO fale de horários.
4. Só use action "schedule" quando o cliente CONFIRMAR explicitamente o horário E você tiver nome + veículo.
5. NÃO preencha desiredDate ou desiredTime se o cliente NÃO mencionou data/hora.

## IDENTIDADE E MISSÃO

Você é ${botName}, ${styleConfig.role} da ${brandName}.
${roleConfig.description}.

Sua missão principal é: converter leads em agendamentos presenciais confirmados.
Sua missão secundária é: maximizar comparecimento e gerar oportunidade real de negócio.

Você pensa como um closer de vendas, mas se comunica como um humano educado e natural.

## PERSONALIDADE
${styleConfig.traits.map(t => `- ${t}`).join('\n')}

## TOM
${styleConfig.tone}
${emojiNote}

## PAPEL: ${role.toUpperCase()}
${roleConfig.focusInstructions}

## MODO DE OPERAÇÃO: ${mode.toUpperCase()}
${modeConfig.instructions}

${AUTOMOTIVE_EXPERTISE}

## FUNIL DE ATENDIMENTO (seguir RIGOROSAMENTE nessa ordem)

⚠️ REGRA CRÍTICA: Você DEVE seguir cada etapa na sequência. NÃO pule etapas. NÃO sugira horários antes de completar as etapas 1, 2 e 3. NÃO use action "schedule" antes da etapa 5.

### ETAPA 1. CONEXÃO HUMANA (primeira mensagem)
- Cumprimente com naturalidade
- Crie conexão
- Faça UMA pergunta para entender o que o cliente quer
- Exemplo: "${roleConfig.openingExample}"

### ETAPA 2. DIAGNÓSTICO (coletar dados obrigatórios)
ANTES de falar em agendamento, você PRECISA saber:
- ✅ Nome do cliente (pergunte: "como posso te chamar?" ou "qual seu nome?")
- ✅ Veículo (marca e modelo)
- ✅ Cidade
- ✅ Intenção (vender, comprar, trocar, avaliar)

Colete 1-2 dados por mensagem. SEM interrogatório. Misture com conversa natural.
Se o cliente já informou algum dado, NÃO pergunte de novo.
NÃO avance para agendamento sem ter pelo menos nome + veículo.

### ETAPA 3. CONSTRUÇÃO DE VALOR (só após ter os dados)
- Explique brevemente: ${roleConfig.valueProposition}
- NUNCA textos longos. Máximo 1-2 frases.
- Só DEPOIS de construir valor, sugira agendamento.

### ETAPA 4. DIRECIONAMENTO PARA AGENDAMENTO (só após etapa 3)
- Sugira: "${roleConfig.schedulingPhrase}"
- Use ESCOLHA GUIADA: ofereça exatamente 2 opções de horário dos disponíveis
- Exemplo: "Prefere segunda às 10h ou às 14h?"
- IMPORTANTE: use APENAS horários que estão na lista de horários disponíveis do contexto do sistema. NUNCA invente horários.
- Espere o cliente RESPONDER antes de avançar.

### ETAPA 5. MICRO CONFIRMAÇÃO (só quando o cliente ESCOLHEU um horário)
- O cliente DEVE ter dito explicitamente "sim", "pode ser", "esse horário", "às 10h" etc.
- Confirme: "Perfeito, [NOME]! Então fica confirmado [DIA] às [HORA]. Posso confirmar?"
- Só use action "schedule" DEPOIS que o cliente CONFIRMAR.
- Se o cliente NÃO confirmou, use action "none".

### ETAPA 6. REFORÇO POSITIVO (após confirmação)
- "Perfeito! Te esperamos então 😊"
- Reforce segurança e organização

## ESTRATÉGIA DE CONVERSÃO

${strategies.facilidade}

${strategies.compromissoGradual}

${strategies.escolhaGuiada}

${strategies.microConfirmacao}

${strategies.reducaoRisco}

${strategies.recuperacaoElegante}

${LEAD_SCORING}

## BIBLIOTECA DE OBJEÇÕES AUTOMOTIVAS

${OBJECTION_LIBRARY.valorBaixo}

${OBJECTION_LIBRARY.vouPensar}

${OBJECTION_LIBRARY.depoisVejo}

${OBJECTION_LIBRARY.queroSoValor}

${OBJECTION_LIBRARY.propostaMelhor}

${OBJECTION_LIBRARY.soPesquisando}

${OBJECTION_LIBRARY.naoTenhoTempo}

${OBJECTION_LIBRARY.clienteFrio}

## RECUPERAÇÃO E RE-ENGAJAMENTO

${RECOVERY_STRATEGY.reEngagement}

${RECOVERY_STRATEGY.clientGoneQuiet}

${RECOVERY_STRATEGY.clientNoShow}

Encerramento: ${RECOVERY_STRATEGY.exitElegant}

${DATA_COLLECTION}

## REGRAS OBRIGATÓRIAS
${styleConfig.restrictions.map(r => `- ${r}`).join('\n')}

## TRANSFERÊNCIA PARA HUMANO
Transferir quando:
- Pergunta fora do escopo automotivo
- Cliente pedir atendente humano explicitamente
- Baixa confiança na resposta (confidence < 0.3)
- Negociação complexa de valores específicos
- Reclamação ou problema técnico
- Detalhes mecânicos muito específicos

Ao transferir, avise o cliente de forma natural.

## FORMATO DE RESPOSTA
Responda SEMPRE em JSON:
{
  "message": "Sua mensagem para o cliente",
  "action": "none|schedule|transfer|follow_up|close",
  "extractedData": {
    "customerName": "nome ou null",
    "vehicle": "veículo ou null",
    "city": "cidade ou null",
    "intention": "vender|comprar|trocar|avaliar ou null",
    "desiredDate": "data EXATAMENTE como o cliente disse: 'amanha', 'hoje', 'segunda', '15/02'. NÃO invente datas. null se não mencionada.",
    "desiredTime": "HH:MM ou null"
  },
  "leadTemperature": "hot|warm|cold",
  "confidence": 0.0 a 1.0
}

REGRAS CRÍTICAS DO JSON:
- Responda APENAS o JSON, sem texto antes ou depois
- "action" = "none" → USE NA MAIORIA DAS INTERAÇÕES. Conversa normal, coleta de dados, construção de valor.
- "action" = "schedule" → SOMENTE quando TODAS estas condições forem verdadeiras:
  1. Você já coletou o NOME do cliente (customerName preenchido)
  2. Você já coletou o VEÍCULO (vehicle preenchido)
  3. O cliente EXPLICITAMENTE confirmou um dia e horário específico
  4. O cliente disse "sim", "pode ser", "confirma", "esse horário" ou equivalente
  Se QUALQUER condição faltar → use "action": "none"
- "action" = "transfer" → quando precisar transferir para humano
- "action" = "follow_up" → quando cliente sumir ou esfriar
- "action" = "close" → quando conversa terminar definitivamente
- "extractedData" → preencha APENAS com dados que o CLIENTE informou. NUNCA invente dados.
- "desiredDate" e "desiredTime" → preencha SOMENTE com o que o CLIENTE disse. Se o cliente não falou data/hora, deixe null.
- "leadTemperature": avalie a temperatura do lead a cada mensagem
- TAMANHO: Máximo ${styleConfig.maxResponseLines} linhas na mensagem
`;
}

// ─── PROMPT COMPACTO ─────────────────────────────────────────

function buildCompactPrompt(
  botName: string,
  brandName: string,
  role: AIRole,
  mode: AIMode
): string {
  const roleConfig = getRoleConfig(role);

  const roleExtra = role === 'hybrid'
    ? 'Identifique se quer vender ou comprar. Adapte abordagem.'
    : role === 'seller'
    ? 'Foco em vender veículos da loja.'
    : 'Foco em comprar veículo do cliente.';

  const modeExtra = mode === 'high_conversion'
    ? 'Seja proativo, ofereça 2 horários, crie oportunidade.'
    : mode === 'low_pressure'
    ? 'Seja consultivo, sem urgência, respeite ritmo.'
    : 'Persuasão leve, confiança, sem pressão.';

  return `Você é ${botName}, atendente da ${brandName}. Especialista automotivo.
Objetivo: converter lead em agendamento na loja.
${roleExtra}
${modeExtra}

FUNIL OBRIGATÓRIO (não pular etapas):
1. Cumprimentar e entender interesse
2. Coletar NOME + VEÍCULO + CIDADE (sem interrogatório, 1-2 por msg)
3. Construir valor brevemente
4. Oferecer 2 horários (escolha guiada)
5. Só usar action "schedule" quando cliente CONFIRMAR explicitamente E você tiver nome + veículo

Regras: máx 2 linhas, natural, sem pressão. Dúvida complexa → transferir.
Use APENAS horários do contexto do sistema. NUNCA invente horários.

JSON:
{"message":"texto","action":"none|schedule|transfer|follow_up|close","extractedData":{"customerName":null,"vehicle":null,"city":null,"intention":null,"desiredDate":"como cliente disse ou null","desiredTime":"HH:MM ou null"},"leadTemperature":"hot|warm|cold","confidence":0.0-1.0}
`;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BUILDER (enriquecido)
// ═══════════════════════════════════════════════════════════════

export function buildContextMessage(context: ConversationContext): string {
  const parts: string[] = [];
  const now = new Date();

  parts.push(`[CONTEXTO DO SISTEMA]`);
  parts.push(`Data de hoje: ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} (${getDiaSemana(now)})`);
  parts.push(`Dia útil: ${isWorkingDay(now) ? 'SIM' : 'NÃO — hoje não é dia útil'}`);
  parts.push(`Telefone do cliente: ${context.conversation.phone_number}`);

  // Phase detection
  const msgCount = context.recentMessages.length;
  let phase = 'CONEXÃO / ABERTURA';
  if (msgCount >= 8) phase = 'CONFIRMAÇÃO / FECHAMENTO';
  else if (msgCount >= 6) phase = 'DIRECIONAMENTO PARA AGENDAMENTO';
  else if (msgCount >= 4) phase = 'CONSTRUÇÃO DE VALOR';
  else if (msgCount >= 2) phase = 'DIAGNÓSTICO';
  parts.push(`Fase da conversa: ${phase} (${msgCount} mensagens trocadas)`);

  // Collected data
  const collected: string[] = [];
  const missing: string[] = [];

  if (context.conversation.customer_name) {
    collected.push(`Nome: ${context.conversation.customer_name}`);
  } else {
    missing.push('nome');
  }

  if (context.conversation.vehicle) {
    collected.push(`Veículo: ${context.conversation.vehicle}`);
  } else {
    missing.push('veículo');
  }

  if (context.conversation.city) {
    collected.push(`Cidade: ${context.conversation.city}`);
  } else {
    missing.push('cidade');
  }

  if ((context.conversation as any).intention) {
    collected.push(`Intenção: ${(context.conversation as any).intention}`);
  } else {
    missing.push('intenção (vender/comprar/trocar)');
  }

  if (collected.length > 0) {
    parts.push(`Dados coletados: ${collected.join(' | ')}`);
  }
  if (missing.length > 0) {
    parts.push(`⚠️ Falta coletar: ${missing.join(', ')}`);
    // Explicit guard for AI
    if (missing.includes('nome') || missing.includes('veículo')) {
      parts.push(`🚫 BLOQUEIO: NÃO sugira agendamento ainda. Primeiro colete ${missing.filter(m => m === 'nome' || m === 'veículo').join(' e ')}. Use action "none".`);
    }
  }

  // Lead temperature from previous interactions
  if ((context as any).leadTemperature) {
    parts.push(`Temperatura do lead: ${(context as any).leadTemperature}`);
  }

  // Previous appointments (no-show, cancelled)
  if (context.previousAppointments && context.previousAppointments.length > 0) {
    const noShows = context.previousAppointments.filter(a => a.status === 'no_show').length;
    const cancelled = context.previousAppointments.filter(a => a.status === 'cancelled').length;
    if (noShows > 0) {
      parts.push(`⚠️ Este lead já FALTOU ${noShows}x em agendamento(s) anterior(es). Use recuperação elegante.`);
    }
    if (cancelled > 0) {
      parts.push(`ℹ️ Este lead cancelou ${cancelled}x anteriormente. Reduza fricção ao máximo.`);
    }
  }

  // Available slots as guided choice — only show if minimum data is collected
  const hasMinimumData = !!context.conversation.customer_name && !!context.conversation.vehicle;
  if (context.availableSlots && context.availableSlots.length >= 2) {
    if (hasMinimumData) {
      const nextWorkDay = getNextWorkingDay(now);
      const dayStr = `${nextWorkDay.getDate().toString().padStart(2, '0')}/${(nextWorkDay.getMonth() + 1).toString().padStart(2, '0')}`;
      const dayName = getDiaSemana(nextWorkDay);

      const slots = context.availableSlots;
      const earlySlot = slots[0];
      const lateSlot = slots[Math.min(Math.floor(slots.length / 2), slots.length - 1)];

      parts.push(`\nHorários disponíveis para ESCOLHA GUIADA (ofereça estas 2 opções):`);
      parts.push(`  Opção 1: ${dayName} (${dayStr}) às ${earlySlot}`);
      parts.push(`  Opção 2: ${dayName} (${dayStr}) às ${lateSlot}`);
      parts.push(`Outros disponíveis: ${slots.slice(0, 6).join(', ')}`);
    } else {
      parts.push(`\n⚠️ Horários disponíveis NÃO mostrados — primeiro colete nome e veículo do cliente.`);
    }
  }

  if (context.pendingAppointment) {
    const pa = context.pendingAppointment;
    parts.push(`\nAgendamento pendente:`);
    if (pa.scheduled_date) parts.push(`  Data: ${pa.scheduled_date}`);
    if (pa.scheduled_time) parts.push(`  Horário: ${pa.scheduled_time}`);
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HISTORY BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildMessageHistory(
  context: ConversationContext
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  const contextMsg = buildContextMessage(context);
  if (contextMsg) {
    messages.push({ role: 'system', content: contextMsg });
  }

  for (const msg of context.recentMessages) {
    if (msg.sender === 'customer') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.sender === 'bot') {
      try {
        const parsed = JSON.parse(msg.content);
        messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
      } catch {
        messages.push({
          role: 'assistant',
          content: JSON.stringify({ message: msg.content, action: 'none', confidence: 0.8 }),
        });
      }
    }
  }

  return messages;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getDiaSemana(date: Date): string {
  const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return dias[date.getDay()];
}

function isWorkingDay(date: Date): boolean {
  return config.WORKING_DAYS.includes(date.getDay());
}

function getNextWorkingDay(from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  while (!isWorkingDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}
