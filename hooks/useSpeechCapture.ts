'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const UTTERANCE_PAUSE_MS = 1500;

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
  agoraTranscriptionAvailable?: boolean;
  agoraSpeech?: AgoraSpeechUpdate | null;
  language?: string;
  onUtteranceComplete: (text: string) => void;
};

export function useSpeechCapture({
  isMicActive,
  isVadActive = true,
  agoraTranscriptionAvailable = false,
  agoraSpeech,
  language = 'en-US',
  onUtteranceComplete,
}: UseSpeechCaptureOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const callbackRef = useRef(onUtteranceComplete);
  const shouldRestartRef = useRef(false);
  const lastAgoraIdRef = useRef<string | null>(null);

  const flushTranscript = useCallback(() => {
    const text = `${pendingTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
    pendingTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    setInterimTranscript('');
    if (text) callbackRef.current(text);
    return text;
  }, []);

  useEffect(() => {
    callbackRef.current = onUtteranceComplete;
  }, [onUtteranceComplete]);

  useEffect(() => {
    if (!agoraSpeech || !agoraSpeech.text.trim()) return;
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
    } else {
      interimTranscriptRef.current = text;
      setInterimTranscript(text);
    }
  }, [agoraSpeech]);

  useEffect(() => {
    if (!isMicActive || !isVadActive || !agoraTranscriptionAvailable || !agoraSpeech?.isFinal) {
      return;
    }

    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => {
      flushTranscript();
    }, UTTERANCE_PAUSE_MS);

    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, [agoraSpeech, agoraTranscriptionAvailable, flushTranscript, isMicActive, isVadActive]);

  useEffect(() => {
    if (!isMicActive || !isVadActive || agoraTranscriptionAvailable || typeof window === 'undefined') {
      shouldRestartRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as SpeechRecognitionWindow)
      .SpeechRecognition ?? (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    shouldRestartRef.current = true;

    recognition.onresult = (event) => {
      let interim = '';
      let finalized = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalized += text;
        else interim += text;
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

      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        flushTranscript();
      }, UTTERANCE_PAUSE_MS);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Browser speech recognition unavailable:', event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!shouldRestartRef.current) return;
      try {
        recognition.start();
      } catch {
        shouldRestartRef.current = false;
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      shouldRestartRef.current = false;
      setIsListening(false);
    }

    return () => {
      shouldRestartRef.current = false;
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      try {
        recognition.stop();
      } catch {
        // The browser can throw when recognition has already ended.
      }
      recognitionRef.current = null;
      setIsListening(false);
    };
  }, [agoraTranscriptionAvailable, flushTranscript, isMicActive, isVadActive, language]);

  return { isListening, interimTranscript, finalTranscript, flushTranscript };
}