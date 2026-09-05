'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AgoraRTC, {
  useRTCClient,
  useLocalMicrophoneTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  MessageSalStatus,
  TranscriptHelperMode,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
  TurnStatus,
} from 'agora-agent-client-toolkit';
import { AgentVisualizer } from 'agora-agent-uikit';
import { MicButtonWithVisualizer } from 'agora-agent-uikit/rtc';
import { Button } from '@/components/ui/button';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import {
  getCurrentInProgressMessage,
  getMessageList,
  mapAgentVisualizerState,
  normalizeTimestampMs,
  normalizeTranscript,
} from '@/lib/conversation';
import { MicrophoneSelector } from './MicrophoneSelector';
import {
  getConversationIssueSeverity,
  type ConnectionIssue,
} from './ConversationErrorCard';
import { ConnectionStatusPanel } from './ConnectionStatusPanel';
import { BotAudioVisualizer } from './BotAudioVisualizer';
import { IncidentHistoryDrawer, saveCurrentIncident, type ArchivedIncident } from './IncidentHistoryDrawer';
import { QuickstartConversationLayout } from './QuickstartConversationLayout';
import { QuickstartPipelineMetrics, type QuickstartAgentMetric } from './QuickstartPipelineMetrics';
import { QuickstartTranscriptPanel } from './QuickstartTranscriptPanel';
import { RunbookQuickActions } from './RunbookQuickActions';
import type { ActiveRoomProps, ConversationComponentProps } from '@/types/conversation';
import { useAiSpeechHandler } from '@/hooks/useAiSpeechHandler';
import {
  useSpeechCapture,
  type AgoraSpeechUpdate,
} from '@/hooks/useSpeechCapture';

// Cap the displayed issues list to avoid overwhelming the UI during a cascade of errors.
const MAX_CONNECTION_ISSUES = 6;
const VAD_THRESHOLD = 25;
const VAD_START_MS = 200;
const VAD_SILENCE_MS = 1200;

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

// Payload shape for signaling-level errors forwarded by the agent over RTM.
type RtmMessageErrorPayload = {
  object: 'message.error';
  module?: string;
  code?: number;
  message?: string;
  send_ts?: number;
};

// Payload shape for SAL (Session Abstraction Layer) registration status messages.
type RtmSalStatusPayload = {
  object: 'message.sal_status';
  status?: string;
  timestamp?: number;
};

// Small presentational chip for participants showing active-speaker animation.
function ParticipantChip({
  label,
  isActive,
}: {
  label: string;
  isActive?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/80 px-3 py-1 text-sm">
      <div className="flex items-center gap-1">
        <span className={`inline-block h-2 w-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
      </div>
      <div className="truncate text-xs text-foreground">{label}</div>
      {isActive && (
        <div className="ml-2 flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 animate-[wave_800ms_linear_infinite] bg-green-400" />
          <span className="inline-block h-4 w-0.5 animate-[wave_1200ms_linear_infinite] bg-green-400" />
          <style>{`@keyframes wave {0% {transform: scaleY(0.3);} 50% {transform: scaleY(1);} 100% {transform: scaleY(0.3);} }`}</style>
        </div>
      )}
    </div>
  );
}

function isRtmMessageErrorPayload(
  value: unknown,
): value is RtmMessageErrorPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.error'
  );
}

function isRtmSalStatusPayload(value: unknown): value is RtmSalStatusPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.sal_status'
  );
}

export function ActiveRoom({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
  isStopping,
}: ActiveRoomProps) {
  const client = useRTCClient();
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false);
  const [isIncidentHistoryOpen, setIsIncidentHistoryOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);

  const {
    processUserSpeech,
    assistantReply,
    speechError,
    isProcessing: isCopilotProcessing,
    latestMetrics,
    abortPendingSpeech,
  } = useAiSpeechHandler({ channel: agoraData.channel });

  // Tracks granular RTC connection state for the status dot.
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const agentUID = String(DEFAULT_AGENT_UID);
  const [joinedUID, setJoinedUID] = useState<UID>(0);
  const [agoraTranscriptionAvailable, setAgoraTranscriptionAvailable] =
    useState(false);
  const [agoraSpeech, setAgoraSpeech] = useState<AgoraSpeechUpdate | null>(null);

  // Transcript + agent state — managed with AgoraVoiceAI
  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [agentMetrics, setAgentMetrics] = useState<QuickstartAgentMetric[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>(
    [],
  );
  const addConnectionIssue = useCallback((issue: ConnectionIssue) => {
    setConnectionIssues((prev) => {
      const isDuplicate = prev.some(
        (x) =>
          x.agentUserId === issue.agentUserId &&
          x.code === issue.code &&
          x.message === issue.message &&
          Math.abs(x.timestamp - issue.timestamp) < 1500,
      );
      if (isDuplicate) return prev;
      return [issue, ...prev].slice(0, MAX_CONNECTION_ISSUES);
    });
  }, []);

  // Auto-open details panel as soon as a new issue is recorded.
  useEffect(() => {
    if (connectionIssues.length > 0) {
      setIsConnectionDetailsOpen(true);
    }
  }, [connectionIssues.length]);

  // StrictMode guard
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10),
    },
    isReady,
  );

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  useEffect(() => {
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'ENABLE_AUDIO_PTS',
        true,
      );
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'AUDIO_VOLUME_INDICATION_INTERVAL',
        100,
      );
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      if (uid !== null && uid !== undefined) {
        setJoinedUID(uid);
      }
    }
  }, [joinSuccess, client]);

  // Guardrail: detect when bot is outputting audio
  const isRemoteAgentAudioPlaying = useMemo(() => {
    return remoteUsers.some(
      (user) =>
        user.uid.toString() === agentUID &&
        user.hasAudio &&
        Boolean((user.audioTrack as unknown as { isPlaying?: boolean })?.isPlaying),
    );
  }, [remoteUsers, agentUID]);

  const isBotSpeaking = useMemo(() => {
    return (
      !isInterrupted &&
      (agentState === 'speaking' || isCopilotProcessing || isRemoteAgentAudioPlaying)
    );
  }, [agentState, isCopilotProcessing, isInterrupted, isRemoteAgentAudioPlaying]);

  const isBotSpeakingRef = useRef(isBotSpeaking);
  useEffect(() => {
    isBotSpeakingRef.current = isBotSpeaking;
  }, [isBotSpeaking]);

  // Interruption handling: abort pending network requests immediately via AbortController
  const interruptBotPlayback = useCallback(() => {
    setIsInterrupted(true);
    abortPendingSpeech();
    window.dispatchEvent(new CustomEvent('echoops:bot-interrupt'));
    remoteUsers
      .filter((user) => user.uid.toString() === agentUID)
      .forEach((user) => {
        const audioTrack = user.audioTrack as unknown as
          | { stop?: () => void }
          | undefined;
        audioTrack?.stop?.();
      });

    void fetch('/api/bot/speak/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: agoraData.channel }),
    }).catch((error) => {
      console.warn('Failed to cancel bot speech:', error);
    });
  }, [abortPendingSpeech, agentUID, agoraData.channel, remoteUsers]);

  const vadStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVadActiveRef = useRef(false);
  const [isVadActive, setIsVadActive] = useState(false);

  useEffect(() => {
    isVadActiveRef.current = isVadActive;
  }, [isVadActive]);

  // Hook handles transcript accumulation and continuous speech recognition
  const {
    isListening: isMicListening,
    isRecording,
    interimTranscript,
    micLevel,
    hasMicPermission,
    isSupported: isSpeechSupported,
    statusMessage: speechStatusMessage,
    startRecognition,
    toggleListening,
    flushTranscript,
  } = useSpeechCapture({
    isMicActive: isReady && isEnabled,
    isVadActive: true,
    isBotSpeaking,
    agoraSpeech: isBotSpeaking ? null : agoraSpeech,
    onUtteranceComplete: processUserSpeech,
  });

  const [customInputText, setCustomInputText] = useState('');

  const flushTranscriptRef = useRef(flushTranscript);
  useEffect(() => {
    flushTranscriptRef.current = flushTranscript;
  }, [flushTranscript]);

  // Core VAD processor: evaluates local volume level against threshold
  const processVadLevel = useCallback(
    (level: number) => {
      const isAboveThreshold = level > VAD_THRESHOLD;

      if (isAboveThreshold) {
        // Active speech: cancel silence timer
        if (vadSilenceTimerRef.current) {
          clearTimeout(vadSilenceTimerRef.current);
          vadSilenceTimerRef.current = null;
        }

        // Trigger transcription capture ONLY when volume crosses threshold (> 25) for > 200ms
        if (!vadStartTimerRef.current && !isVadActiveRef.current) {
          vadStartTimerRef.current = setTimeout(() => {
            vadStartTimerRef.current = null;
            isVadActiveRef.current = true;
            setIsVadActive(true);

            // User barge-in during bot speech triggers immediate interruption
            if (isBotSpeakingRef.current) {
              interruptBotPlayback();
            }
          }, VAD_START_MS);
        }
        return;
      }

      // Volume is below threshold
      // Discard transient spikes that lasted less than 200ms
      if (vadStartTimerRef.current) {
        clearTimeout(vadStartTimerRef.current);
        vadStartTimerRef.current = null;
      }

      // Auto-Silence Detection: when volume drops below threshold for 1.2s, treat utterance as finished
      if (isVadActiveRef.current && !vadSilenceTimerRef.current) {
        vadSilenceTimerRef.current = setTimeout(() => {
          vadSilenceTimerRef.current = null;
          isVadActiveRef.current = false;
          setIsVadActive(false);

          // Trigger AI processing hook with completed utterance
          flushTranscriptRef.current();
        }, VAD_SILENCE_MS);
      }
    },
    [interruptBotPlayback],
  );

  // Client-Side VAD via agoraRTCClient.enableAudioVolumeIndicator()
  useEffect(() => {
    if (!isReady || !joinSuccess || !isEnabled) return;

    client.enableAudioVolumeIndicator();
    const handleVolumeIndicator = (
      volumes: Array<{ uid: UID; level: number }>,
    ) => {
      const localVolume = volumes.find(
        (volume) =>
          volume.uid === 0 ||
          (client.uid !== null && String(volume.uid) === String(client.uid)),
      );
      const level = localVolume?.level ?? 0;
      processVadLevel(level);
    };

    client.on('volume-indicator', handleVolumeIndicator);

    // High frequency interval (50ms) to ensure exact 200ms start and 1.2s silence detection
    const pollInterval = setInterval(() => {
      if (localMicrophoneTrack && isEnabled) {
        const trackLevel = Math.round((localMicrophoneTrack.getVolumeLevel() || 0) * 100);
        processVadLevel(trackLevel);
      }
    }, 50);

    return () => {
      client.off('volume-indicator', handleVolumeIndicator);
      clearInterval(pollInterval);
      if (vadStartTimerRef.current) clearTimeout(vadStartTimerRef.current);
      if (vadSilenceTimerRef.current) clearTimeout(vadSilenceTimerRef.current);
      vadStartTimerRef.current = null;
      vadSilenceTimerRef.current = null;
      isVadActiveRef.current = false;
      setIsVadActive(false);
    };
  }, [client, isEnabled, isReady, joinSuccess, localMicrophoneTrack, processVadLevel]);

  // Reset interrupted state when bot finishes speaking
  useEffect(() => {
    if (agentState !== 'speaking' && !isCopilotProcessing && !isRemoteAgentAudioPlaying) {
      setIsInterrupted(false);
    }
  }, [agentState, isCopilotProcessing, isRemoteAgentAudioPlaying]);

  // Initialize AgoraVoiceAI once the channel is joined
  useEffect(() => {
    if (!isReady || !joinSuccess || !rtmClient) return;

    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmConfig: { rtmEngine: rtmClient },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        });

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              ai.unsubscribe();
              ai.destroy();
            }
          } catch { }
          return;
        }

        const forwardedRef = { ids: new Set<string>() } as { ids: Set<string> };

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setAgoraTranscriptionAvailable(true);
          setRawTranscript([...t]);

          // Guard: ignore transcript updates while bot is outputting audio
          if (isBotSpeakingRef.current) return;

          try {
            const latestLocalTurn = [...t]
              .reverse()
              .find(
                (item) =>
                  (item.uid === '0' || String(item.uid) === String(client.uid)) &&
                  typeof item.text === 'string' &&
                  item.text.trim(),
              );
            if (latestLocalTurn && typeof latestLocalTurn.text === 'string') {
              setAgoraSpeech({
                text: latestLocalTurn.text,
                isFinal: latestLocalTurn.status !== TurnStatus.IN_PROGRESS,
                id: String(
                  latestLocalTurn.turn_id ||
                  `${latestLocalTurn.uid}-${latestLocalTurn._time || 'current'}`,
                ),
              });
            }

            (t || []).forEach((item: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>) => {
              const status = item.status as unknown as number;
              if (status === TurnStatus.IN_PROGRESS) return;
              const id = String(item.turn_id || `${item.uid}-${item._time || Date.now()}`);
              if (forwardedRef.ids.has(id)) return;
              forwardedRef.ids.add(id);

              const payload = {
                audio_stream: null,
                text: item.text,
                speaker_id: item.uid,
                channel: agoraData.channel,
                ts: typeof item._time === 'number' ? item._time : Date.now(),
                turn_id: item.turn_id,
              };

              void fetch('/api/forward-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              }).catch((e) => console.warn('forward-audio failed:', e));

              // Ingest and persist every transcript turn into PostgreSQL database
              if (item.text && typeof item.text === 'string') {
                void fetch('/api/ai/analyze-incident', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    channelName: agoraData.channel || 'echoops-war-room',
                    speakerName:
                      item.uid === '0' || String(item.uid) === String(client.uid)
                        ? 'You (Commander)'
                        : 'EchoOps AI',
                    transcript: item.text,
                  }),
                }).catch((e) => console.warn('analyze-incident failed:', e));
              }
            });
          } catch (err) {
            console.warn('Error forwarding transcript:', err);
          }
        });

        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
          setAgentState(event.state),
        );
        ai.on(AgoraVoiceAIEvents.AGENT_METRICS, (_, metrics) => {
          setAgentMetrics((prev) => [...prev, metrics].slice(-8));
        });
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-message-error-${error.code}`,
            source: 'rtm',
            agentUserId,
            code: error.code,
            message: error.message,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });

        ai.on(
          AgoraVoiceAIEvents.MESSAGE_SAL_STATUS,
          (agentUserId, salStatus) => {
            if (
              salStatus.status === MessageSalStatus.VP_REGISTER_FAIL ||
              salStatus.status === MessageSalStatus.VP_REGISTER_DUPLICATE
            ) {
              addConnectionIssue({
                id: `${Date.now()}-${agentUserId}-sal-${salStatus.status}`,
                source: 'rtm',
                agentUserId,
                code: salStatus.status,
                message: `SAL status: ${salStatus.status}`,
                timestamp: normalizeTimestampMs(salStatus.timestamp),
              });
            }
          },
        );

        ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-agent-error-${error.code}`,
            source: 'agent',
            agentUserId,
            code: error.code,
            message: `${error.type}: ${error.message}`,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });

        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) {
          console.error('[AgoraVoiceAI] init failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      setAgoraTranscriptionAvailable(false);
      setAgoraSpeech(null);
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch { }
    };
  }, [isReady, joinSuccess, client, rtmClient, agoraData.channel, addConnectionIssue]);

  // Raw RTM parsing fallback
  useEffect(() => {
    const handleRtmMessage = (event: {
      message: string | Uint8Array;
      publisher: string;
    }) => {
      const payloadText =
        typeof event.message === 'string'
          ? event.message
          : new TextDecoder().decode(event.message);

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        return;
      }

      if (isRtmMessageErrorPayload(parsed)) {
        const p = parsed;
        addConnectionIssue({
          id: `${Date.now()}-${event.publisher}-rtm-msg-error-${p.code ?? 'unknown'}`,
          source: 'rtm-signaling',
          agentUserId: event.publisher,
          code: p.code ?? 'unknown',
          message: `${p.module ?? 'unknown'}: ${p.message ?? 'Unknown signaling error'}`,
          timestamp: normalizeTimestampMs(p.send_ts ?? Date.now()),
        });
        return;
      }

      if (isRtmSalStatusPayload(parsed)) {
        const p = parsed;
        if (
          p.status === 'VP_REGISTER_FAIL' ||
          p.status === 'VP_REGISTER_DUPLICATE'
        ) {
          addConnectionIssue({
            id: `${Date.now()}-${event.publisher}-rtm-sal-${p.status}`,
            source: 'rtm-signaling',
            agentUserId: event.publisher,
            code: p.status,
            message: `SAL status: ${p.status}`,
            timestamp: normalizeTimestampMs(p.timestamp ?? Date.now()),
          });
        }
      }
    };

    if (!rtmClient) return;

    rtmClient.addEventListener('message', handleRtmMessage);
    return () => {
      rtmClient.removeEventListener('message', handleRtmMessage);
    };
  }, [rtmClient, addConnectionIssue]);

  const transcript = useMemo(() => {
    return normalizeTranscript(rawTranscript, String(client.uid));
  }, [rawTranscript, client.uid]);

  const activeInProgress = useMemo(() => {
    return transcript.find((entry) => entry.status === TurnStatus.IN_PROGRESS) ?? null;
  }, [transcript]);

  const messageList = useMemo(() => getMessageList(transcript), [transcript]);
  const currentInProgressMessage = useMemo(() => getCurrentInProgressMessage(transcript), [transcript]);

  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });

  useEffect(() => {
    const isAgentInRemoteUsers = remoteUsers.some(
      (user) => user.uid.toString() === agentUID,
    );
    setIsAgentConnected(isAgentInRemoteUsers);
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState);
  });

  const connectionSeverity = useMemo<'normal' | 'warning' | 'error'>(() => {
    if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
      return 'error';
    }
    if (connectionState === 'CONNECTING' || connectionState === 'RECONNECTING') {
      return 'warning';
    }
    if (connectionIssues.length === 0) {
      return 'normal';
    }
    return connectionIssues.some((issue) => getConversationIssueSeverity(issue) === 'error')
      ? 'error'
      : 'warning';
  }, [connectionState, connectionIssues]);

  const visualizerState = isInterrupted
    ? 'ambient'
    : isCopilotProcessing
      ? 'talking'
      : isBotSpeaking
        ? 'talking'
        : isMicListening || isEnabled
          ? 'listening'
          : mapAgentVisualizerState(agentState, isAgentConnected, connectionState);

  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled;
    const track = localMicrophoneTrack;
    if (!track) {
      setIsEnabled(next);
      return;
    }
    try {
      await track.setEnabled(next);
      setIsEnabled(next);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  }, [isEnabled, localMicrophoneTrack]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(
        joinedUID.toString(),
      );
      await client?.renewToken(rtcToken);
      if (rtmClient) {
        await rtmClient.renewToken(rtmToken);
      }
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const handleEndConversation = useCallback(async () => {
    onEndConversation();
  }, [onEndConversation]);

  return (
    <>
      <QuickstartConversationLayout
        statusPanel={
          <div className="flex items-center gap-3">
            <div className="flex flex-col text-sm">
              <span className="font-semibold">Channel</span>
              <span className="text-muted-foreground truncate">{agoraData.channel ?? 'unknown'}</span>
            </div>
            <div>
              <ConnectionStatusPanel
                connectionState={connectionState}
                connectionSeverity={connectionSeverity}
                connectionIssues={connectionIssues}
                isOpen={isConnectionDetailsOpen}
                onToggle={() => setIsConnectionDetailsOpen((open) => !open)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${isAgentConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-xs text-muted-foreground">{isAgentConnected ? 'Bot live' : 'Bot not present'}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${isVadActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-muted/50 text-muted-foreground border border-border/40'
                  }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isVadActive ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/50'}`} />
                {isVadActive ? 'VAD Active' : 'VAD Standby'}
              </span>
              {isBotSpeaking && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Mic Muted (Bot Speaking)
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsDebugOpen((open) => !open)}>
              SRE Debug
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsIncidentHistoryOpen(true)}>
              Incident History
            </Button>
          </div>
        }
        pipelineMetrics={<QuickstartPipelineMetrics metrics={agentMetrics} />}
        transcriptPanel={
          <QuickstartTranscriptPanel
            messageList={messageList}
            currentInProgressMessage={currentInProgressMessage}
            agentUID={agentUID}
            assistantReply={assistantReply}
            isAssistantProcessing={isCopilotProcessing}
          />
        }
        visualizer={
          <div className="relative flex h-full min-h-[20rem] w-full max-w-4xl flex-col items-center justify-center" role="region" aria-label="AI agent status visualization">
            {isDebugOpen && (
              <div className="absolute right-0 top-0 z-10 rounded-md border border-border bg-card/95 p-3 font-mono text-xs shadow-lg">
                <div className="mb-2 font-sans font-semibold text-foreground">Voice roundtrip</div>
                {latestMetrics ? (
                  <div className="space-y-1 text-muted-foreground">
                    <div>LLM: {Math.round(latestMetrics.t_llm)} ms</div>
                    <div>Total: {Math.round(latestMetrics.t_total)} ms</div>
                    <div className="pt-1 text-[10px]">t0 {Math.round(latestMetrics.t0)}</div>
                    <div className="text-[10px]">t1 {Math.round(latestMetrics.t1)}</div>
                    <div className="text-[10px]">t2 {Math.round(latestMetrics.t2)}</div>
                    <div className="text-[10px]">t3 {Math.round(latestMetrics.t3)}</div>
                  </div>
                ) : (
                  <div className="text-muted-foreground">Waiting for a completed turn</div>
                )}
              </div>
            )}
            <BotAudioVisualizer isSpeaking={isBotSpeaking} />
            {speechError && <p className="text-xs text-destructive">{speechError}</p>}

            {hasMicPermission === false && (
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>Microphone access blocked in browser. Click the lock/permission icon in your browser URL bar and allow microphone.</span>
              </div>
            )}

            <div className="mb-2 w-full flex items-center justify-center">
              <AgentVisualizer state={visualizerState} size="lg" />
            </div>

            {/* Real-time speech feedback bar & live audio meter */}
            <div className="w-full max-w-xl mx-auto my-2 px-4 py-2.5 rounded-xl border border-indigo-500/30 bg-slate-900/90 shadow-lg shadow-indigo-500/10 flex flex-col items-center gap-2 transition-all">
              <div className="w-full flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-500 animate-ping' : isBotSpeaking ? 'bg-amber-400' : isMicListening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                  <span className={isRecording ? 'text-red-400 font-bold' : isBotSpeaking ? 'text-amber-300' : isMicListening ? 'text-emerald-300' : 'text-slate-400'}>
                    {isRecording
                      ? '🔴 Recording Speech... Click again to stop & process'
                      : isBotSpeaking
                        ? 'EchoOps AI Speaking...'
                        : interimTranscript
                          ? 'Transcribing your speech:'
                          : isMicListening
                            ? 'Listening... (Speak your update, hypothesis, or runbook command)'
                            : 'Microphone inactive'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleListening()}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded transition-all cursor-pointer ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                  }`}
                  title="Click to start/stop speaking"
                >
                  {isRecording ? '⏹️ Stop & Send' : '🎙️ Tap to Speak'}
                </button>
              </div>

              {/* Real-time Volume Level Meter */}
              {isMicListening && (
                <div className="w-full flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400">MIC:</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 transition-all duration-75"
                      style={{ width: `${Math.min(100, Math.max(micLevel * 2, 4))}%` }}
                    ></div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 w-7 text-right">{micLevel}%</span>
                </div>
              )}

              {speechStatusMessage && !interimTranscript && (
                <div className="text-[11px] text-indigo-300/80 font-mono text-center">
                  {speechStatusMessage}
                </div>
              )}

              {interimTranscript && (
                <div className="w-full text-sm font-medium text-white px-3 py-1.5 bg-indigo-950/90 rounded border border-indigo-500/50 text-center animate-pulse">
                  "{interimTranscript}"
                </div>
              )}

              {/* One-Click Spoken Turn Prompts */}
              <div className="w-full pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-medium">Quick Spoken Turns:</span>
                <button
                  type="button"
                  onClick={() => processUserSpeech('I think the database connection pool is saturated in payments-core-api.')}
                  disabled={isCopilotProcessing}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-900/60 text-indigo-300 border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer"
                >
                  💡 "Hypothesis: DB pool full"
                </button>
                <button
                  type="button"
                  onClick={() => processUserSpeech('Confirmed HTTP 504 error rate is at 14.2% on /checkout route.')}
                  disabled={isCopilotProcessing}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-900/60 text-emerald-300 border border-slate-700 hover:border-emerald-500/50 transition-all cursor-pointer"
                >
                  📊 "Fact: 504s at 14.2%"
                </button>
                <button
                  type="button"
                  onClick={() => processUserSpeech('Alex, please drain ingress traffic to standby cluster.')}
                  disabled={isCopilotProcessing}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-blue-900/60 text-blue-300 border border-slate-700 hover:border-blue-500/50 transition-all cursor-pointer"
                >
                  ⚡ "Action: Drain traffic"
                </button>
              </div>
            </div>

            {/* Emergency / Dispatcher Speech Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!customInputText.trim() || isCopilotProcessing) return;
                processUserSpeech(customInputText.trim());
                setCustomInputText('');
              }}
              className="w-full max-w-xl mx-auto flex items-center gap-2 my-1"
            >
              <input
                type="text"
                value={customInputText}
                onChange={(e) => setCustomInputText(e.target.value)}
                placeholder="Type spoken update (e.g. 'I think the database pool is leaking')..."
                className="flex-1 bg-slate-900/90 border border-slate-700 text-xs text-white px-3.5 py-2 rounded-lg focus:outline-none focus:border-indigo-500 font-sans"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!customInputText.trim() || isCopilotProcessing}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow"
              >
                Send Turn
              </Button>
            </form>

            <div className="my-2 w-full flex items-center justify-center">
              <RunbookQuickActions
                onExecuteCommand={(command) => processUserSpeech(command)}
                channel={agoraData.channel}
                disabled={isCopilotProcessing}
              />
            </div>
            <div className="mt-2 flex w-full max-w-4xl flex-wrap items-center justify-center gap-3">
              <ParticipantChip label={`You (${client.uid ?? 'me'})`} isActive={String(activeInProgress?.uid) === String(client.uid) || (isVadActive && !isBotSpeaking)} />
              <ParticipantChip label={`EchoOps Bot (${agentUID})`} isActive={String(activeInProgress?.uid) === agentUID || isBotSpeaking} />
              {remoteUsers.map((user) => (
                <ParticipantChip key={user.uid} label={`User ${user.uid}`} isActive={String(activeInProgress?.uid) === String(user.uid)} />
              ))}
            </div>
            {remoteUsers.map((user) => (
              <div key={user.uid} className="hidden">
                <RemoteUser user={user} />
              </div>
            ))}
          </div>
        }
        controls={
          <div
            className="mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 backdrop-blur-md"
            role="group"
            aria-label="Audio controls"
          >
            <div className="conversation-mic-host flex items-center justify-center">
              <MicButtonWithVisualizer
                isEnabled={isEnabled}
                setIsEnabled={setIsEnabled}
                track={localMicrophoneTrack}
                onToggle={handleMicToggle}
                className="overflow-visible"
                aria-label={isEnabled ? 'Mute microphone' : 'Unmute microphone'}
                enabledColor="hsl(var(--primary))"
                disabledColor="hsl(var(--destructive))"
              />
            </div>
            <MicrophoneSelector localMicrophoneTrack={localMicrophoneTrack} />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  try {
                    const channel = agoraData.channel ?? 'unknown-channel';
                    const now = new Date();
                    const ts = now.toISOString();
                    const entries = transcript.map((t) => ({
                      speaker: t.uid,
                      ts: typeof t._time === 'number' ? normalizeTimestampMs(t._time) : undefined,
                      text: t.text ?? '',
                      status: t.status,
                    }));

                    const incident: ArchivedIncident = {
                      id: `${channel}-${Date.now()}`,
                      title: `Incident Summary - ${channel}`,
                      timestamp: ts,
                      severity: 'Sev-3',
                      summary: entries.length > 0 ? entries[entries.length - 1].text : 'No transcript entries recorded.',
                      actionItems: [],
                      timeline: entries.map((entry) => ({
                        time: entry.ts ? new Date(entry.ts).toISOString() : ts,
                        note: `Speaker ${entry.speaker}: ${entry.text}`,
                      })),
                    };
                    saveCurrentIncident(incident);

                    const mdLines: string[] = [];
                    mdLines.push(`# Incident Summary — ${channel}`);
                    mdLines.push(`\nGenerated: ${ts}\n`);
                    mdLines.push(`## Timeline`);
                    entries.forEach((e) => {
                      const date = e.ts ? new Date(e.ts).toISOString() : '';
                      mdLines.push(`- **Speaker ${e.speaker}** — ${date}`);
                      mdLines.push(`  \n\n  ${e.text}\n`);
                    });

                    const filename = `incident-summary-${channel}-${Math.floor(Date.now() / 1000)}.md`;
                    const blob = new Blob([mdLines.join('\n')], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    URL.revokeObjectURL(url);
                    a.remove();
                  } catch (err) {
                    console.error('Failed to save incident summary:', err);
                  }
                }}
              >
                Save Incident Summary
              </Button>
            </div>
          </div>
        }
        onEndConversation={handleEndConversation}
        isEnding={isStopping}
      />
      <IncidentHistoryDrawer isOpen={isIncidentHistoryOpen} onClose={() => setIsIncidentHistoryOpen(false)} />
    </>
  );
}

export const ConversationComponent = ActiveRoom;
export default ActiveRoom;
export type { ActiveRoomProps, ConversationComponentProps };
