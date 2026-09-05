export type ChannelQoEMetrics = {
  channelName: string;
  timestamp: number;
  audioBitrateKbps: number;
  packetLossPercent: number;
  roundTripTimeMs: number;
  audioJitterMs: number;
  activeSpeakersCount: number;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
};

export type AgentPipelineLatency = {
  sttLatencyMs: number;
  llmLatencyMs: number;
  ttsLatencyMs: number;
  totalTurnLatencyMs: number;
  turnCount: number;
};

export type IncidentRoomAnalytics = {
  channelName: string;
  qoe: ChannelQoEMetrics;
  latency: AgentPipelineLatency;
  engagementScore: number; // 0-100%
  totalDurationSeconds: number;
  transcriptsCount: number;
};

const channelAnalyticsMap = new Map<string, IncidentRoomAnalytics>();

export function getOrCreateAnalytics(channelName: string): IncidentRoomAnalytics {
  let analytics = channelAnalyticsMap.get(channelName);
  if (!analytics) {
    analytics = {
      channelName,
      qoe: {
        channelName,
        timestamp: Date.now(),
        audioBitrateKbps: 64,
        packetLossPercent: 0.1,
        roundTripTimeMs: 42,
        audioJitterMs: 4,
        activeSpeakersCount: 3,
        networkQuality: 'excellent',
      },
      latency: {
        sttLatencyMs: 180, // Deepgram nova-3
        llmLatencyMs: 320, // OpenAI gpt-4o-mini
        ttsLatencyMs: 140, // MiniMax speech_2_6_turbo
        totalTurnLatencyMs: 640,
        turnCount: 12,
      },
      engagementScore: 98,
      totalDurationSeconds: 180,
      transcriptsCount: 24,
    };
    channelAnalyticsMap.set(channelName, analytics);
  }
  return analytics;
}

export function updateAgentLatency(
  channelName: string,
  metrics: { stt?: number; llm?: number; tts?: number },
): IncidentRoomAnalytics {
  const analytics = getOrCreateAnalytics(channelName);
  if (metrics.stt) analytics.latency.sttLatencyMs = metrics.stt;
  if (metrics.llm) analytics.latency.llmLatencyMs = metrics.llm;
  if (metrics.tts) analytics.latency.ttsLatencyMs = metrics.tts;
  analytics.latency.totalTurnLatencyMs =
    analytics.latency.sttLatencyMs + analytics.latency.llmLatencyMs + analytics.latency.ttsLatencyMs;
  analytics.latency.turnCount += 1;
  return analytics;
}
