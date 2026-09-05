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
import {
  QuickstartPipelineMetrics,
  type QuickstartAgentMetric,
} from './QuickstartPipelineMetrics';
import { QuickstartTranscriptPanel } from './QuickstartTranscriptPanel';
import type { ConversationComponentProps } from '@/types/conversation';
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
// The `module` field identifies which backend subsystem (LLM / ASR / TTS) raised the error.
type RtmMessageErrorPayload = {
  object: 'message.error';
  module?: string;
  code?: number;
  message?: string;
  send_ts?: number;
};

// Payload shape for SAL (Session Abstraction Layer) registration status messages.
// VP_REGISTER_FAIL and VP_REGISTER_DUPLICATE indicate RTM channel subscription problems.
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

// Type guard for RTM signaling-level error payloads (object: 'message.error').
function isRtmMessageErrorPayload(
  value: unknown,
): value is RtmMessageErrorPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.error'
  );
}

// Type guard for RTM SAL status payloads (object: 'message.sal_status').
function isRtmSalStatusPayload(value: unknown): value is RtmSalStatusPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.sal_status'
  );
}

export default function ConversationComponent({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
  isStopping,
}: ConversationComponentProps) {
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
  // Agora states: DISCONNECTED | CONNECTING | CONNECTED | DISCONNECTING | RECONNECTING
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const agentUID = String(DEFAULT_AGENT_UID);
  const [joinedUID, setJoinedUID] = useState<UID>(0);
  const [agoraTranscriptionAvailable, setAgoraTranscriptionAvailable] =
    useState(false);
  const [agoraSpeech, setAgoraSpeech] = useState<AgoraSpeechUpdate | null>(null);

  // Transcript + agent state — managed with AgoraVoiceAI (see effect below).
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

  // StrictMode guard: delay `useJoin`'s ready flag until after the fake-unmount
  // cycle completes. React StrictMode fires cleanup synchronously before any
  // setTimeout callback, so the first (fake) mount's timeout is always cancelled.
  // Only the real second mount's timeout fires, meaning useJoin joins exactly once.
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

  // Create mic track only after the StrictMode fake-unmount cycle completes (isReady).
  // Passing `true` here creates two tracks in StrictMode — the first publishes, then
  // StrictMode cleanup closes it and the second takes over, causing a ~3s audio gap.
  // isReady uses the same setTimeout(fn,0) pattern as useJoin: StrictMode cleanup fires
  // synchronously before the timeout, so only the real second mount's timer fires.
  // Do NOT pass `isEnabled` — that ties track lifetime to mute state and breaks the Web Audio
  // graph inside MicButtonWithVisualizer. Mute uses track.setEnabled() only.
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

  // ENABLE_AUDIO_PTS is a module-level SDK parameter (not on the client instance).
  // It must be set before publishing audio for transcript timing to be accurate.
  useEffect(() => {
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'ENABLE_AUDIO_PTS',
        true,
      );
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  // Track the auto-assigned RTC UID for token renewal and agent invite.
  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      if (uid !== null && uid !== undefined) {
        setJoinedUID(uid);
      }
    }
  }, [joinSuccess, client]);

  // Initialize AgoraVoiceAI once the channel is joined.
  //
  // Gating on `isReady && joinSuccess` is critical for StrictMode safety:
  //   - `isReady` ensures we are past the initial fake-unmount cycle, so this
  //     effect only runs on the real mount (not the discarded fake one).
  //   - Once `isReady` is true, React does NOT double-invoke this effect for
  //     subsequent state changes (`joinSuccess` becoming true). That means
  //     AgoraVoiceAI.init() is called exactly once.
  useEffect(() => {
    if (!isReady || !joinSuccess) return;

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
              // Tear down only the instance created by this effect run.
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {}
          return;
        }

        // Keep a ref of forwarded turn ids to avoid duplicate forwarding.
        const forwardedRef = { ids: new Set<string>() } as { ids: Set<string> };

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setAgoraTranscriptionAvailable(true);
          setRawTranscript([...t]);

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

            // Forward completed (not IN_PROGRESS) turns to our pipeline.
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

              // Fire-and-forget; failures are logged server-side.
              void fetch('/api/forward-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              }).catch((e) => console.warn('forward-audio failed:', e));
            });
          } catch (err) {
            console.warn('Error forwarding transcript:', err);
          }
        });
        // Agent state drives the visualizer, independent of RTC audio presence.
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
        // SAL status: capture raw RTM messages so message.sal_status surfaces even if higher-level events don't.
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
        // Agent error: capture raw RTM messages so message.error surfaces even if higher-level events don't.
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
        // subscribeMessage binds the toolkit to both RTC stream messages and RTM payloads.
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
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, joinSuccess, processUserSpeech]);

  // Raw RTM parsing is kept as a fallback for signaling-level errors and SAL status.
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

    rtmClient.addEventListener('message', handleRtmMessage);
    return () => {
      rtmClient.removeEventListener('message', handleRtmMessage);
    };
  }, [rtmClient, addConnectionIssue]);

  // The toolkit uses uid="0" for local user speech — remap to actual RTC UID
  // so the transcript panel renders user messages on the correct side.
  // Also normalize punctuation spacing for display when upstream text arrives compacted.
  const transcript = useMemo(() => {
    return normalizeTranscript(rawTranscript, String(client.uid));
  }, [rawTranscript, client.uid]);

  // Active in-progress message for UI speaker indicator
  const activeInProgress = useMemo(() => {
    return transcript.find((entry) => entry.status === TurnStatus.IN_PROGRESS) ?? null;
  }, [transcript]);

  // Completed (END + INTERRUPTED) messages shown as history.
  // INTERRUPTED must be included — if the agent's first turn is cut off,
  // messageList stays empty and the first interrupted turn is never shown.
  const messageList = useMemo(() => getMessageList(transcript), [transcript]);

  const currentInProgressMessage = useMemo(() => {
    // The live partial turn renders separately from the completed history list.
    return getCurrentInProgressMessage(transcript);
  }, [transcript]);

  // Publish local mic once the track exists; usePublish waits for RTC connection.
  usePublish([localMicrophoneTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false);
  });

  // Sync isAgentConnected with remoteUsers (covers cases where user-joined/left are missed)
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
    // RTC transport problems take precedence; otherwise derive severity from captured issues.
    if (
      connectionState === 'DISCONNECTED' ||
      connectionState === 'DISCONNECTING'
    ) {
      return 'error';
    }
    if (
      connectionState === 'CONNECTING' ||
      connectionState === 'RECONNECTING'
    ) {
      return 'warning';
    }
    if (connectionIssues.length === 0) {
      return 'normal';
    }
    return connectionIssues.some(
      (issue) => getConversationIssueSeverity(issue) === 'error',
    )
      ? 'error'
      : 'warning';
  }, [connectionState, connectionIssues]);

  const visualizerState = isInterrupted
    ? 'ambient'
    : isCopilotProcessing
      ? 'talking'
      : mapAgentVisualizerState(agentState, isAgentConnected, connectionState);
  const isBotSpeaking = !isInterrupted &&
    (agentState === 'speaking' || isCopilotProcessing);

  const vadStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVadActiveRef = useRef(false);
  const [isVadActive, setIsVadActive] = useState(false);

  useEffect(() => {
    isVadActiveRef.current = isVadActive;
  }, [isVadActive]);

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

  const { flushTranscript } = useSpeechCapture({
    isMicActive: isReady && isEnabled && Boolean(localMicrophoneTrack),
    isVadActive: isVadActive && !isBotSpeaking,
    agoraTranscriptionAvailable,
    agoraSpeech,
    onUtteranceComplete: processUserSpeech,
  });

  useEffect(() => {
    if (!isReady || !joinSuccess || !isEnabled) return;

    client.enableAudioVolumeIndicator();
    const handleVolumeIndicator = (
      volumes: Array<{ uid: UID; level: number }>,
    ) => {
      const localVolume = volumes.find(
        (volume) => String(volume.uid) === String(client.uid),
      );
      const isAboveThreshold = (localVolume?.level ?? 0) > VAD_THRESHOLD;

      if (isAboveThreshold) {
        if (vadSilenceTimerRef.current) {
          clearTimeout(vadSilenceTimerRef.current);
          vadSilenceTimerRef.current = null;
        }
        if (!vadStartTimerRef.current && !isVadActiveRef.current) {
          vadStartTimerRef.current = setTimeout(() => {
            vadStartTimerRef.current = null;
            isVadActiveRef.current = true;
            setIsVadActive(true);
            if (isBotSpeaking) interruptBotPlayback();
          }, VAD_START_MS);
        }
        return;
      }

      if (vadStartTimerRef.current) {
        clearTimeout(vadStartTimerRef.current);
        vadStartTimerRef.current = null;
      }
      if (isVadActiveRef.current && !vadSilenceTimerRef.current) {
        vadSilenceTimerRef.current = setTimeout(() => {
          vadSilenceTimerRef.current = null;
          isVadActiveRef.current = false;
          setIsVadActive(false);
          flushTranscript();
        }, VAD_SILENCE_MS);
      }
    };

    client.on('volume-indicator', handleVolumeIndicator);
    return () => {
      client.off('volume-indicator', handleVolumeIndicator);
      if (vadStartTimerRef.current) clearTimeout(vadStartTimerRef.current);
      if (vadSilenceTimerRef.current) clearTimeout(vadSilenceTimerRef.current);
      vadStartTimerRef.current = null;
      vadSilenceTimerRef.current = null;
      isVadActiveRef.current = false;
      setIsVadActive(false);
    };
  }, [client, flushTranscript, interruptBotPlayback, isBotSpeaking, isEnabled, isReady, joinSuccess]);

  useEffect(() => {
    if (agentState !== 'speaking' && !isCopilotProcessing) {
      setIsInterrupted(false);
    }
  }, [agentState, isCopilotProcessing]);

  /**
   * Mute/unmute via track.setEnabled() only — usePublish owns publish state.
   * If we also unpublish in the toggle, usePublish and the button fight each other
   * and break the MicButtonWithVisualizer Web Audio graph.
   */
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
      // RTC and RTM renew independently, but the quickstart fetches both in one request.
      const { rtcToken, rtmToken } = await onTokenWillExpire(
        joinedUID.toString(),
      );
      await client?.renewToken(rtcToken);
      await rtmClient.renewToken(rtmToken);
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
          <Button variant="outline" size="sm" onClick={() => setIsDebugOpen((open) => !open)}>
            SRE Debug
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsIncidentHistoryOpen(true)}>Incident History</Button>
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
          <div className="mb-3 w-full flex items-center justify-center">
            <AgentVisualizer state={visualizerState} size="lg" />
          </div>
          <div className="mt-2 flex w-full max-w-4xl flex-wrap items-center justify-center gap-3">
            {/* Participant chips with active speaker indicator */}
            <ParticipantChip label={`You (${client.uid ?? 'me'})`} isActive={String(activeInProgress?.uid) === String(client.uid)} />
            <ParticipantChip label={`EchoOps Bot (${agentUID})`} isActive={String(activeInProgress?.uid) === agentUID} />
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
                  mdLines.push(`
Generated: ${ts}\n`);
                  mdLines.push(`## Timeline`);
                  entries.forEach((e) => {
                    const date = e.ts ? new Date(e.ts).toISOString() : '';
                    mdLines.push(`- **Speaker ${e.speaker}** — ${date}`);
                    mdLines.push(`  \n\n  ${e.text}\n`);
                  });

                  const filename = `incident-summary-${channel}-${Math.floor(Date.now()/1000)}.md`;
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
