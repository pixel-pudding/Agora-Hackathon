import { NextRequest, NextResponse } from 'next/server';
import { enqueueSpeak, getSession } from '@/lib/agentSessions';

type SpeakRequest = {
  text: string;
  priority?: 'high' | 'normal' | 'low';
  channel: string;
};

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SpeakRequest;
    if (!body || typeof body.text !== 'string' || !body.channel) {
      return NextResponse.json({ error: 'text and channel are required' }, { status: 400 });
    }

    // If we have an active session we could attempt a direct injection here.
    const sess = getSession(body.channel);
    if (sess && sess.session) {
      // SDK-specific injection is not implemented in this quick handoff.
      // Instead, enqueue the speak request so it is discoverable by the running server.
      enqueueSpeak({ text: body.text, priority: body.priority, channel: body.channel });
      return NextResponse.json({ queued: true, via: 'in-memory-queue', channel: body.channel });
    }

    // No active session: enqueue so the request is not lost and return a mock-ok.
    enqueueSpeak({ text: body.text, priority: body.priority, channel: body.channel });
    return NextResponse.json({ queued: true, via: 'in-memory-queue', channel: body.channel });
  } catch (error) {
    console.error('Error in /api/bot/speak:', error);
    return NextResponse.json({ error: (error as Error).message ?? 'unknown' }, { status: 500 });
  }
}
