import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateIncident, updateIncidentState } from '@/lib/incidentStore';
import { wsHub } from '@/lib/wsHub';
import type { ActionItemStatus } from '@/types/incident';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const incident = getOrCreateIncident('echoops-war-room');
  const action = incident.actionItems.find((a) => a.id === id);

  if (!action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }

  return NextResponse.json(action);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await req.json();

    let updatedAction;
    const incident = updateIncidentState('echoops-war-room', (prev) => {
      const actions = prev.actionItems.map((item) => {
        if (item.id === id) {
          updatedAction = {
            ...item,
            status: (body.status as ActionItemStatus) || item.status,
            owner: body.owner || item.owner,
            deadline: body.deadline !== undefined ? body.deadline : item.deadline,
            completedAt: body.status === 'completed' ? new Date().toISOString() : item.completedAt,
          };
          return updatedAction;
        }
        return item;
      });
      return { ...prev, actionItems: actions };
    });

    if (!updatedAction) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    wsHub.broadcastActionAssigned(updatedAction, incident.title);
    wsHub.broadcastStateUpdate(incident);

    return NextResponse.json({ success: true, action: updatedAction });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
