import React from 'react';
import Header from './components/Header';
import ActiveIncidentCard from './components/ActiveIncidentCard';
import IncidentTimeline from './components/IncidentTimeline';
import FactsCard from './components/FactsCard';
import AssumptionsCard from './components/AssumptionsCard';
import ActionOwnership from './components/ActionOwnership';
import AlertsSection from './components/AlertsSection';
import HumanInTheLoop from './components/HumanInTheLoop';
import VoiceTranscriptStream from './components/VoiceTranscriptStream';
import { useLiveIncident } from '../hooks/useLiveIncident';
import './App.css';

export default function App() {
  const live = useLiveIncident('echoops-war-room');

  return (
    <div className="app-layout">
      {/* 1. HEADER with EchoOps, Voice AI Commander, and LIVE status */}
      <Header />

      <main className="dashboard-container">
        {/* 2. ACTIVE INCIDENT HERO */}
        <ActiveIncidentCard incident={live.incidentHero} />

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="dashboard-grid">
          {/* Left Column: Investigation, Timeline & Actions */}
          <div className="grid-col">
            {/* 3. INCIDENT TIMELINE */}
            <IncidentTimeline timeline={live.timeline} />

            {/* 6. ACTION & OWNERSHIP */}
            <ActionOwnership
              actions={live.actions}
              onStatusChange={live.updateActionStatus}
            />

            {/* 8. HUMAN-IN-THE-LOOP */}
            <HumanInTheLoop
              hitlData={live.humanInTheLoop}
              onConfirm={live.confirmHitlAction}
            />
          </div>

          {/* Right Column: Intelligence, Alerts, Facts & Assumptions */}
          <div className="grid-col">
            {/* 7. ALERTS */}
            <AlertsSection alerts={live.alerts} />

            {/* 4. FACTS */}
            <FactsCard facts={live.facts} />

            {/* 5. ASSUMPTIONS */}
            <AssumptionsCard assumptions={live.assumptions} />

            {/* VOICE AI REAL-TIME SYNTHESIS STREAM */}
            <VoiceTranscriptStream transcripts={live.voiceStream} />
          </div>
        </div>
      </main>
    </div>
  );
}
