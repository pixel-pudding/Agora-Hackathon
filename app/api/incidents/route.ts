import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateIncident,
  getAllArchivedIncidents,
  searchSemanticMemory,
  updateIncidentState,
  addFactToIncident,
  addActionItemToIncident,
} from '@/lib/incidentStore';
import type { IncidentScenario, IncidentSeverity, IncidentStatus } from '@/types/incident';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel') || 'echoops-war-room';
  const scenario = (searchParams.get('scenario') as IncidentScenario) || 'tech_outage';
  const query = searchParams.get('q') || '';

  const activeIncident = getOrCreateIncident(channel, scenario);
  const archivedIncidents = getAllArchivedIncidents();
  const pastKnowledge = searchSemanticMemory(scenario, query);

  return NextResponse.json({
    activeIncident,
    archivedIncidents,
    pastKnowledge,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const channel = body.channel || 'echoops-war-room';

    if (body.action === 'reset_scenario') {
      const scenario = (body.scenario as IncidentScenario) || 'tech_outage';
      // Force recreate default incident for scenario
      const freshIncident = getOrCreateIncident(channel, scenario);
      freshIncident.scenario = scenario;
      return NextResponse.json({ success: true, incident: freshIncident });
    }

    if (body.action === 'add_fact') {
      const fact = addFactToIncident(channel, {
        statement: body.statement,
        verifiedBy: body.verifiedBy || 'Commander',
        confidence: body.confidence || 1.0,
      });
      return NextResponse.json({ success: true, fact });
    }

    if (body.action === 'add_action') {
      const actionItem = addActionItemToIncident(channel, {
        task: body.task,
        owner: body.owner || 'Unassigned',
        status: 'pending',
        deadline: body.deadline,
        requiresConfirmation: body.requiresConfirmation,
      });
      return NextResponse.json({ success: true, actionItem });
    }

    if (body.action === 'update_status') {
      const updated = updateIncidentState(channel, (prev) => ({
        ...prev,
        status: (body.status as IncidentStatus) || prev.status,
        severity: (body.severity as IncidentSeverity) || prev.severity,
      }));
      return NextResponse.json({ success: true, incident: updated });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('Error in /api/incidents POST:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}