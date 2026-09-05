'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  IncidentState,
  IncidentFact,
  IncidentHypothesis,
  IncidentActionItem,
  IncidentConflict,
  MissingInfoGap,
  IncidentTimelineEvent,
} from '@/types/incident';

export type LiveIncidentData = {
  rawIncident: IncidentState | null;
  isLoading: boolean;
  isConnected: boolean;
  lastUpdated: string | null;
  // Normalized view models for Megha's UI cards:
  incidentHero: {
    id: string;
    title: string;
    severity: string;
    status: string;
    environment: string;
    startedAt: string;
    duration: string;
    commander: string;
    impact: string;
    slaTimeRemaining: string;
    estimatedRevenueImpact: string;
    impactedCustomers: string;
    summary: string;
  };
  timeline: Array<{
    id: string;
    time: string;
    title: string;
    description: string;
    source: string;
    type: 'alert' | 'error' | 'system' | 'warning' | 'action' | 'fact' | 'conflict';
    badge: string;
  }>;
  facts: Array<{
    id: string;
    fact: string;
    verifiedBy: string;
    timestamp: string;
    confidence: string;
  }>;
  assumptions: Array<{
    id: string;
    hypothesis: string;
    source: string;
    status: string;
    riskLevel: string;
  }>;
  actions: Array<{
    id: string;
    action: string;
    owner: {
      name: string;
      role: string;
      initials: string;
      color: string;
      bg: string;
    };
    status: 'PENDING' | 'IN PROGRESS' | 'COMPLETED';
    updatedAt: string;
    requiresConfirmation?: boolean;
  }>;
  alerts: {
    conflict: {
      type: string;
      badge: string;
      title: string;
      description: string;
      impact: string;
      time: string;
      severity: string;
    };
    gap: {
      type: string;
      badge: string;
      title: string;
      description: string;
      impact: string;
      time: string;
      severity: string;
    };
    risk: {
      type: string;
      badge: string;
      title: string;
      description: string;
      impact: string;
      time: string;
      severity: string;
    };
  };
  humanInTheLoop: {
    actionId: string;
    actionTitle: string;
    actionSub: string;
    targetCluster: string;
    consequence: string;
    requiresApprovalBy: string;
    riskLevel: string;
  };
  voiceStream: Array<{
    speaker: string;
    time: string;
    text: string;
  }>;
  // Interactive handlers:
  confirmHitlAction: (actionId?: string) => Promise<boolean>;
  updateActionStatus: (actionId: string, status: string) => Promise<boolean>;
  triggerSpeechAnalysis: (transcript: string, speakerName?: string) => Promise<void>;
  refresh: () => Promise<void>;
};

// Owner color generator for dynamic names
const OWNER_PALETTES = [
  { color: '#2563eb', bg: '#dbeafe' },
  { color: '#7c3aed', bg: '#ede9fe' },
  { color: '#d97706', bg: '#fef3c7' },
  { color: '#059669', bg: '#d1fae5' },
  { color: '#dc2626', bg: '#fee2e2' },
];

function getInitials(name?: string | null): string {
  const safeName = String(name || 'EN');
  const parts = safeName.replace(/[\(\)@]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return safeName.slice(0, 2).toUpperCase();
}

function parseOwner(rawOwner: unknown, index: number) {
  if (typeof rawOwner === 'object' && rawOwner !== null) {
    const o = rawOwner as Record<string, string>;
    const name = o.name || 'Engineer';
    return {
      name,
      role: o.role || 'SRE',
      initials: o.initials || getInitials(name),
      color: o.color || OWNER_PALETTES[index % OWNER_PALETTES.length].color,
      bg: o.bg || OWNER_PALETTES[index % OWNER_PALETTES.length].bg,
    };
  }
  const nameStr = String(rawOwner || 'Alex (SRE)');
  const palette = OWNER_PALETTES[Math.abs(nameStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % OWNER_PALETTES.length];
  return {
    name: nameStr,
    role: nameStr.toLowerCase().includes('dba') ? 'Lead DBA' : nameStr.toLowerCase().includes('lead') ? 'Incident Commander' : 'Site Reliability Eng',
    initials: getInitials(nameStr),
    color: palette.color,
    bg: palette.bg,
  };
}

export function useLiveIncident(channelName = 'echoops-war-room'): LiveIncidentData {
  const [incident, setIncident] = useState<IncidentState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Fetch initial incident state
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/state?channel=${encodeURIComponent(channelName)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as IncidentState;
        setIncident(data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('Initial incident state fetch note:', err);
    } finally {
      setIsLoading(false);
    }
  }, [channelName]);

  // Subscribe to SSE /api/events
  useEffect(() => {
    fetchState();

    const eventSource = new EventSource(`/api/events?channel=${encodeURIComponent(channelName)}`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.event === 'state.update' && parsed.data) {
          setIncident(parsed.data as IncidentState);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {}
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [channelName, fetchState]);

  // HITL Confirm handler
  const confirmHitlAction = useCallback(
    async (actionId?: string): Promise<boolean> => {
      try {
        const targetId = actionId || incident?.actionItems?.find((a) => a.requiresConfirmation)?.id || incident?.actionItems?.[0]?.id || 'action-1';
        const res = await fetch(`/api/actions/${encodeURIComponent(targetId)}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmedBy: 'Incident Commander (You)' }),
        });
        if (res.ok) {
          await fetchState();
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to confirm action:', err);
        return false;
      }
    },
    [incident, fetchState],
  );

  // Status toggle handler
  const updateActionStatus = useCallback(
    async (actionId: string, status: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/actions/${encodeURIComponent(actionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: status.toLowerCase() }),
        });
        if (res.ok) {
          await fetchState();
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to update action status:', err);
        return false;
      }
    },
    [fetchState],
  );

  // Manual speech trigger
  const triggerSpeechAnalysis = useCallback(
    async (transcript: string, speakerName = 'Speaker') => {
      if (!transcript.trim()) return;
      try {
        await fetch('/api/ai/analyze-incident', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelName,
            speakerName,
            transcript: transcript.trim(),
          }),
        });
      } catch (err) {
        console.error('Failed to trigger speech analysis:', err);
      }
    },
    [channelName],
  );

  // View Models Normalization
  const incidentHero = useMemo(() => {
    const inc = incident;
    const isFlood = inc?.scenario === 'urban_flood';
    return {
      id: inc?.id?.toUpperCase() || 'INC-8492',
      title: inc?.title || (isFlood ? 'Urban Flood Response - Sector 7' : 'Payment Service Outage - 504 Timeout Spike'),
      severity: (inc?.severity || 'HIGH').toUpperCase(),
      status: (inc?.status || 'ACTIVE').toUpperCase(),
      environment: 'Production (us-east-1)',
      startedAt: inc?.startedAt ? new Date(inc.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:31 AM',
      duration: 'Live',
      commander: 'EchoOps Voice AI Commander',
      impact: inc?.facts?.[0]?.statement || '78% Checkout Transactions Failing',
      slaTimeRemaining: '11m 38s',
      estimatedRevenueImpact: '$48,200',
      impactedCustomers: '~1,420 users',
      summary:
        inc?.summary ||
        'Real-time incident response bridge active. AI telemetry synthesis and live voice coordination in progress.',
    };
  }, [incident]);

  const timeline = useMemo(() => {
    if (!incident || !incident.timeline || incident.timeline.length === 0) {
      return [
        {
          id: 'tl-init',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          title: 'Incident Bridge Initialized',
          description: 'EchoOps Voice AI opened the incident war room and started live telemetry synthesis.',
          source: 'EchoOps AI Commander',
          type: 'system' as const,
          badge: 'WAR ROOM OPEN',
        },
      ];
    }
    return incident.timeline.map((item, idx) => {
      let type: 'alert' | 'error' | 'system' | 'warning' | 'action' | 'fact' | 'conflict' = 'system';
      let badge = 'EVENT';

      if (item.category === 'fact') {
        type = 'system';
        badge = 'VERIFIED FACT';
      } else if (item.category === 'action') {
        type = 'action';
        badge = 'ACTION ASSIGNED';
      } else if (item.category === 'conflict') {
        type = 'warning';
        badge = 'CONFLICT';
      } else if (item.category === 'decision') {
        type = 'system';
        badge = 'DECISION';
      } else if (item.category === 'status_change') {
        type = 'alert';
        badge = 'STATUS';
      }

      return {
        id: item.id || `tl-${idx}`,
        time: item.time || new Date(item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: item.note.length > 40 ? item.note.slice(0, 40) + '...' : item.note,
        description: item.note,
        source: item.speaker || 'System',
        type,
        badge,
      };
    });
  }, [incident]);

  const facts = useMemo(() => {
    if (!incident || !incident.facts || incident.facts.length === 0) {
      return [
        {
          id: 'fact-def-1',
          fact: 'Checkout endpoint /v2/checkout/process returning HTTP 504 to incoming traffic.',
          verifiedBy: 'Cloudflare Ingress Logs',
          timestamp: 'Just now',
          confidence: 'Confirmed (0.98)',
        },
      ];
    }
    return incident.facts.map((f) => ({
      id: f.id,
      fact: f.statement,
      verifiedBy: f.verifiedBy || 'Telemetry Logs',
      timestamp: f.timestamp ? new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Verified',
      confidence: f.confidence ? `${Math.round(f.confidence * 100)}% Confirmed` : 'Confirmed',
    }));
  }, [incident]);

  const assumptions = useMemo(() => {
    if (!incident || !incident.hypotheses || incident.hypotheses.length === 0) {
      return [
        {
          id: 'hyp-def-1',
          hypothesis: 'Stale worker connection locks are failing to terminate upon client timeout in v2.4.1.',
          source: 'Suggested by Voice AI from stack trace analysis',
          status: 'Unconfirmed Hypothesis',
          riskLevel: 'High',
        },
      ];
    }
    return incident.hypotheses.map((h) => ({
      id: h.id,
      hypothesis: h.statement,
      source: `Raised by ${h.raisedBy || 'Voice AI'}`,
      status: h.status === 'validated' ? 'Validated Hypothesis' : 'Unconfirmed Hypothesis',
      riskLevel: h.status === 'validated' ? 'Low' : 'High',
    }));
  }, [incident]);

  const actions = useMemo(() => {
    if (!incident || !incident.actionItems || incident.actionItems.length === 0) {
      return [
        {
          id: 'act-def-1',
          action: 'Drain incoming checkout traffic to failover standby cluster',
          owner: parseOwner('Alex Chen (SRE)', 0),
          status: 'IN PROGRESS' as const,
          updatedAt: 'Just now',
          requiresConfirmation: false,
        },
      ];
    }
    return incident.actionItems.map((act, idx) => {
      let status: 'PENDING' | 'IN PROGRESS' | 'COMPLETED' = 'IN PROGRESS';
      if (act.status === 'completed') status = 'COMPLETED';
      else if (act.status === 'pending') status = 'PENDING';
      else status = 'IN PROGRESS';

      return {
        id: act.id,
        action: act.task,
        owner: parseOwner(act.owner, idx),
        status,
        updatedAt: act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
        requiresConfirmation: act.requiresConfirmation,
      };
    });
  }, [incident]);

  const alerts = useMemo(() => {
    const conflict = incident?.conflicts?.[0];
    const gap = incident?.missingGaps?.[0];
    const risk = incident?.unresolvedRisks?.[0];

    return {
      conflict: {
        type: 'Conflict',
        badge: 'CONCURRENT ACTION CONFLICT',
        title: conflict ? 'Conflicting Operational Direction' : 'Concurrent Deployment Collision Detected',
        description: conflict?.description || 'Multiple engineers are operating on conflicting hypotheses regarding the root cause. Recommendation: Align on verified metrics.',
        impact: conflict ? `Parties involved: ${conflict.partiesInvolved.join(', ')}` : 'High risk of overwriting rollback pod states and conflicting database migrations.',
        time: conflict?.timestamp ? new Date(conflict.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
        severity: 'High',
      },
      gap: {
        type: 'Gap',
        badge: 'UNASSIGNED RESPONSIBILITY GAP',
        title: gap ? 'Missing Operational Telemetry' : 'Missing Primary Database DBA on Voice Bridge',
        description: gap?.question || 'Critical authorization needed for deep database lock inspection.',
        impact: gap ? `Impact Level: ${gap.impactLevel.toUpperCase()}` : 'Potential delay in executing manual connection pool purge command.',
        time: gap?.timestamp ? new Date(gap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
        severity: 'Medium',
      },
      risk: {
        type: 'Risk',
        badge: 'SLA & BUSINESS RISK',
        title: 'Tier-1 SLA Threshold Breach Warning',
        description: risk || 'Continued elevated gateway error rate will trigger contractual SLA breach penalties within minutes.',
        impact: 'Financial penalty risk + automated executive escalation pager.',
        time: 'Active',
        severity: 'Critical',
      },
    };
  }, [incident]);

  const humanInTheLoop = useMemo(() => {
    const criticalAction = incident?.actionItems?.find((a) => a.requiresConfirmation) || incident?.actionItems?.[0];
    return {
      actionId: criticalAction?.id || 'act-hitl-default',
      actionTitle: criticalAction ? criticalAction.task : 'Restart Payment Service Pods',
      actionSub: 'Cluster Worker Node Reset & Redis Connection Pool Flush',
      targetCluster: 'prod-us-east1-payment-worker-pool-a',
      consequence: 'Will safely terminate stuck connection pool and recycle worker pods. In-flight requests will be re-routed to standby queue with zero data loss.',
      requiresApprovalBy: 'Incident Commander (Human)',
      riskLevel: 'CRITICAL RECOVERY',
    };
  }, [incident]);

  const voiceStream = useMemo(() => {
    if (!incident || !incident.timeline) return [];
    return incident.timeline
      .filter((t) => t.category === 'fact' || t.category === 'action' || t.category === 'status_change')
      .slice(0, 5)
      .map((t) => ({
        speaker: t.speaker || 'EchoOps AI',
        time: t.time || 'Live',
        text: t.note,
      }));
  }, [incident]);

  return {
    rawIncident: incident,
    isLoading,
    isConnected,
    lastUpdated,
    incidentHero,
    timeline,
    facts,
    assumptions,
    actions,
    alerts,
    humanInTheLoop,
    voiceStream,
    confirmHitlAction,
    updateActionStatus,
    triggerSpeechAnalysis,
    refresh: fetchState,
  };
}
