'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const UTTERANCE_PAUSE_MS = 800;

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
  const [micLevel, setMicLevel] = useState(0);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const callbackRef = useRef(onUtteranceComplete);
  const shouldRestartRef = useRef(false);
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

  // Request browser microphone permission & setup local AudioContext analyzer
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    let isMounted = true;
    let animFrame: number;

    async function initAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        setHasMicPermission(true);

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkVolume = () => {
          if (!isMounted) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = Math.round((sum / dataArray.length / 255) * 100);
          setMicLevel(avg);
          animFrame = requestAnimationFrame(checkVolume);
        };
        animFrame = requestAnimationFrame(checkVolume);
      } catch (err) {
        console.warn('Microphone permission or audio analyzer notice:', err);
        if (isMounted) setHasMicPermission(false);
      }
    }

    if (isMicActive) {
      initAudio();
    }

    return () => {
      isMounted = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isMicActive]);

  // Start continuous Web Speech Recognition
  const startRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as SpeechRecognitionWindow)
      .SpeechRecognition ?? (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;
      shouldRestartRef.current = true;

      recognition.onresult = (event) => {
        if (isBotSpeakingRef.current) return;
        let interim = '';
        let finalized = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
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

        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = setTimeout(() => {
          flushTranscript();
        }, UTTERANCE_PAUSE_MS);
      };

      recognition.onerror = (event) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.warn('SpeechRecognition notice:', event.error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (shouldRestartRef.current && isMicActive && !isBotSpeakingRef.current) {
          try {
            recognition.start();
            setIsListening(true);
          } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.warn('Could not start SpeechRecognition:', err);
      setIsListening(false);
    }
  }, [flushTranscript, isMicActive, language]);

  useEffect(() => {
    if (isMicActive && !isBotSpeaking) {
      startRecognition();
    } else {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      setIsListening(false);
    }

    return () => {
      shouldRestartRef.current = false;
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      setIsListening(false);
    };
  }, [isMicActive, isBotSpeaking, startRecognition]);

  return {
    isListening,
    interimTranscript,
    finalTranscript,
    micLevel,
    hasMicPermission,
    isSupported,
    flushTranscript,
    startRecognition,
  };
}