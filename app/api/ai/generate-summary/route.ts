import { NextRequest, NextResponse } from 'next/server';
import { generateSpokenStatusBriefing, generatePostIncidentReview } from '@/lib/echoOpsEngine';
import { getOrCreateIncident, archiveIncident } from '@/lib/incidentStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      channelName?: string;
      type: 'spoken_briefing' | 'pir_report' | 'archive';
      scenario?: 'tech_outage' | 'urban_flood' | 'payment_outage';
    };

    const channelName = body.channelName || 'echoops-war-room';
    const incident = getOrCreateIncident(channelName, body.scenario);

    if (body.type === 'spoken_briefing') {
      const spokenText = generateSpokenStatusBriefing(incident);
      return NextResponse.json({
        type: 'spoken_briefing',
        spokenText,
        incidentId: incident.id,
      });
    }

    if (body.type === 'pir_report') {
      const pir = generatePostIncidentReview(incident);
      return NextResponse.json({
        type: 'pir_report',
        pir,
      });
    }

    if (body.type === 'archive') {
      const pir = generatePostIncidentReview(incident);
      const archived = archiveIncident(channelName, pir);
      return NextResponse.json({
        type: 'archived',
        incident: archived,
        pir,
      });
    }

    return NextResponse.json({ error: 'Invalid summary type requested' }, { status: 400 });
  } catch (error) {
    console.error('Error in /api/ai/generate-summary:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to generate summary' },
      { status: 500 },
    );
  }
}
