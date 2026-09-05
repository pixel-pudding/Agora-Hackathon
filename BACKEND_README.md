# EchoOps Backend & Integrations Engine

**Team Lead & Author:** Monisha K P (Backend & Integrations)

EchoOps is a real-time Voice AI Incident Commander backend built on Next.js 16, TypeScript, PostgreSQL (`pgvector`), Agora Conversational AI, and real-time WebSocket/SSE streaming.

---

## Architecture Overview

```
[Aditi: AI Pipeline] ──(incident_state JSON)──► [POST /api/orchestration/state]
                                                          │
                                     ┌────────────────────┴────────────────────┐
                                     ▼                                         ▼
                            [PostgreSQL + pgvector]                [WebSocket Event Hub]
                            • incidents                                        │
                            • participants                   (state.update, action.assigned,
                            • actions                        conflict.raised, summary.spoken)
                            • timeline_events                                  │
                            • past_incidents                                   ▼
                                                          [Megha: Incident Dashboard UI]
                                                                       ▲
                                                                       │ (POST /api/actions/{id}/confirm)
                                                           [Human Incident Commander]
```

---

## 1. REST API Endpoints

### Orchestration & State Ingestion (from Aditi)
* `POST /api/orchestration/state` (or `POST /api/state`)
  * **Payload**: `incident_state` JSON containing `title`, `severity`, `status`, `facts`, `hypotheses`, `actionItems`, `conflicts`, `timeline`.
  * **Behavior**: Validates schema, persists to PostgreSQL (`incidents`, `actions`, `timeline_events`), broadcasts delta events across WebSocket, triggers outbound Slack/Jira hooks.

### Human-in-the-Loop Approval
* `POST /api/actions/{id}/confirm`
  * **Payload**: `{ "confirmedBy": "Monisha (Lead)", "reason": "Verified safe to execute" }`
  * **Behavior**: Unblocks critical/destructive actions (e.g. rollback, traffic shift), updates PostgreSQL, and broadcasts `action.assigned` / `state.update` over WebSocket.

### Action Items Management
* `GET /api/actions/{id}` — Fetch action item details.
* `PATCH /api/actions/{id}` — Update task status (`pending`, `in_progress`, `completed`, `blocked`), owner, or deadline.

### Incident Management & Historical Retrieval
* `GET /api/incidents?channel={channelName}&scenario={scenario}` — Fetch active incident state, archived incident history, and semantic memory matches.
* `POST /api/incidents` — Create incident, add verified facts, or trigger scenario presets (`tech_outage`, `urban_flood`, `payment_outage`).

### Agora Platform Services
* `GET /api/generate-agora-token?uid={uid}&channel={channel}` — Generates unified **RTC + RTM** tokens.
* `POST /api/invite-agent` — Starts the Agora Conversational AI Agent (**Deepgram STT**, **OpenAI LLM**, **MiniMax TTS**).
* `POST /api/recording` & `GET /api/recording` — Manages Agora Cloud HD Audio Recording.
* `GET /api/analytics` & `POST /api/analytics` — Real-time QoE, audio bitrate, packet loss, and latency metrics.

### AI Intelligence & Summaries
* `POST /api/ai/analyze-incident` — Real-time transcript turn analysis (facts vs assumptions classification).
* `POST /api/ai/generate-summary` — Generates 1–3 sentence spoken briefings or full Post-Incident Review (PIR) reports.

---

## 2. WebSocket & Real-Time Event Stream

Connect to `/api/events?channel=echoops-war-room` via Server-Sent Events (or WebSocket bridge):

### Event Types Emitted:
1. `state.update`: Full updated `IncidentState` when any parameter changes.
2. `action.assigned`: Emitted when an action item is created or approved with its assigned owner and deadline.
3. `conflict.raised`: Emitted immediately when contradictory statements or conflicting data are detected.
4. `summary.spoken`: Emitted when EchoOps generates a spoken briefing or Post-Incident Review.

---

## 3. PostgreSQL Database & pgvector Schema

Run the SQL migration in [`lib/db/schema.sql`](./lib/db/schema.sql) to initialize tables:
* `incidents` — Incident status, severity, timestamps, risk summaries.
* `participants` — User role mappings (Commander, Lead SRE, Field Officer, Logistics).
* `actions` — Action items with `requires_confirmation`, `confirmed_by`, and Jira ticket references.
* `timeline_events` — Continuous audit trail.
* `facts` & `hypotheses` — Structured intelligence.
* `past_incidents` — `vector(1536)` embeddings for semantic memory search.

---

## 4. Deployments

* **Render**: Configured with [`render.yaml`](./render.yaml).
* **Railway**: Configured with [`railway.json`](./railway.json).
* **Fly.io**: Configured with [`fly.toml`](./fly.toml).
* **Docker**: Use standard `Dockerfile`.
