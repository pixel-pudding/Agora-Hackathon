import type { IncidentState } from '@/types/incident';

export type PagerDutyIncidentResponse = {
  incidentId: string;
  status: 'triggered' | 'acknowledged' | 'resolved';
  urgency: 'high' | 'low';
  service: string;
  simulated: boolean;
  message: string;
};

export async function syncPagerDutyIncident(
  incident: IncidentState,
  action: 'trigger' | 'acknowledge' | 'resolve' = 'trigger',
): Promise<PagerDutyIncidentResponse> {
  const pdRoutingKey = process.env.PAGERDUTY_ROUTING_KEY;
  const urgency = incident.severity === 'Sev-1' ? 'high' : 'low';
  const pdIncidentId = `PD-${incident.id.slice(-6).toUpperCase()}`;

  if (pdRoutingKey) {
    try {
      const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: pdRoutingKey,
          event_action: action,
          dedup_key: incident.id,
          payload: {
            summary: `[${incident.severity}] ${incident.title} (EchoOps Commander)`,
            severity: incident.severity === 'Sev-1' ? 'critical' : 'warning',
            source: 'echoops-ai-voice-room',
            component: incident.scenario,
            custom_details: {
              channel: incident.channelName,
              facts_count: incident.facts.length,
              open_actions: incident.actionItems.filter((a) => a.status !== 'completed').length,
            },
          },
        }),
      });

      if (res.ok) {
        return {
          incidentId: pdIncidentId,
          status: action === 'resolve' ? 'resolved' : 'triggered',
          urgency,
          service: 'Core Production Incident Response',
          simulated: false,
          message: `PagerDuty incident ${action}d successfully.`,
        };
      }
    } catch (err) {
      console.warn('PagerDuty sync failed:', err);
    }
  }

  return {
    incidentId: pdIncidentId,
    status: action === 'resolve' ? 'resolved' : 'triggered',
    urgency,
    service: 'Core Production Incident Response',
    simulated: true,
    message: `[EchoOps PagerDuty] Synced ${action.toUpperCase()} state for ${incident.title} (${incident.severity}).`,
  };
}
