import { NextRequest, NextResponse } from 'next/server';
import {
  executeSreTool,
  SRE_TOOLS,
  type SreAction,
} from '@/lib/sreTools';

type ConversationMessage = {
  role: string;
  content: string;
};

type RespondRequest = {
  transcript?: unknown;
  history?: unknown;
  serviceName?: unknown;
  region?: unknown;
  activeAlerts?: unknown;
  recentEvents?: unknown;
};

const SYSTEM_PROMPT =
  'You are EchoOps, an expert SRE triage lead. Triage outages, pinpoint probable causes, suggest rollbacks or diagnostic commands, and ask focused operational questions. Be direct, calm, authoritative, and concise: respond in strictly 2–3 spoken sentences maximum. Use plain conversational text only, with no markdown, bullets, or bold text, suitable for TTS playback.';
const PROMPT_CHAR_LIMIT = 2000;
const HISTORY_MESSAGE_LIMIT = 8;
const SYSTEM_PROMPT_CHAR_LIMIT = 900;
const HISTORY_MESSAGE_CHAR_LIMIT = 80;
const TRANSCRIPT_CHAR_LIMIT = 350;

const FALLBACK_REPLY =
  'Check the connection-pool saturation and error rate first, then compare them with the last deployment. If the pool is exhausted after a recent change, roll back that release while collecting a short stack trace and database connection count.';

type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type OpenAIMessage = {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

type OpenAIStreamResult = {
  toolCalls: ToolCall[];
  tokensUsed: number;
  assistantContent: string;
};

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return typeof message.role === 'string' && typeof message.content === 'string';
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
        .map((item) => item.trim())
    : [];
}

function assembleSystemPrompt(body: RespondRequest): string {
  const contextLines = [
    getString(body.serviceName) && `Service: ${getString(body.serviceName)}`,
    getString(body.region) && `Region: ${getString(body.region)}`,
    getStringList(body.activeAlerts).length > 0 &&
      `Active alerts: ${getStringList(body.activeAlerts).join('; ')}`,
    getStringList(body.recentEvents).length > 0 &&
      `Recent events: ${getStringList(body.recentEvents).join('; ')}`,
  ].filter((line): line is string => Boolean(line));

  if (contextLines.length === 0) return SYSTEM_PROMPT;

  return `Live telemetry:\n${truncate(contextLines.join('\n'), 600)}\n${SYSTEM_PROMPT}`;
}

function buildMessages(body: RespondRequest, systemPrompt: string) {
  const history = Array.isArray(body.history)
    ? body.history
        .filter(isConversationMessage)
        .slice(-HISTORY_MESSAGE_LIMIT)
        .map((message) => ({
          role: message.role,
          content: truncate(message.content.trim(), HISTORY_MESSAGE_CHAR_LIMIT),
        }))
    : [];
  const transcript = truncate(getString(body.transcript) ?? '', TRANSCRIPT_CHAR_LIMIT);
  const messages = [
    { role: 'system', content: truncate(systemPrompt, SYSTEM_PROMPT_CHAR_LIMIT) },
    ...history,
    { role: 'user', content: transcript },
  ];
  const totalCharacters = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  // Fixed allocations above keep this under roughly 500 tokens. This guard is
  // retained in case the prompt constants are changed independently later.
  if (totalCharacters <= PROMPT_CHAR_LIMIT) return messages;
  return [
    messages[0],
    ...messages.slice(1, -1).map((message) => ({
      ...message,
      content: truncate(message.content, 40),
    })),
    messages[messages.length - 1],
  ];
}

function sseEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function createFallbackStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(sseEvent({ type: 'chunk', text: FALLBACK_REPLY }));
      controller.enqueue(sseEvent({ type: 'done', tokensUsed: 0, actionsExecuted: [] }));
      controller.close();
    },
  });
}

function streamResponse(stream: ReadableStream<Uint8Array>): NextResponse {
  return new NextResponse(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}

function getOpenAiBody(
  messages: OpenAIMessage[],
  includeTools: boolean,
): Record<string, unknown> {
  return {
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    max_tokens: 120,
    temperature: 0.2,
    stream: true,
    stream_options: { include_usage: true },
    messages,
    ...(includeTools ? { tools: SRE_TOOLS, tool_choice: 'auto' } : {}),
  };
}

async function openAiStream(
  response: Response,
  onText: (text: string) => void,
): Promise<OpenAIStreamResult> {
  if (!response.body) throw new Error('OpenAI returned no stream body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let pendingText = '';
  let assistantContent = '';
  let tokensUsed = 0;
  const toolCalls = new Map<number, ToolCall>();

  const flushSentence = (flushAll = false) => {
    const chunks = flushAll
      ? [pendingText]
      : pendingText.split(/(?<=[.!?,])\s+/);
    if (!flushAll) pendingText = chunks.pop() ?? '';
    else pendingText = '';
    chunks.forEach((chunk) => {
      const text = chunk.trim();
      if (text) onText(`${text} `);
    });
  };

  const processLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;

    try {
      const payload = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: unknown;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
        usage?: { total_tokens?: unknown };
      };
      if (typeof payload.usage?.total_tokens === 'number') {
        tokensUsed = payload.usage.total_tokens;
      }
      const delta = payload.choices?.[0]?.delta;
      if (typeof delta?.content === 'string') {
        assistantContent += delta.content;
        pendingText += delta.content;
        flushSentence();
      }
      delta?.tool_calls?.forEach((call) => {
        const index = call.index ?? 0;
        const existing = toolCalls.get(index) ?? { id: '', name: '', arguments: '' };
        if (call.id) existing.id = call.id;
        if (call.function?.name) existing.name += call.function.name;
        if (call.function?.arguments) existing.arguments += call.function.arguments;
        toolCalls.set(index, existing);
      });
    } catch {
      // Ignore malformed or provider-specific SSE frames.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    lineBuffer += decoder.decode(value, { stream: !done });
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    lines.forEach(processLine);
    if (done) break;
  }
  if (lineBuffer.trim()) processLine(lineBuffer);
  flushSentence(true);

  return {
    toolCalls: [...toolCalls.values()].filter((call) => call.name),
    tokensUsed,
    assistantContent,
  };
}

function toolMessages(
  assistantContent: string,
  toolCalls: ToolCall[],
  actions: SreAction[],
): OpenAIMessage[] {
  return [
    {
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    },
    ...toolCalls.map((call, index) => ({
      role: 'tool',
      tool_call_id: call.id,
      content: actions[index]?.summary ?? 'Tool execution returned no result.',
    })),
  ];
}

export async function POST(request: NextRequest) {
  let body: RespondRequest;

  try {
    body = (await request.json()) as RespondRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.transcript !== 'string' || !body.transcript.trim()) {
    return NextResponse.json(
      { error: 'transcript is required' },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const systemPrompt = assembleSystemPrompt(body);

  if (!apiKey) {
    return streamResponse(
      new ReadableStream({
        start(controller) {
          controller.enqueue(sseEvent({ type: 'chunk', text: FALLBACK_REPLY }));
          controller.enqueue(sseEvent({ type: 'done', tokensUsed: 0, actionsExecuted: [] }));
          controller.close();
        },
      }),
    );
  }

  try {
    const messages = buildMessages(body, systemPrompt) as OpenAIMessage[];
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(getOpenAiBody(messages, true)),
    });

    if (!response.ok) {
      console.error('OpenAI response failed:', response.status, await response.text());
      return streamResponse(createFallbackStream());
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emitText = (text: string) => {
          controller.enqueue(sseEvent({ type: 'chunk', text }));
        };

        try {
          const firstPass = await openAiStream(response, emitText);
          const actionsExecuted = firstPass.toolCalls.map((call) =>
            executeSreTool(call.name, call.arguments),
          );

          if (firstPass.toolCalls.length > 0) {
            const followUpMessages = [
              ...messages,
              ...toolMessages(firstPass.assistantContent, firstPass.toolCalls, actionsExecuted),
            ];
            const followUpResponse = await fetch(
              'https://api.openai.com/v1/chat/completions',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(getOpenAiBody(followUpMessages, false)),
              },
            );
            if (followUpResponse.ok) {
              const followUp = await openAiStream(followUpResponse, emitText);
              controller.enqueue(
                sseEvent({
                  type: 'done',
                  tokensUsed: firstPass.tokensUsed + followUp.tokensUsed,
                  actionsExecuted,
                }),
              );
            } else {
              emitText(actionsExecuted.map((action) => action.summary).join(' '));
              controller.enqueue(sseEvent({ type: 'done', tokensUsed: firstPass.tokensUsed, actionsExecuted }));
            }
          } else {
            controller.enqueue(
              sseEvent({ type: 'done', tokensUsed: firstPass.tokensUsed, actionsExecuted: [] }),
            );
          }
          controller.close();
        } catch (error) {
          console.error('SRE copilot stream failed:', error);
          emitText(FALLBACK_REPLY);
          controller.enqueue(sseEvent({ type: 'done', tokensUsed: 0, actionsExecuted: [] }));
          controller.close();
        }
      },
    });

    return streamResponse(stream);
  } catch (error) {
    console.error('SRE copilot request failed:', error);
    return streamResponse(createFallbackStream());
  }
}