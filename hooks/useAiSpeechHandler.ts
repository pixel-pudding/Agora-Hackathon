'use client';

import { useCallback, useRef, useState } from 'react';
import { startAiTurn, type AiTurnMetrics } from '@/lib/aiMetrics';
import type { SreAction } from '@/lib/sreTools';

type SpeechHistoryItem = {
  role: string;
  content: string;
};

type UseAiSpeechHandlerOptions = {
  channel: string;
};

type RespondPayload = {
  type?: unknown;
  text?: unknown;
  error?: unknown;
  actionsExecuted?: unknown;
};

export function useAiSpeechHandler({ channel }: UseAiSpeechHandlerOptions) {
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [latestMetrics, setLatestMetrics] = useState<AiTurnMetrics | null>(null);
  const [actionsExecuted, setActionsExecuted] = useState<SreAction[]>([]);
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const processUserSpeech = useCallback(
    async (transcript: string, history: SpeechHistoryItem[] = []) => {
      const normalizedTranscript = transcript.trim();
      if (!normalizedTranscript || isProcessingRef.current) return;

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      isProcessingRef.current = true;
      setIsProcessing(true);
      setSpeechError(null);
      setAssistantReply('');
      setActionsExecuted([]);
      const metrics = startAiTurn();
      let receivedChunk = false;
      let queuedSpeech = Promise.resolve();

      const queueSpeechChunk = (text: string) => {
        const chunk = text.trim();
        if (!chunk) return;
        if (!receivedChunk) {
          receivedChunk = true;
          metrics.markLlmReady();
          setLatestMetrics(metrics.markSpeakTriggered());
        }
        setAssistantReply((previous) => `${previous ?? ''}${text}`);
        queuedSpeech = queuedSpeech.then(async () => {
          const speakResponse = await fetch('/api/bot/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk, priority: 'high', channel }),
            signal: abortController.signal,
          });
          if (!speakResponse.ok) {
            throw new Error('The SRE copilot reply could not be sent to the room.');
          }
        });
      };

      try {
        metrics.markLlmRequest();
        const respondResponse = await fetch('/api/ai/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: normalizedTranscript, history }),
          signal: abortController.signal,
        });
        if (!respondResponse.ok || !respondResponse.body) {
          const errorPayload = (await respondResponse.json()) as RespondPayload;
          throw new Error(
            typeof errorPayload.error === 'string'
              ? errorPayload.error
              : 'The SRE copilot could not respond.',
          );
        }

        const reader = respondResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamDone = false;

        const handleEvent = (rawEvent: string) => {
          const data = rawEvent
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('');
          if (!data) return;
          const payload = JSON.parse(data) as RespondPayload;
          if (payload.type === 'chunk' && typeof payload.text === 'string') {
            queueSpeechChunk(payload.text);
          }
          if (payload.type === 'done') streamDone = true;
          if (payload.type === 'done' && Array.isArray(payload.actionsExecuted)) {
            setActionsExecuted(payload.actionsExecuted as SreAction[]);
          }
        };

        while (!streamDone) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          events.forEach(handleEvent);
          if (done) break;
        }
        if (buffer.trim()) handleEvent(buffer);
        await queuedSpeech;
        if (!receivedChunk) {
          throw new Error('The SRE copilot returned no speech content.');
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error('SRE copilot speech processing failed:', error);
        setSpeechError(
          error instanceof Error ? error.message : 'Speech processing failed.',
        );
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    },
    [channel],
  );

  const abortPendingSpeech = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isProcessingRef.current = false;
    setIsProcessing(false);
  }, []);

  return {
    processUserSpeech,
    assistantReply,
    speechError,
    isProcessing,
    latestMetrics,
    actionsExecuted,
    abortPendingSpeech,
  };
}