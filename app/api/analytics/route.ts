import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAnalytics, updateAgentLatency } from '@/lib/agoraAnalytics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelName = searchParams.get('channel') || 'echoops-war-room';
  const analytics = getOrCreateAnalytics(channelName);
  return NextResponse.json(analytics);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      channelName?: string;
      metrics?: {
        stt?: number;
        llm?: number;
        tts?: number;
      };
    };

    const channelName = body.channelName || 'echoops-war-room';
    const updated = updateAgentLatency(channelName, body.metrics || {});
    return NextResponse.json({ success: true, analytics: updated });
  } catch (error) {
    console.error('Error in /api/analytics POST:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to update analytics' },
      { status: 500 },
    );
  }
}
