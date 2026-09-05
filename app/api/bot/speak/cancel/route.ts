import { NextRequest, NextResponse } from 'next/server';
import { cancelSpeak } from '@/lib/agentSessions';

type CancelSpeakRequest = {
  channel?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CancelSpeakRequest;
    if (typeof body.channel !== 'string' || !body.channel.trim()) {
      return NextResponse.json({ error: 'channel is required' }, { status: 400 });
    }

    const result = cancelSpeak(body.channel.trim());
    return NextResponse.json({ cancelled: true, ...result });
  } catch (error) {
    console.error('Error in /api/bot/speak/cancel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}