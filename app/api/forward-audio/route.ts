import { NextRequest, NextResponse } from 'next/server';
import { forwardToAditi } from '@/lib/audio-forwarder';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    // Basic validation
    if (!payload) {
      return NextResponse.json({ error: 'missing payload' }, { status: 400 });
    }

    const result = await forwardToAditi(payload);
    return NextResponse.json({ forwarded: result });
  } catch (error) {
    console.error('Error in /api/forward-audio:', error);
    return NextResponse.json({ error: (error as Error).message ?? 'unknown' }, { status: 500 });
  }
}
