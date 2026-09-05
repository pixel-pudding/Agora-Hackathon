# EchoOps — Real-Time Voice AI Incident Commander

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

EchoOps is a real-time Voice AI Incident Commander built with Agora Conversational AI, Next.js, PostgreSQL (`pgvector`), and a dynamic Incident Dashboard.

---

## 👥 Team Echo Sphere (Code Forge)
1. **Monisha K P** — Team Lead / Backend & Integrations
2. **Aditi Anand** — AI & Intelligence Pipeline
3. **Megha Biradar** — Frontend & Incident Dashboard
4. **Yashika Venugopal** — Real-Time Communication

---

## 🏗️ Architecture & Modules

* **Agora RTC Voice Room & Conversational AI Agent**: Real-time multi-party voice communication on Agora SD-RTN, managed STT (Deepgram `nova-3`), LLM (OpenAI `gpt-4o-mini`), and TTS (MiniMax `speech_2_6_turbo`).
* **Frontend Incident Dashboard** (`src/` & `components/`):
  * Active Incident Card & Severity Indicators (`src/components/ActiveIncidentCard.jsx`)
  * Facts vs Assumptions Cards (`src/components/FactsCard.jsx`, `src/components/AssumptionsCard.jsx`)
  * Action Items & Task Ownership Tracker (`src/components/ActionOwnership.jsx`)
  * Human-in-the-Loop Approval Modal (`src/components/HumanInTheLoop.jsx`)
  * Live Incident Timeline (`src/components/IncidentTimeline.jsx`)
  * Voice Transcript Stream & Waveform Visualizer (`src/components/VoiceTranscriptStream.jsx`)
  * Active Voice Room & SRE Runbook Quick Actions (`components/ActiveRoom.tsx`, `components/RunbookQuickActions.tsx`)
* **Backend Orchestration & Database**:
  * PostgreSQL Schema with `pgvector` (`lib/db/schema.sql`, `lib/db/models.ts`)
  * WebSocket / SSE Event Hub (`lib/wsHub.ts`, `app/api/events/route.ts`)
  * Incident Ingestion & State Machine (`app/api/orchestration/state/route.ts`)
  * Human-in-the-Loop Approval Gate (`app/api/actions/[id]/confirm/route.ts`)
  * Enterprise Integrations: Slack (`lib/integrations/slack.ts`), Jira (`lib/integrations/jira.ts`), PagerDuty (`lib/integrations/pagerduty.ts`)
  * Agora Cloud Recording & Analytics (`app/api/recording/route.ts`, `app/api/analytics/route.ts`)

---

## 🚀 Quick Start

### 1. Prerequisites
* Node.js 22+
* Agora Account App ID & App Certificate

### 2. Environment Setup
Copy the environment template:
```bash
cp env.local.example .env.local
```
Fill in your Agora credentials:
```bash
NEXT_PUBLIC_AGORA_APP_ID="your_app_id"
NEXT_AGORA_APP_CERTIFICATE="your_app_certificate"
```

### 3. Run the App
```bash
pnpm install
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 Documentation
* Full Backend API & WebSocket Reference: [`BACKEND_README.md`](./BACKEND_README.md)
* Agent Development Guide: [`AGENTS.md`](./AGENTS.md)
