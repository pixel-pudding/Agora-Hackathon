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
import { mockIncidentData } from './data/mockData';
import './App.css';

export default function App() {
  return (
    <div className="app-layout">
      {/* 1. HEADER with EchoOps, Voice AI Commander, and LIVE status */}
      <Header />

      <main className="dashboard-container">
        {/* 2. ACTIVE INCIDENT HERO: Payment Service Outage, HIGH severity, ACTIVE status */}
        <ActiveIncidentCard incident={mockIncidentData.incident} />

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="dashboard-grid">
          {/* Left Column: Investigation, Timeline & Actions */}
          <div className="grid-col">
            {/* 3. INCIDENT TIMELINE: Chronological events with timestamps */}
            <IncidentTimeline timeline={mockIncidentData.timeline} />

            {/* 6. ACTION & OWNERSHIP: PENDING, IN PROGRESS, COMPLETED */}
            <ActionOwnership initialActions={mockIncidentData.actions} />

            {/* 8. HUMAN-IN-THE-LOOP: Critical action requiring approval */}
            <HumanInTheLoop hitlData={mockIncidentData.humanInTheLoop} />
          </div>

          {/* Right Column: Intelligence, Alerts, Facts & Assumptions */}
          <div className="grid-col">
            {/* 7. ALERTS: Separate Conflict, Gap, and Risk alerts */}
            <AlertsSection alerts={mockIncidentData.alerts} />

            {/* 4. FACTS: Confirmed information */}
            <FactsCard facts={mockIncidentData.facts} />

            {/* 5. ASSUMPTIONS: Unconfirmed information clearly labeled */}
            <AssumptionsCard assumptions={mockIncidentData.assumptions} />

            {/* VOICE AI REAL-TIME SYNTHESIS STREAM */}
            <VoiceTranscriptStream transcripts={mockIncidentData.voiceStreamMock} />
          </div>
        </div>
      </main>
    </div>
  );
}
