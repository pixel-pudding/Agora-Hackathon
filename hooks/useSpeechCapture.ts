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
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
        console.warn('Microphone permission notice:', err);
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

  // Audio Recorder for server-side Whisper fallback
  const startRecordingAudio = useCallback(() => {
    if (!mediaStreamRef.current) return;
    try {
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(mediaStreamRef.current);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 1000) {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'speech.webm');
          try {
            const res = await fetch('/api/ai/transcribe', {
              method: 'POST',
              body: formData,
            });
            if (res.ok) {
              const data = (await res.json()) as { text?: string };
              if (data.text?.trim()) {
                callbackRef.current(data.text.trim());
              }
            }
          } catch (err) {
            console.warn('Audio transcription note:', err);
          }
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.warn('MediaRecorder start notice:', err);
    }
  }, []);

  const stopRecordingAudio = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Toggle speech / recording mode on user click
  const toggleListening = useCallback(() => {
    if (isRecording) {
      stopRecordingAudio();
    } else {
      startRecognition();
      startRecordingAudio();
    }
  }, [isRecording, startRecognition, startRecordingAudio, stopRecordingAudio]);

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
    isRecording,
    interimTranscript,
    finalTranscript,
    micLevel,
    hasMicPermission,
    isSupported,
    flushTranscript,
    startRecognition,
    startRecordingAudio,
    stopRecordingAudio,
    toggleListening,
  };
}