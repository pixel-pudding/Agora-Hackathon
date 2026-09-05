'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/src/components/Header';
import ActiveIncidentCard from '@/src/components/ActiveIncidentCard';
import IncidentTimeline from '@/src/components/IncidentTimeline';
import FactsCard from '@/src/components/FactsCard';
import AssumptionsCard from '@/src/components/AssumptionsCard';
import ActionOwnership from '@/src/components/ActionOwnership';
import AlertsSection from '@/src/components/AlertsSection';
import HumanInTheLoop from '@/src/components/HumanInTheLoop';
import VoiceTranscriptStream from '@/src/components/VoiceTranscriptStream';
import LandingPage from '@/components/LandingPage';
import { mockIncidentData } from '@/src/data/mockData';
import { Mic, PhoneCall, Radio, Activity, Volume2, ShieldAlert } from 'lucide-react';

export default function Home() {
  const [showVoiceRoom, setShowVoiceRoom] = useState(false);
  const [liveIncident, setLiveIncident] = useState(mockIncidentData.incident);
  const [liveTimeline, setLiveTimeline] = useState(mockIncidentData.timeline);
  const [liveFacts, setLiveFacts] = useState(mockIncidentData.facts);
  const [liveAssumptions, setLiveAssumptions] = useState(mockIncidentData.assumptions);
  const [liveActions, setLiveActions] = useState(mockIncidentData.actions);
  const [liveAlerts, setLiveAlerts] = useState(mockIncidentData.alerts);
  const [liveHitl, setLiveHitl] = useState(mockIncidentData.humanInTheLoop);

  // Subscribe to real-time backend events via SSE (/api/events)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events?channel=echoops-war-room');
      eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.event === 'state.update' && payload.data) {
            const inc = payload.data;
            if (inc.title) {
              setLiveIncident((prev: any) => ({
                ...prev,
                title: inc.title,
                severity: inc.severity,
                status: inc.status,
              }));
            }
            if (inc.facts && inc.facts.length > 0) {
              setLiveFacts(
                inc.facts.map((f: any, i: number) => ({
                  id: f.id || `f-${i}`,
                  text: f.statement,
                  time: f.timestamp ? new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
                  source: f.verifiedBy || 'EchoOps AI',
                  verified: true,
                })),
              );
            }
            if (inc.timeline && inc.timeline.length > 0) {
              setLiveTimeline(
                inc.timeline.map((t: any, i: number) => ({
                  id: t.id || `t-${i}`,
                  time: t.time || '10:00 AM',
                  type: t.category === 'fact' ? 'fact' : t.category === 'action' ? 'action' : 'decision',
                  speaker: t.speaker || 'System',
                  content: t.note,
                })),
              );
            }
          }
        } catch {
          // Ignore parsing issues
        }
      };
    } catch {
      // EventSource fallback
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  return (
    <div className="app-layout">
      {/* 1. HEADER with EchoOps, Voice AI Commander, and LIVE status */}
      <Header />

      {/* Voice Room Access Banner */}
      <div style={{ background: 'linear-gradient(90deg, #312e81 0%, #1e1b4b 100%)', color: '#fff', padding: '0.75rem 2rem' }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }}></div>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Agora Voice AI Channel: <code style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }}>incident-123</code>
            </span>
          </div>
          <button
            onClick={() => setShowVoiceRoom((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: showVoiceRoom ? '#dc2626' : '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {showVoiceRoom ? <PhoneCall size={16} /> : <Mic size={16} />}
            {showVoiceRoom ? 'Close Voice Room Panel' : 'Join Live Agora Voice Room'}
          </button>
        </div>
      </div>

      {/* Embedded Agora Voice Room Drawer / Panel */}
      {showVoiceRoom && (
        <div style={{ background: '#0f172a', padding: '2rem 1rem', borderBottom: '2px solid #334155' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <LandingPage />
          </div>
        </div>
      )}

      {/* Main Dashboard Container */}
      <main className="dashboard-container">
        {/* 2. ACTIVE INCIDENT HERO: Payment Service Outage, HIGH severity, ACTIVE status */}
        <ActiveIncidentCard incident={liveIncident} />

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="dashboard-grid">
          {/* Left Column: Investigation, Timeline & Actions */}
          <div className="grid-col">
            {/* 3. INCIDENT TIMELINE: Chronological events with timestamps */}
            <IncidentTimeline timeline={liveTimeline} />

            {/* 6. ACTION & OWNERSHIP: PENDING, IN PROGRESS, COMPLETED */}
            <ActionOwnership initialActions={liveActions} />

            {/* 8. HUMAN-IN-THE-LOOP: Critical action requiring approval */}
            <HumanInTheLoop hitlData={liveHitl} />
          </div>

          {/* Right Column: Intelligence, Alerts, Facts & Assumptions */}
          <div className="grid-col">
            {/* 7. ALERTS: Separate Conflict, Gap, and Risk alerts */}
            <AlertsSection alerts={liveAlerts} />

            {/* 4. FACTS: Confirmed information */}
            <FactsCard facts={liveFacts} />

            {/* 5. ASSUMPTIONS: Unconfirmed information clearly labeled */}
            <AssumptionsCard assumptions={liveAssumptions} />

            {/* VOICE AI REAL-TIME SYNTHESIS STREAM */}
            <VoiceTranscriptStream transcripts={mockIncidentData.voiceStreamMock} />
          </div>
        </div>
      </main>
    </div>
  );
}
