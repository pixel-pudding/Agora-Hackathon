import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateIncident, logIntegrationAction } from '@/lib/incidentStore';
import { sendSlackIncidentAlert, sendSlackActionItem, sendSlackPIRSummary } from '@/lib/integrations/slack';
import { createJiraTicketFromAction } from '@/lib/integrations/jira';
import { syncPagerDutyIncident } from '@/lib/integrations/pagerduty';
import type { IncidentActionItem, PostIncidentReview } from '@/types/incident';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      channelName?: string;
      tool: 'slack' | 'jira' | 'pagerduty';
      action: string;
      payload?: {
        message?: string;
        actionItem?: IncidentActionItem;
        pir?: PostIncidentReview;
        pdAction?: 'trigger' | 'acknowledge' | 'resolve';
      };
      confirmed?: boolean; // Human-in-the-loop confirmation
    };

    const channelName = body.channelName || 'echoops-war-room';
    const incident = getOrCreateIncident(channelName);

    // Human confirmation guard for destructive or critical actions
    if (body.action.includes('critical') && !body.confirmed) {
      logIntegrationAction(channelName, {
        tool: body.tool,
        action: body.action,
        status: 'pending_confirmation',
        details: 'Action requires explicit human commander confirmation before execution.',
      });
      return NextResponse.json({
        status: 'pending_confirmation',
        message: 'Human confirmation required for this critical operational action.',
      });
    }

    if (body.tool === 'slack') {
      let result;
      if (body.action === 'alert') {
        result = await sendSlackIncidentAlert(incident, body.payload?.message);
      } else if (body.action === 'action_item' && body.payload?.actionItem) {
        result = await sendSlackActionItem(body.payload.actionItem, incident.title);
      } else if (body.action === 'pir' && body.payload?.pir) {
        result = await sendSlackPIRSummary(body.payload.pir);
      } else {
        result = await sendSlackIncidentAlert(incident);
      }

      logIntegrationAction(channelName, {
        tool: 'slack',
        action: body.action,
        status: result.success ? 'success' : 'failed',
        details: result.text,
      });

      return NextResponse.json({ success: true, result });
    }

    if (body.tool === 'jira') {
      if (!body.payload?.actionItem) {
        return NextResponse.json({ error: 'actionItem required for Jira ticket creation' }, { status: 400 });
      }
      const ticket = await createJiraTicketFromAction(body.payload.actionItem, incident);
      logIntegrationAction(channelName, {
        tool: 'jira',
        action: 'create_ticket',
        status: 'success',
        details: `Created Jira issue ${ticket.key}: ${ticket.summary}`,
      });
      return NextResponse.json({ success: true, ticket });
    }

    if (body.tool === 'pagerduty') {
      const pdAction = body.payload?.pdAction || 'trigger';
      const response = await syncPagerDutyIncident(incident, pdAction);
      logIntegrationAction(channelName, {
        tool: 'pagerduty',
        action: `sync_${pdAction}`,
        status: 'success',
        details: response.message,
      });
      return NextResponse.json({ success: true, response });
    }

    return NextResponse.json({ error: 'Unsupported integration tool' }, { status: 400 });
  } catch (error) {
    console.error('Error in /api/integrations:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Integration dispatch failed' },
      { status: 500 },
    );
  }
}
