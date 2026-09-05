import type {
  IncidentState,
  IncidentFact,
  IncidentHypothesis,
  IncidentActionItem,
  IncidentConflict,
  MissingInfoGap,
  PostIncidentReview,
} from '@/types/incident';
import {
  addFactToIncident,
  addActionItemToIncident,
  addConflictToIncident,
  addGapToIncident,
  updateIncidentState,
} from './incidentStore';

export type AnalysisResult = {
  factsExtracted: Omit<IncidentFact, 'id' | 'timestamp'>[];
  hypothesesExtracted: Omit<IncidentHypothesis, 'id' | 'timestamp'>[];
  actionsExtracted: Omit<IncidentActionItem, 'id' | 'timestamp'>[];
  conflictsDetected: Omit<IncidentConflict, 'id' | 'timestamp'>[];
  gapsIdentified: Omit<MissingInfoGap, 'id' | 'timestamp'>[];
  spokenSummaryPrompt?: string;
  shouldSpeak: boolean;
};

// Heuristic + pattern recognition for fast zero-latency real-time parsing
export function analyzeTranscriptSnippet(
  transcript: string,
  speakerName: string,
  incident: IncidentState,
): AnalysisResult {
  const result: AnalysisResult = {
    factsExtracted: [],
    hypothesesExtracted: [],
    actionsExtracted: [],
    conflictsDetected: [],
    gapsIdentified: [],
    shouldSpeak: false,
  };

  const text = transcript.trim();
  if (!text) return result;

  const lower = text.toLowerCase();

  // 1. Fact Detection (Contains concrete metrics, verified statuses, measurements)
  const isFactPattern =
    /(?:confirmed|verified|logs show|telemetry shows|is now|reached|measured at|error rate is|status is|down at|blocked at)\b/i.test(
      lower,
    ) ||
    /\b\d+(?:\.\d+)?(?:%|ms|s|m|meters|req\/s|rps|replicas|errors)\b/i.test(lower);

  if (isFactPattern) {
    result.factsExtracted.push({
      statement: text,
      verifiedBy: speakerName,
      confidence: 0.95,
      sourceSpeaker: speakerName,
    });
  }

  // 2. Hypothesis / Assumption Detection (Contains speculation words)
  const isHypothesisPattern =
    /(?:maybe|could be|suspect|assuming|probably|might be|i think|guess|seems like|assumption)\b/i.test(
      lower,
    );

  if (isHypothesisPattern) {
    result.hypothesesExtracted.push({
      statement: text,
      raisedBy: speakerName,
      status: 'unverified',
    });
  }

  // 3. Action Item / Task Ownership Assignment
  const actionMatch = lower.match(
    /(?:need to|action item|task:|assign|let me|please|will|i will|you take|take over)\s+(.+)/i,
  );
  if (actionMatch) {
    // Attempt to infer owner from speech
    let owner = speakerName;
    if (/let me|i will|i'll/i.test(lower)) {
      owner = speakerName;
    } else if (/@?([a-zA-Z]+)\s+(?:please|take|check|verify|run)/i.test(text)) {
      const match = text.match(/@?([a-zA-Z]+)\s+(?:please|take|check|verify|run)/i);
      if (match) owner = match[1];
    }

    result.actionsExtracted.push({
      task: text.replace(/^(task:|action item:|action:)\s*/i, ''),
      owner,
      status: 'in_progress',
      requiresConfirmation: /(?:rollback|drain|restart|cutover|shift traffic|evacuate)/i.test(lower),
    });
  }

  // 4. Conflict / Contradiction Detection
  // Check against existing facts/hypotheses in current incident
  for (const existingFact of incident.facts) {
    const efLower = existingFact.statement.toLowerCase();
    // Example: blocked vs open/clear
    if (
      (lower.includes('blocked') && efLower.includes('clear')) ||
      (lower.includes('clear') && efLower.includes('blocked')) ||
      (lower.includes('healthy') && efLower.includes('outage'))
    ) {
      result.conflictsDetected.push({
        description: `Contradiction detected on status: "${text}" vs existing verified fact "${existingFact.statement}"`,
        partiesInvolved: [existingFact.verifiedBy, speakerName],
        conflictingStatements: [existingFact.statement, text],
        status: 'open',
      });
      result.shouldSpeak = true;
      result.spokenSummaryPrompt = `Attention team: I detected a conflict between ${existingFact.verifiedBy}'s report and ${speakerName}'s update. Let's verify this fact before acting.`;
    }
  }

  // 5. Missing Info Gap Identification
  if (/(?:unknown|not sure|no idea|missing|unconfirmed|haven't checked)\b/i.test(lower)) {
    result.gapsIdentified.push({
      question: `Clarification needed on: "${text}"`,
      impactLevel: 'medium',
      status: 'open',
    });
  }

  return result;
}

// Ingest and apply extracted intelligence to the operational incident store
export async function processConversationTurn(
  channelName: string,
  speakerName: string,
  transcript: string,
): Promise<{
  incident: IncidentState;
  analysis: AnalysisResult;
}> {
  const incident = updateIncidentState(channelName, (prev) => {
    // Add timeline entry for the turn
    return {
      ...prev,
      timeline: [
        {
          id: `tl-${Date.now().toString(36)}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now(),
          speaker: speakerName,
          category: 'fact',
          note: `${speakerName}: "${transcript}"`,
        },
        ...prev.timeline,
      ],
    };
  });

  const analysis = analyzeTranscriptSnippet(transcript, speakerName, incident);

  // Commit extracted entities to store
  for (const fact of analysis.factsExtracted) {
    addFactToIncident(channelName, fact);
  }
  for (const action of analysis.actionsExtracted) {
    addActionItemToIncident(channelName, action);
  }
  for (const conf of analysis.conflictsDetected) {
    addConflictToIncident(channelName, conf);
  }
  for (const gap of analysis.gapsIdentified) {
    addGapToIncident(channelName, gap);
  }

  const updatedIncident = updateIncidentState(channelName, (prev) => {
    if (analysis.hypothesesExtracted.length > 0) {
      const newHyps = analysis.hypothesesExtracted.map((h) => ({
        ...h,
        id: `hyp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
      }));
      return {
        ...prev,
        hypotheses: [...newHyps, ...prev.hypotheses],
      };
    }
    return prev;
  });

  return { incident: updatedIncident, analysis };
}

// Generates concise spoken briefing for the voice room (strictly 1-3 sentences)
export function generateSpokenStatusBriefing(incident: IncidentState): string {
  const verifiedFactsCount = incident.facts.length;
  const pendingActions = incident.actionItems.filter((a) => a.status !== 'completed');
  const openConflicts = incident.conflicts.filter((c) => c.status === 'open');

  if (openConflicts.length > 0) {
    return `EchoOps alert: We have an unresolved conflict regarding "${openConflicts[0].description}". Please confirm before proceeding.`;
  }

  if (pendingActions.length > 0) {
    const topAction = pendingActions[0];
    return `Status update: We have ${verifiedFactsCount} verified facts. Current priority is for ${topAction.owner} to ${topAction.task}.`;
  }

  return `EchoOps standing by: ${incident.title} is at severity ${incident.severity}. ${verifiedFactsCount} facts verified with no blocking conflicts.`;
}

// Generates post-incident review (PIR) report
export function generatePostIncidentReview(incident: IncidentState): PostIncidentReview {
  const start = new Date(incident.startedAt).getTime();
  const now = Date.now();
  const durationMinutes = Math.max(1, Math.round((now - start) / (1000 * 60)));

  return {
    incidentId: incident.id,
    title: incident.title,
    severity: incident.severity,
    durationMinutes,
    executiveSummary: `Incident "${incident.title}" resolved in ${durationMinutes} minutes. The team established ${incident.facts.length} verified facts and completed ${incident.actionItems.filter((a) => a.status === 'completed').length} remedial actions.`,
    rootCauseAnalysis:
      incident.hypotheses.find((h) => h.status === 'validated')?.statement ||
      incident.facts[0]?.statement ||
      'Root cause under retrospective verification.',
    timeline: incident.timeline.slice(0, 10).map((t) => ({ time: t.time, event: t.note })),
    keyDecisions: incident.decisions.map((d) => `${d.decision} (by ${d.decidedBy})`),
    factsIdentified: incident.facts.map((f) => f.statement),
    actionItemsCompleted: incident.actionItems.map((a) => `${a.task} [Owner: ${a.owner}, Status: ${a.status}]`),
    unresolvedRisks: incident.unresolvedRisks,
    preventativeMeasures: [
      'Automate canary rollback triggers on error rate thresholds.',
      'Implement real-time health checks on external dependency timeouts.',
      'Refine runbook procedures for fast failover routing.',
    ],
    generatedAt: new Date().toISOString(),
  };
}
