import { NextRequest, NextResponse } from 'next/server';
import type { ArchivedIncident } from '@/components/IncidentHistoryDrawer';

let incidents: ArchivedIncident[] = [];

function isArchivedIncident(value: unknown): value is ArchivedIncident {
  if (!value || typeof value !== 'object') return false;
  const incident = value as Record<string, unknown>;
  return typeof incident.id === 'string' && typeof incident.title === 'string' && typeof incident.timestamp === 'string' &&
    (incident.severity === 'Sev-1' || incident.severity === 'Sev-2' || incident.severity === 'Sev-3') &&
    typeof incident.summary === 'string' && Array.isArray(incident.actionItems) && incident.actionItems.every((item) => typeof item === 'string') &&
    Array.isArray(incident.timeline) && incident.timeline.every((entry) => entry !== null && typeof entry === 'object' && typeof (entry as Record<string, unknown>).time === 'string' && typeof (entry as Record<string, unknown>).note === 'string');
}

export async function GET() {
  return NextResponse.json({ incidents });
}

export async function POST(request: NextRequest) {
  try {
    const payload: unknown = await request.json();
    if (!isArchivedIncident(payload)) return NextResponse.json({ error: 'Invalid incident payload' }, { status: 400 });
    incidents = [payload, ...incidents.filter((incident) => incident.id !== payload.id)];
    return NextResponse.json({ success: true, incident: payload });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
}