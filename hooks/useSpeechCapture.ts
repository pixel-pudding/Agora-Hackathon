'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const UTTERANCE_PAUSE_MS = 750;

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export type AgoraSpeechUpdate = {
  text: string;
  isFinal: boolean;
  id?: string;
};

type UseSpeechCaptureOptions = {
  isMicActive: boolean;
  isVadActive?: boolean;
  isBotSpeaking?: boolean;
  agoraTranscriptionAvailable?: boolean;
  agoraSpeech?: AgoraSpeechUpdate | null;
  language?: string;
  onUtteranceComplete: (text: string) => void;
};

export function useSpeechCapture({
  isMicActive,
  isVadActive = true,
  isBotSpeaking = false,
  agoraTranscriptionAvailable = false,
  agoraSpeech,
  language = 'en-US',
  onUtteranceComplete,
}: UseSpeechCaptureOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const callbackRef = useRef(onUtteranceComplete);
  const shouldRestartRef = useRef(false);
  const lastAgoraIdRef = useRef<string | null>(null);
  const isBotSpeakingRef = useRef(isBotSpeaking);

  useEffect(() => {
    isBotSpeakingRef.current = isBotSpeaking;
  }, [isBotSpeaking]);

  useEffect(() => {
    callbackRef.current = onUtteranceComplete;
  }, [onUtteranceComplete]);

  const flushTranscript = useCallback(() => {
    const text = `${pendingTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
    pendingTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    setInterimTranscript('');
    if (text) {
      callbackRef.current(text);
    }
    return text;
  }, []);

  // If the bot begins speaking, discard partial interim text so bot echo isn't picked up
  useEffect(() => {
    if (isBotSpeaking) {
      interimTranscriptRef.current = '';
      setInterimTranscript('');
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
    }
  }, [isBotSpeaking]);

  // Agora Cloud STT integration
  useEffect(() => {
    if (!agoraSpeech || !agoraSpeech.text.trim()) return;
    if (isBotSpeaking) return;

    const updateKey = agoraSpeech.id
      ? `${agoraSpeech.id}:${agoraSpeech.isFinal ? 'final' : 'interim'}`
      : null;
    if (updateKey && lastAgoraIdRef.current === updateKey) return;
    if (updateKey) lastAgoraIdRef.current = updateKey;

    const text = agoraSpeech.text.trim();
    if (agoraSpeech.isFinal) {
      pendingTranscriptRef.current = text;
      setFinalTranscript(text);
      interimTranscriptRef.current = '';
      setInterimTranscript('');
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        flushTranscript();
      }, 500);
    } else {
      interimTranscriptRef.current = text;
      setInterimTranscript(text);
    }
  }, [agoraSpeech, isBotSpeaking, flushTranscript]);

  // Browser Web Speech Recognition (Chrome / Safari / Edge)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as SpeechRecognitionWindow)
      .SpeechRecognition ?? (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setIsListening(false);
      return;
    }

    if (!isMicActive) {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {}
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new SpeechRecognition();
    } catch {
      setIsListening(false);
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    shouldRestartRef.current = true;

    recognition.onresult = (event) => {
      if (isBotSpeakingRef.current) return;
      let interim = '';
      let finalized = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalized += text;
        } else {
          interim += text;
        }
      }

      if (interim.trim()) {
        interimTranscriptRef.current = interim.trim();
        setInterimTranscript(interim.trim());
      }

      if (finalized.trim()) {
        pendingTranscriptRef.current = `${pendingTranscriptRef.current} ${finalized}`.trim();
        interimTranscriptRef.current = '';
        setFinalTranscript(pendingTranscriptRef.current);
        setInterimTranscript('');
      }

      // Schedule flush on pause
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        flushTranscript();
      }, UTTERANCE_PAUSE_MS);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Browser speech recognition notice:', event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!shouldRestartRef.current || !isMicActive) return;
      try {
        recognition.start();
        setIsListening(true);
      } catch {
        // Will retry on next effect cycle
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.warn('Speech recognition start note:', err);
    }

    return () => {
      shouldRestartRef.current = false;
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      try {
        recognition.abort();
      } catch {}
      recognitionRef.current = null;
      setIsListening(false);
    };
  }, [flushTranscript, isMicActive, language]);

  return {
    isListening,
    interimTranscript,
    finalTranscript,
    flushTranscript,
    isSupported,
  };
}