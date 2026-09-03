// Simple in-memory registry for agent sessions keyed by channel name.
// This registry lives in module scope so sessions can be discovered by
// other API routes during development. It intentionally uses `any` for
// SDK session types to avoid coupling to internal SDK shapes.

type SpeakPayload = {
  text: string;
  priority?: 'high' | 'normal' | 'low';
  channel: string;
};

type StoredSession = {
  channel: string;
  agentId?: string;
  // Session objects are stored and passed through without SDK-specific coupling.
  session?: unknown;
  queue: SpeakPayload[];
};

const sessions = new Map<string, StoredSession>();

export function registerSession(channel: string, session: unknown, agentId?: string) {
  const s: StoredSession = sessions.get(channel) ?? { channel, queue: [] };
  s.session = session;
  if (agentId) s.agentId = agentId;
  sessions.set(channel, s);
}

export function getSession(channel: string): StoredSession | undefined {
  return sessions.get(channel);
}

export function enqueueSpeak(payload: SpeakPayload) {
  const { channel } = payload;
  const s = sessions.get(channel) ?? { channel, queue: [] };
  s.queue.push(payload);
  sessions.set(channel, s);
  // For now, we only log. A future enhancement can drain the queue
  // by invoking SDK methods to inject TTS into the RTC channel.
  console.log(`[agentSessions] enqueued speak for channel=${channel} priority=${payload.priority ?? 'normal'} text="${payload.text}"`);
}

export function drainQueue(channel: string) {
  const s = sessions.get(channel);
  if (!s) return [] as SpeakPayload[];
  const q = s.queue.splice(0, s.queue.length);
  return q;
}
