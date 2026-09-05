'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const UTTERANCE_PAUSE_MS = 1000;

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
  message?: string;
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
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const [micErrorDetails, setMicErrorDetails] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

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

  // Query browser permission status if supported
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.permissions?.query) return;
    try {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((status) => {
        setPermissionState(status.state);
        if (status.state === 'granted') setHasMicPermission(true);
        if (status.state === 'denied') {
          setHasMicPermission(false);
          setMicErrorDetails('Microphone is blocked in browser site settings.');
        }
        status.onchange = () => {
          setPermissionState(status.state);
          if (status.state === 'granted') {
            setHasMicPermission(true);
            setMicErrorDetails(null);
          } else if (status.state === 'denied') {
            setHasMicPermission(false);
            setMicErrorDetails('Microphone is blocked in browser site settings.');
          }
        };
      }).catch(() => {});
    } catch {}
  }, []);

  // Flush and dispatch accumulated transcript
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

  // Ensure microphone MediaStream is active
  const ensureMediaStream = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicErrorDetails('Browser does not support mediaDevices.getUserMedia. Please use Chrome or Edge.');
      setHasMicPermission(false);
      return null;
    }

    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      return mediaStreamRef.current;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      setHasMicPermission(true);
      setPermissionState('granted');
      setMicErrorDetails(null);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !audioContextRef.current) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!mediaStreamRef.current?.active) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = Math.round((sum / dataArray.length / 255) * 100);
          setMicLevel(avg);
          requestAnimationFrame(checkVolume);
        };
        requestAnimationFrame(checkVolume);
      }

      return stream;
    } catch (err: unknown) {
      const errName = (err as Error)?.name || 'Error';
      const errMsg = (err as Error)?.message || String(err);
      console.warn('Microphone permission request error:', errName, errMsg);
      setHasMicPermission(false);
      setPermissionState('denied');

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setMicErrorDetails(
          'Microphone permission was denied. Click the site settings icon (tune/lock) in the URL bar and select "Allow" for Microphone, then reload.',
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setMicErrorDetails('No microphone hardware detected on your device.');
      } else {
        setMicErrorDetails(`Microphone access error: ${errMsg}`);
      }
      return null;
    }
  }, []);

  // Request browser microphone permission on mount or when mic is active
  useEffect(() => {
    if (isMicActive) {
      ensureMediaStream();
    }
  }, [isMicActive, ensureMediaStream]);

  // Start continuous Web Speech Recognition
  const startRecognition = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // First ensure we have audio stream / mic permission
    const stream = await ensureMediaStream();
    if (!stream) return;

    const SpeechRecognition =
      (window as SpeechRecognitionWindow).SpeechRecognition ??
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setStatusMessage('SpeechRecognition API not supported in this browser. Please use Google Chrome or type directly.');
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
          console.warn('SpeechRecognition error:', event.error);
          setStatusMessage(`Speech Recognition: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (shouldRestartRef.current && !isBotSpeakingRef.current) {
          try {
            recognition.start();
            setIsListening(true);
          } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      setStatusMessage('Listening...');
    } catch (err) {
      console.warn('Could not start SpeechRecognition:', err);
      setIsListening(false);
    }
  }, [ensureMediaStream, flushTranscript, language]);

  // Audio Recorder for server-side Whisper fallback
  const startRecordingAudio = useCallback(async () => {
    const stream = await ensureMediaStream();
    if (!stream) return;
    try {
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
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
  }, [ensureMediaStream]);

  const stopRecordingAudio = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Toggle speech / recording mode on user click
  const toggleListening = useCallback(async () => {
    if (isRecording || isListening) {
      // User tapped Stop & Send
      shouldRestartRef.current = false;
      const text = flushTranscript();
      stopRecordingAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      setIsRecording(false);
      setStatusMessage('');
    } else {
      // User tapped Tap to Speak
      await startRecognition();
      await startRecordingAudio();
    }
  }, [flushTranscript, isListening, isRecording, startRecognition, startRecordingAudio, stopRecordingAudio]);

  useEffect(() => {
    if (isMicActive && !isBotSpeaking) {
      startRecognition();
    } else if (!isMicActive) {
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
    permissionState,
    micErrorDetails,
    isSupported,
    statusMessage,
    flushTranscript,
    ensureMediaStream,
    startRecognition,
    startRecordingAudio,
    stopRecordingAudio,
    toggleListening,
  };
}