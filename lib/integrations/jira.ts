import type { IncidentActionItem, IncidentState } from '@/types/incident';

export type JiraTicket = {
  key: string;
  summary: string;
  description: string;
  assignee: string;
  priority: 'High' | 'Highest' | 'Medium';
  status: 'To Do' | 'In Progress' | 'Done';
  url: string;
  simulated: boolean;
};

let ticketCounter = 1042;

export async function createJiraTicketFromAction(
  action: IncidentActionItem,
  incident: IncidentState,
): Promise<JiraTicket> {
  const jiraHost = process.env.JIRA_HOST || 'https://echosphere.atlassian.net';
  const projectKey = process.env.JIRA_PROJECT_KEY || 'OPS';
  const ticketKey = `${projectKey}-${++ticketCounter}`;

  const priority = incident.severity === 'Sev-1' ? 'Highest' : incident.severity === 'Sev-2' ? 'High' : 'Medium';

  const ticket: JiraTicket = {
    key: ticketKey,
    summary: `[Incident Action] ${action.task}`,
    description: `Created automatically by EchoOps AI Incident Commander.\n\nIncident: ${incident.title} (${incident.severity})\nOwner Assigned: ${action.owner}\nDeadline: ${action.deadline || 'Immediate'}\nChannel: ${incident.channelName}`,
    assignee: action.owner,
    priority,
    status: 'To Do',
    url: `${jiraHost}/browse/${ticketKey}`,
    simulated: !process.env.JIRA_API_TOKEN,
  };

  // If real Jira credentials exist, execute REST API call
  if (process.env.JIRA_API_TOKEN && process.env.JIRA_EMAIL && process.env.JIRA_HOST) {
    try {
      const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
      const res = await fetch(`${process.env.JIRA_HOST}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: ticket.summary,
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: ticket.description }],
                },
              ],
            },
            issuetype: { name: 'Task' },
          },
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { key: string };
        ticket.key = data.key;
        ticket.url = `${jiraHost}/browse/${data.key}`;
        ticket.simulated = false;
      }
    } catch (err) {
      console.warn('Jira API dispatch failed, using ticket fallback:', err);
    }
  }

  return ticket;
}
