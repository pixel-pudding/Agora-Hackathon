import { NextRequest, NextResponse } from 'next/server';
import { processConversationTurn } from '@/lib/echoOpsEngine';
import { getOrCreateIncident } from '@/lib/incidentStore';
import { persistIncidentToDb } from '@/lib/db/models';
import { wsHub } from '@/lib/wsHub';

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

    // 1. Broadcast real-time SSE state update to all dashboard and voice clients
    wsHub.broadcastStateUpdate(incident);

    if (analysis.actionsExtracted.length > 0) {
      const firstAction = incident.actionItems[0];
      if (firstAction) {
        wsHub.broadcastActionAssigned(firstAction, incident.title);
      }
    }

    if (analysis.conflictsDetected.length > 0) {
      const firstConflict = incident.conflicts[0];
      if (firstConflict) {
        wsHub.broadcastConflictRaised(firstConflict);
      }
    }

    // 2. Persist turn and updated incident graph to PostgreSQL (with memory fallback)
    persistIncidentToDb(incident).catch((err) =>
      console.warn('PostgreSQL persistence note:', err),
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
