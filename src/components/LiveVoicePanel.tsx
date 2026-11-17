import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import {
  base64Int16ToFloat32,
  computeRmsLevel,
  float32ToInt16Base64,
  LIVE_INPUT_SAMPLE_RATE,
  LIVE_OUTPUT_SAMPLE_RATE,
} from '../lib/liveAudio';

interface VoiceTranscriptEntry {
  id: string;
  speaker: 'you' | 'assistant';
  text: string;
}

type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export function LiveVoicePanel() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<VoiceTranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const isLiveRef = useRef(false);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const stopPlaybackQueue = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setAssistantSpeaking(false);
  };

  const cleanupSession = () => {
    isLiveRef.current = false;
    stopPlaybackQueue();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      processorRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    setMicLevel(0);
  };

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, []);

  const schedulePcmPlayback = (base64Pcm: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const samples = base64Int16ToFloat32(base64Pcm);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, LIVE_OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);
    setAssistantSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setAssistantSpeaking(false);
      }
    };

    source.start(startAt);
  };

  const appendTranscript = (speaker: 'you' | 'assistant', chunk: string) => {
    const clean = chunk.trim();
    if (!clean) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} ${clean}`.trim() },
        ];
      }
      return [...prev.slice(-11), { id: `vt-${Date.now()}-${Math.random()}`, speaker, text: clean }];
    });
  };

  async function handleStartVoice() {
    if (status === 'connecting' || status === 'live') return;
    setErrorMessage(null);
    setStatus('connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser microphone capture is not supported in this context.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: LIVE_INPUT_SAMPLE_RATE });
      const outputCtx = new AudioContext({ sampleRate: LIVE_OUTPUT_SAMPLE_RATE });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            audio?: string;
            text?: string;
            message?: string;
          };

          if (msg.type === 'ready') {
            isLiveRef.current = true;
            setStatus('live');
          } else if (msg.type === 'audio' && msg.audio) {
            schedulePcmPlayback(msg.audio);
          } else if (msg.type === 'inputTranscript' && msg.text) {
            appendTranscript('you', msg.text);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            appendTranscript('assistant', msg.text);
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
          } else if (msg.type === 'error' && msg.message) {
            setErrorMessage(msg.message);
            setStatus('error');
            cleanupSession();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMessage('Voice connection closed unexpectedly.');
        setStatus('error');
        cleanupSession();
      };

      ws.onclose = () => {
        if (isLiveRef.current) {
          setStatus('idle');
        }
        cleanupSession();
      };

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (audioEvent) => {
        const socket = wsRef.current;
        if (!isLiveRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;
        const inputSamples = audioEvent.inputBuffer.getChannelData(0);
        setMicLevel(computeRmsLevel(inputSamples));
        const base64 = float32ToInt16Base64(inputSamples);
        socket.send(JSON.stringify({ audio: base64 }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to start live voice conversation.'
      );
      setStatus('error');
      cleanupSession();
    }
  }

  function handleStopVoice() {
    cleanupSession();
    setStatus('idle');
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Real-Time Voice Scheduling Helper
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Speak naturally to check open appointment slots, clinic hours, or visit types (non-diagnostic).
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {status === 'live' || status === 'connecting' ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleStopVoice}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap"
            >
              <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{status === 'connecting' ? 'Cancel connection' : 'Stop voice session'}</span>
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => void handleStartVoice()}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Start live voice</span>
            </motion.button>
          )}
        </div>
      </div>

      {status === 'live' && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/70 dark:bg-teal-950/40 px-4 py-2.5">
          <div className="flex items-center gap-2.5 text-xs font-medium text-teal-900 dark:text-teal-200">
            <motion.span
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="h-2.5 w-2.5 rounded-full bg-teal-600 dark:bg-teal-400"
              aria-hidden="true"
            />
            <span>
              {assistantSpeaking
                ? 'CareSignal assistant is speaking...'
                : 'Listening via microphone (16kHz PCM)...'}
            </span>
          </div>
          <div
            aria-label="Microphone audio input level"
            className="h-2 w-24 overflow-hidden rounded-full bg-teal-200 dark:bg-teal-900"
          >
            <div
              className="h-full bg-teal-700 dark:bg-teal-400 transition-all duration-75"
              style={{ width: `${Math.min(100, Math.round(micLevel * 220))}%` }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
        >
          {errorMessage}
        </div>
      )}

      {transcripts.length > 0 && (
        <div className="mt-4 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3">
          {transcripts.map((entry) => (
            <div key={entry.id} className="text-xs leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {entry.speaker === 'you' ? 'You: ' : 'Assistant: '}
              </span>
              <span className="text-slate-700 dark:text-slate-300">{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
