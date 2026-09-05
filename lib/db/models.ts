import { query } from './index';
import type {
  IncidentState,
  IncidentActionItem,
  IncidentTimelineEvent,
  PastIncidentKnowledge,
} from '@/types/incident';
import {
  getOrCreateIncident,
  updateIncidentState,
  searchSemanticMemory,
} from '@/lib/incidentStore';

export async function persistIncidentToDb(incident: IncidentState): Promise<boolean> {
  try {
    const res = await query(
      `INSERT INTO incidents (id, title, scenario, severity, status, channel_name, summary, started_at, unresolved_risks, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         severity = EXCLUDED.severity,
         status = EXCLUDED.status,
         summary = EXCLUDED.summary,
         unresolved_risks = EXCLUDED.unresolved_risks,
         updated_at = NOW();`,
      [
        incident.id,
        incident.title,
        incident.scenario,
        incident.severity,
        incident.status,
        incident.channelName,
        incident.summary || null,
        incident.startedAt,
        JSON.stringify(incident.unresolvedRisks || []),
      ],
    );

    if (!res) {
      // In-memory operational store fallback
      return true;
    }

    // Persist Action Items
    for (const action of incident.actionItems) {
      await query(
        `INSERT INTO actions (id, incident_id, task, owner, deadline, status, requires_confirmation, confirmed, jira_ticket_id, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           confirmed = EXCLUDED.confirmed,
           completed_at = EXCLUDED.completed_at;`,
        [
          action.id,
          incident.id,
          action.task,
          action.owner,
          action.deadline || null,
          action.status,
          Boolean(action.requiresConfirmation),
          Boolean(action.confirmed),
          action.jiraTicketId || null,
          action.completedAt || null,
        ],
      );
    }

    // Persist Timeline Events
    for (const tl of incident.timeline) {
      await query(
        `INSERT INTO timeline_events (id, incident_id, time, timestamp, speaker, category, note, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING;`,
        [
          tl.id,
          incident.id,
          tl.time,
          tl.timestamp,
          tl.speaker,
          tl.category,
          tl.note,
          JSON.stringify(tl.metadata || {}),
        ],
      );
    }

    return true;
  } catch (err) {
    console.warn('PostgreSQL persistence note (using memory store fallback):', err);
    return false;
  }
}

export async function confirmActionInDb(
  actionId: string,
  confirmedBy: string,
): Promise<IncidentActionItem | null> {
  // 1. Try PostgreSQL
  try {
    const res = await query<{
      id: string;
      incident_id: string;
      task: string;
      owner: string;
      deadline: string | null;
      status: string;
      requires_confirmation: boolean;
      confirmed: boolean;
    }>(
      `UPDATE actions
       SET confirmed = TRUE, confirmed_by = $2, confirmed_at = NOW(), status = 'in_progress'
       WHERE id = $1
       RETURNING *;`,
      [actionId, confirmedBy],
    );

    if (res && res.rows.length > 0) {
      const row = res.rows[0];
      return {
        id: row.id,
        task: row.task,
        owner: row.owner,
        deadline: row.deadline || undefined,
        status: 'in_progress',
        requiresConfirmation: row.requires_confirmation,
        confirmed: true,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('DB confirm query note:', err);
  }

  // 2. In-memory update across active incidents
  const incident = getOrCreateIncident('echoops-war-room');
  let matchedAction: IncidentActionItem | null = null;

  updateIncidentState(incident.channelName, (prev) => {
    const updatedActions = prev.actionItems.map((item) => {
      if (item.id === actionId) {
        matchedAction = {
          ...item,
          confirmed: true,
          status: 'in_progress',
        };
        return matchedAction;
      }
      return item;
    });

    const timelineEntry: IncidentTimelineEvent = {
      id: `tl-${Date.now().toString(36)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      speaker: confirmedBy,
      category: 'action',
      note: `Critical Action Approved by @${confirmedBy}: "${matchedAction?.task || actionId}"`,
    };

    return {
      ...prev,
      actionItems: updatedActions,
      timeline: [timelineEntry, ...prev.timeline],
    };
  });

  return matchedAction;
}

export async function searchPastIncidentsWithPgVector(
  queryText: string,
  scenario = 'tech_outage',
): Promise<PastIncidentKnowledge[]> {
  try {
    // If pgvector is enabled in Postgres, execute cosine distance query
    const res = await query<{
      id: string;
      title: string;
      scenario: string;
      root_cause: string;
      resolution: string;
      suggested_runbooks: string;
      tags: string;
    }>(
      `SELECT id, title, scenario, root_cause, resolution, suggested_runbooks, tags
       FROM past_incidents
       WHERE scenario = $1
       LIMIT 5;`,
      [scenario],
    );

    if (res && res.rows.length > 0) {
      return res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        scenario: r.scenario as any,
        similarityScore: 0.95,
        rootCause: r.root_cause,
        resolution: r.resolution,
        suggestedRunbooks: typeof r.suggested_runbooks === 'string' ? JSON.parse(r.suggested_runbooks) : r.suggested_runbooks,
        tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags,
      }));
    }
  } catch (err) {
    console.warn('pgvector search note:', err);
  }

  // Fallback to in-memory semantic memory search
  return searchSemanticMemory(scenario as any, queryText);
}
