'use client';

import React, { useState } from 'react';
import LandingPage from '@/components/LandingPage';
import Header from '@/src/components/Header';
import ActiveIncidentCard from '@/src/components/ActiveIncidentCard';
import IncidentTimeline from '@/src/components/IncidentTimeline';
import FactsCard from '@/src/components/FactsCard';
import AssumptionsCard from '@/src/components/AssumptionsCard';
import ActionOwnership from '@/src/components/ActionOwnership';
import AlertsSection from '@/src/components/AlertsSection';
import HumanInTheLoop from '@/src/components/HumanInTheLoop';
import VoiceTranscriptStream from '@/src/components/VoiceTranscriptStream';
import { useLiveIncident } from '@/hooks/useLiveIncident';
import { Radio, LayoutDashboard, SplitSquareVertical, Activity, Sparkles } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'voice' | 'dashboard' | 'split'>('voice');
  const live = useLiveIncident('echoops-war-room');

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-white">
      {/* Navigation View Switcher */}
      <div className="bg-[#0f172a] border-b border-slate-800 px-6 py-2.5 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            EO
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-sm tracking-wide">EchoOps</span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded border border-indigo-500/30">
                WAR ROOM #042
              </span>
              <span
                className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded ${
                  live.isConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
                title={live.isConnected ? 'Live Real-time SSE Stream Connected' : 'Connecting to real-time events...'}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    live.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                ></span>
                {live.isConnected ? 'LIVE SYNC' : 'CONNECTING'}
              </span>
            </div>
            <p className="text-xs text-slate-400">Voice AI Incident Commander</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('voice')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'voice'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio size={14} />
            Active Voice Room
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard size={14} />
            Incident Dashboard
          </button>
          <button
            onClick={() => setActiveTab('split')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'split'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SplitSquareVertical size={14} />
            Split View
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {activeTab === 'voice' && (
          <div className="flex-1 w-full bg-[#121212]">
            <LandingPage />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="flex-1 w-full bg-slate-50 text-slate-900 overflow-y-auto">
            <Header />
            <main className="dashboard-container">
              <ActiveIncidentCard incident={live.incidentHero} />
              <div className="dashboard-grid">
                <div className="grid-col">
                  <IncidentTimeline timeline={live.timeline} />
                  <ActionOwnership
                    actions={live.actions}
                    onStatusChange={live.updateActionStatus}
                  />
                  <HumanInTheLoop
                    hitlData={live.humanInTheLoop}
                    onConfirm={live.confirmHitlAction}
                  />
                </div>
                <div className="grid-col">
                  <AlertsSection alerts={live.alerts} />
                  <FactsCard facts={live.facts} />
                  <AssumptionsCard assumptions={live.assumptions} />
                  <VoiceTranscriptStream transcripts={live.voiceStream} />
                </div>
              </div>
            </main>
          </div>
        )}

        {activeTab === 'split' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            <div className="h-full overflow-y-auto bg-[#121212]">
              <LandingPage />
            </div>
            <div className="h-full overflow-y-auto bg-slate-50 text-slate-900">
              <main className="dashboard-container py-4">
                <ActiveIncidentCard incident={live.incidentHero} />
                <div className="space-y-4">
                  <FactsCard facts={live.facts} />
                  <AssumptionsCard assumptions={live.assumptions} />
                  <ActionOwnership
                    actions={live.actions}
                    onStatusChange={live.updateActionStatus}
                  />
                  <HumanInTheLoop
                    hitlData={live.humanInTheLoop}
                    onConfirm={live.confirmHitlAction}
                  />
                  <IncidentTimeline timeline={live.timeline} />
                  <VoiceTranscriptStream transcripts={live.voiceStream} />
                </div>
              </main>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
