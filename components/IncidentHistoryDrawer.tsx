'use client';

import { useEffect, useState } from 'react';
import { Archive, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ArchivedIncident {
  id: string;
  title: string;
  timestamp: string;
  severity: 'Sev-1' | 'Sev-2' | 'Sev-3';
  summary: string;
  actionItems: string[];
  timeline: { time: string; note: string }[];
}

export const INCIDENT_STORAGE_KEY = 'echoops_saved_incidents';

const seedIncidents: ArchivedIncident[] = [
  {
    id: 'inc-2026-09-02-api-latency',
    title: 'API latency spike in checkout',
    timestamp: '2026-09-02T14:20:00.000Z',
    severity: 'Sev-2',
    summary: 'Checkout API p95 latency rose above the alert threshold after a database connection pool reached capacity.',
    actionItems: ['Increase pool monitoring coverage', 'Load test the checkout read path'],
    timeline: [
      { time: '14:20 UTC', note: 'Latency alert fired for checkout API.' },
      { time: '14:28 UTC', note: 'Database pool saturation identified as the primary cause.' },
      { time: '14:42 UTC', note: 'Traffic normalized after the pool was resized.' },
    ],
  },
  {
    id: 'inc-2026-08-28-worker-restarts',
    title: 'Background worker restart loop',
    timestamp: '2026-08-28T09:10:00.000Z',
    severity: 'Sev-3',
    summary: 'A malformed queue message caused one worker group to restart repeatedly until the message was quarantined.',
    actionItems: ['Add malformed-message quarantine metrics'],
    timeline: [
      { time: '09:10 UTC', note: 'Worker restart rate exceeded the normal baseline.' },
      { time: '09:18 UTC', note: 'The malformed queue message was isolated.' },
    ],
  },
];

function isArchivedIncident(value: unknown): value is ArchivedIncident {
  if (!value || typeof value !== 'object') return false;
  const incident = value as Record<string, unknown>;
  return (
    typeof incident.id === 'string' &&
    typeof incident.title === 'string' &&
    typeof incident.timestamp === 'string' &&
    (incident.severity === 'Sev-1' || incident.severity === 'Sev-2' || incident.severity === 'Sev-3') &&
    typeof incident.summary === 'string' &&
    Array.isArray(incident.actionItems) &&
    incident.actionItems.every((item) => typeof item === 'string') &&
    Array.isArray(incident.timeline) &&
    incident.timeline.every((entry) => (
      entry !== null &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).time === 'string' &&
      typeof (entry as Record<string, unknown>).note === 'string'
    ))
  );
}

function readArchivedIncidents(): ArchivedIncident[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(INCIDENT_STORAGE_KEY) ?? 'null');
    return Array.isArray(parsed) ? parsed.filter(isArchivedIncident) : [];
  } catch {
    return [];
  }
}

function ensureSeedIncidents(): ArchivedIncident[] {
  const saved = readArchivedIncidents();
  if (saved.length > 0) return saved;
  window.localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(seedIncidents));
  return seedIncidents;
}

export function saveCurrentIncident(incident: ArchivedIncident): void {
  if (typeof window === 'undefined') return;
  const incidents = readArchivedIncidents().filter((item) => item.id !== incident.id);
  window.localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify([incident, ...incidents]));
}

function exportPostMortem(incident: ArchivedIncident): void {
  const markdown = [
    `# ${incident.title}`,
    '',
    `- **Date:** ${incident.timestamp}`,
    `- **Severity:** ${incident.severity}`,
    '',
    '## Summary',
    incident.summary,
    '',
    '## Timeline',
    ...incident.timeline.map((entry) => `- **${entry.time}** ${entry.note}`),
    '',
    '## Action Items',
    ...(incident.actionItems.length > 0 ? incident.actionItems.map((item) => `- [ ] ${item}`) : ['- [ ] None recorded']),
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${incident.id}-post-mortem.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type IncidentHistoryDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function IncidentHistoryDrawer({ isOpen, onClose }: IncidentHistoryDrawerProps) {
  const [incidents, setIncidents] = useState<ArchivedIncident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<ArchivedIncident | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIncidents(ensureSeedIncidents());
      setSelectedIncident(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="incident-archive-title">
      <button className="absolute inset-0 cursor-default bg-black/50" onClick={onClose} aria-label="Close incident archive" />
      <aside className="relative flex h-full w-full max-w-3xl flex-col border-l border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <Archive className="h-5 w-5 text-emerald-500" />
            <div>
              <h2 id="incident-archive-title" className="font-semibold">Incident Archive</h2>
              <p className="text-xs text-slate-400">Local archive pending database sync</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close incident archive" title="Close"><X /></Button>
        </header>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.4fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-700 p-4 md:border-b-0 md:border-r">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Saved incidents</h3>
            <div className="space-y-2">
              {incidents.map((incident) => (
                <button
                  key={incident.id}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${selectedIncident?.id === incident.id ? 'border-emerald-500 bg-slate-800' : 'border-slate-700 hover:border-emerald-500/60 hover:bg-slate-800'}`}
                  onClick={() => setSelectedIncident(incident)}
                >
                  <span className="block text-sm font-semibold">{incident.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{incident.timestamp} · {incident.severity}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto p-5">
            {selectedIncident ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-slate-400">{selectedIncident.timestamp}</p>
                  <h3 className="mt-1 text-xl font-semibold">{selectedIncident.title}</h3>
                  <span className="mt-2 inline-flex rounded-md border border-emerald-500/50 px-2 py-1 text-xs text-emerald-400">{selectedIncident.severity}</span>
                </div>
                <section><h4 className="text-sm font-semibold">Summary</h4><p className="mt-2 text-sm leading-6 text-slate-300">{selectedIncident.summary}</p></section>
                <section><h4 className="text-sm font-semibold">Timeline</h4><ul className="mt-2 space-y-2 text-sm text-slate-300">{selectedIncident.timeline.map((entry) => <li key={`${entry.time}-${entry.note}`}><span className="mr-2 font-medium text-slate-100">{entry.time}</span>{entry.note}</li>)}</ul></section>
                <section><h4 className="text-sm font-semibold">Action items</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{selectedIncident.actionItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
                <Button onClick={() => exportPostMortem(selectedIncident)}><Download /> Export Post-Mortem (.md)</Button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">Select an incident to inspect its post-mortem details.</div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
