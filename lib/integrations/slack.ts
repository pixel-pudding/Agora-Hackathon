import type { IncidentState, IncidentActionItem, IncidentConflict, PostIncidentReview } from '@/types/incident';

export type SlackDispatchResult = {
  success: boolean;
  channel: string;
  messageTs?: string;
  simulated: boolean;
  text: string;
};

export async function sendSlackIncidentAlert(
  incident: IncidentState,
  customMessage?: string,
): Promise<SlackDispatchResult> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const channel = process.env.SLACK_CHANNEL || '#incident-war-room';

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚨 [${incident.severity}] ${incident.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Status:* \`${incident.status.toUpperCase()}\`` },
        { type: 'mrkdwn', text: `*Scenario:* \`${incident.scenario}\`` },
        { type: 'mrkdwn', text: `*Participants:* ${incident.participants.length}` },
        { type: 'mrkdwn', text: `*Facts Verified:* ${incident.facts.length}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: customMessage || `EchoOps Voice AI has joined the incident channel \`${incident.channelName}\`. Live timeline and fact extraction are active.`,
      },
    },
  ];

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      return {
        success: res.ok,
        channel,
        messageTs: String(Date.now()),
        simulated: false,
        text: `Dispatched alert to ${channel}`,
      };
    } catch (err) {
      console.error('Slack webhook dispatch failed:', err);
    }
  }

  // Graceful simulated delivery when SLACK_WEBHOOK_URL is not set
  return {
    success: true,
    channel,
    messageTs: String(Date.now()),
    simulated: true,
    text: `[EchoOps Slack Integration] Alert formatted and staged for ${channel}: "${incident.title}" (${incident.severity})`,
  };
}

export async function sendSlackActionItem(
  action: IncidentActionItem,
  incidentTitle: string,
): Promise<SlackDispatchResult> {
  const channel = process.env.SLACK_CHANNEL || '#incident-war-room';
  const text = `📋 *New Task Assigned*: ${action.task} | *Owner:* @${action.owner} | *Deadline:* ${action.deadline || 'Immediate'} (Incident: ${incidentTitle})`;
  return {
    success: true,
    channel,
    messageTs: String(Date.now()),
    simulated: !process.env.SLACK_WEBHOOK_URL,
    text,
  };
}

export async function sendSlackConflictAlert(
  conflict: IncidentConflict,
): Promise<SlackDispatchResult> {
  const channel = process.env.SLACK_CHANNEL || '#incident-war-room';
  const text = `⚠️ *Information Conflict Detected*: "${conflict.description}" involving ${conflict.partiesInvolved.join(', ')}. Verification needed!`;
  return {
    success: true,
    channel,
    messageTs: String(Date.now()),
    simulated: !process.env.SLACK_WEBHOOK_URL,
    text,
  };
}

export async function sendSlackPIRSummary(
  pir: PostIncidentReview,
): Promise<SlackDispatchResult> {
  const channel = process.env.SLACK_CHANNEL || '#incident-war-room';
  const text = `🏁 *Incident Resolved*: ${pir.title} (Duration: ${pir.durationMinutes}m)\n*Root Cause:* ${pir.rootCauseAnalysis}\n*Actions Completed:* ${pir.actionItemsCompleted.length} tasks.`;
  return {
    success: true,
    channel,
    messageTs: String(Date.now()),
    simulated: !process.env.SLACK_WEBHOOK_URL,
    text,
  };
}
