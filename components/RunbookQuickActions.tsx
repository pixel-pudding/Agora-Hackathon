'use client';

import { useState, useCallback } from 'react';
import {
  saveCurrentIncident,
  INCIDENT_STORAGE_KEY,
  type ArchivedIncident,
} from './IncidentHistoryDrawer';

export type RunbookAction = {
  id: string;
  label: string;
  commandText: string;
  confirmationSpeech: string;
  summaryNote: string;
};

export const DEFAULT_RUNBOOK_ACTIONS: RunbookAction[] = [
  {
    id: 'rollback-canary',
    label: '🔄 Rollback Canary',
    commandText: 'Rollback canary deployment and divert traffic back to stable baseline.',
    confirmationSpeech: 'Initiating canary rollback. Reverting traffic routing to the stable release.',
    summaryNote: 'Rollback Canary: deployment aborted and rolled back to stable baseline.',
  },
  {
    id: 'scale-service',
    label: '📈 Scale Service (+3 Pods)',
    commandText: 'Scale the affected service deployment by adding 3 pods to relieve traffic pressure.',
    confirmationSpeech: 'Scaling service deployment up by 3 replicas to alleviate traffic pressure.',
    summaryNote: 'Scale Service: added +3 pod replicas to deployment.',
  },
  {
    id: 'flush-cache',
    label: '🧹 Flush Session Cache',
    commandText: 'Flush session cache and purge stale Redis keys for the service.',
    confirmationSpeech: 'Flushing distributed session cache and clearing invalidated keys.',
    summaryNote: 'Flush Session Cache: purged stale cache keys and reconnected cluster.',
  },
  {
    id: 'generate-postmortem',
    label: '📋 Generate Post-Mortem',
    commandText: 'Generate post-mortem incident report and timeline summary.',
    confirmationSpeech: 'Compiling incident post-mortem draft, timeline, and action items.',
    summaryNote: 'Generate Post-Mortem: compiled draft timeline and incident summary.',
  },
];

export interface RunbookQuickActionsProps {
  onExecuteCommand?: (command: string) => Promise<void> | void;
  channel?: string;
  disabled?: boolean;
}

export function RunbookQuickActions({
  onExecuteCommand,
  channel = 'echoops-room',
  disabled = false,
}: RunbookQuickActionsProps) {
  const [executingId, setExecutingId] = useState<string | null>(null);

  const handleActionClick = useCallback(
    async (action: RunbookAction) => {
      if (executingId || disabled) return;

      setExecutingId(action.id);

      try {
        // 1. Dispatch command into the AI respond / speech pipeline
        if (onExecuteCommand) {
          await onExecuteCommand(action.commandText);
        }

        // 2. Trigger bot speech confirmation via /api/bot/speak
        void fetch('/api/bot/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: action.confirmationSpeech,
            priority: 'high',
            channel,
          }),
        }).catch((err) => {
          console.warn('Bot speech confirmation failed:', err);
        });

        // 3. Update active incident timeline in incident archive
        const now = new Date();
        const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;
        const incidentDate = now.toISOString();
        const incidentId = `inc-${channel}-${now.toISOString().slice(0, 10)}`;

        let existingIncidents: ArchivedIncident[] = [];
        try {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(INCIDENT_STORAGE_KEY) : null;
          existingIncidents = raw ? JSON.parse(raw) : [];
        } catch {
          existingIncidents = [];
        }

        const activeIndex = existingIncidents.findIndex((item) => item.id === incidentId);
        const timelineEntry = { time: timeStr, note: action.summaryNote };

        if (activeIndex >= 0) {
          const updated = { ...existingIncidents[activeIndex] };
          updated.timeline = [...(updated.timeline || []), timelineEntry];
          updated.actionItems = Array.from(
            new Set([...(updated.actionItems || []), action.summaryNote]),
          );
          saveCurrentIncident(updated);
        } else {
          const newIncident: ArchivedIncident = {
            id: incidentId,
            title: `Active Outage — ${channel}`,
            timestamp: incidentDate,
            severity: 'Sev-2',
            summary: `Automated SRE mitigation in progress. Triggered: ${action.label}.`,
            actionItems: [action.summaryNote],
            timeline: [
              { time: timeStr, note: `Incident mitigation initiated: ${action.summaryNote}` },
            ],
          };
          saveCurrentIncident(newIncident);
        }

        window.dispatchEvent(
          new CustomEvent('echoops:incident-timeline-updated', {
            detail: { actionId: action.id, note: action.summaryNote, timestamp: timeStr },
          }),
        );
      } catch (error) {
        console.error('Failed to execute quick action:', error);
      } finally {
        // Keep loading state visible for at least 800ms for positive tactile feedback
        setTimeout(() => {
          setExecutingId(null);
        }, 800);
      }
    },
    [channel, disabled, executingId, onExecuteCommand],
  );

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2 py-2 px-1"
      role="toolbar"
      aria-label="SRE Runbook Quick Actions"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 select-none">
        Quick Actions:
      </span>
      {DEFAULT_RUNBOOK_ACTIONS.map((action) => {
        const isExecuting = executingId === action.id;

        return (
          <button
            key={action.id}
            type="button"
            onClick={() => handleActionClick(action)}
            disabled={disabled || executingId !== null}
            aria-busy={isExecuting}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            {isExecuting ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping mr-0.5" />
                <span>Executing...</span>
              </>
            ) : (
              <span>{action.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default RunbookQuickActions;
