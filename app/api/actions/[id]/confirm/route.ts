import { NextRequest, NextResponse } from 'next/server';
import { confirmActionInDb } from '@/lib/db/models';
import { wsHub } from '@/lib/wsHub';
import { getOrCreateIncident } from '@/lib/incidentStore';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      confirmedBy?: string;
      reason?: string;
    };

    const confirmedBy = body.confirmedBy || 'Incident Commander';
    const updatedAction = await confirmActionInDb(id, confirmedBy);

    if (!updatedAction) {
      return NextResponse.json({ error: `Action item with ID "${id}" not found` }, { status: 404 });
    }

    const currentIncident = getOrCreateIncident('echoops-war-room');

    // Broadcast state update and action assignment over WebSocket
    wsHub.broadcastActionAssigned(updatedAction, currentIncident.title);
    wsHub.broadcastStateUpdate(currentIncident);

    return NextResponse.json({
      success: true,
      message: `Action "${updatedAction.task}" approved by ${confirmedBy}. Gating released.`,
      action: updatedAction,
      incident: currentIncident,
    });
  } catch (error) {
    console.error('Error in /actions/{id}/confirm:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to confirm action' },
      { status: 500 },
    );
  }
}
