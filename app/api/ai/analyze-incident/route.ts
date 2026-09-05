import { NextRequest, NextResponse } from 'next/server';
import { processConversationTurn } from '@/lib/echoOpsEngine';
import { getOrCreateIncident } from '@/lib/incidentStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      channelName?: string;
      speakerName?: string;
      transcript?: string;
      scenario?: 'tech_outage' | 'urban_flood' | 'payment_outage';
    };

    const channelName = body.channelName || 'echoops-war-room';
    const speakerName = body.speakerName || 'Speaker';
    const transcript = body.transcript || '';

    if (!transcript.trim()) {
      const incident = getOrCreateIncident(channelName, body.scenario);
      return NextResponse.json({ incident, analysis: null });
    }

    const { incident, analysis } = await processConversationTurn(
      channelName,
      speakerName,
      transcript,
    );

    return NextResponse.json({
      success: true,
      incident,
      analysis,
    });
  } catch (error) {
    console.error('Error in /api/ai/analyze-incident:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to analyze conversation turn' },
      { status: 500 },
    );
  }
}
