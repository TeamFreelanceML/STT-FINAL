"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import storyData from "@/data/story.json";
import {
  floatTo16BitPCM,
  resampleLinear,
  TARGET_SAMPLE_RATE,
  workletModuleUrl,
} from "@/lib/audioPcm";
import { countStoryWords, flattenSentences, wordsInSentence } from "@/lib/story";
import type { Story } from "@/types/story";

const story = storyData as Story;

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8000"
  );
}

function wsBase(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, "");
  }
  return apiBase().replace(/^http/, "ws");
}

type ModalKind = "continue" | "recording" | null;

type ReadingCtx = {
  story: Story;
  sessionId: string | null;
  lastMatchedGlobal: number;
  charMatched: number;
  isReading: boolean;
  error: string | null;
  modal: ModalKind;
  evaluation: unknown | null;
  startReading: () => Promise<void>;
  stopReading: () => void;
  /** POST /sessions/:id/end — call after stopReading() to fetch 4-JSON evaluation */
  requestSessionEnd: (reason: string) => Promise<void>;
  modalContinue: (yes: boolean) => void;
};

const Ctx = createContext<ReadingCtx | null>(null);

export function useReading(): ReadingCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReading requires ReadingProvider");
  return v;
}

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMatchedGlobal, setLastMatchedGlobal] = useState(-1);
  const [charMatched, setCharMatched] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [evaluation, setEvaluation] = useState<unknown | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const lastMatchedRef = useRef(-1);
  const wsRef = useRef<WebSocket | null>(null);
  const cleanupAudioRef = useRef<(() => void) | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    lastMatchedRef.current = lastMatchedGlobal;
  }, [lastMatchedGlobal]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const endSessionRemote = useCallback(async (reason: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const res = await fetch(`${apiBase()}/sessions/${sid}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      setEvaluation(json);
    } catch {
      setEvaluation({ error: "evaluation_fetch_failed" });
    }
  }, []);

  const stopReading = useCallback(() => {
    clearTimers();
    cleanupAudioRef.current?.();
    cleanupAudioRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsReading(false);
    setModal(null);
  }, [clearTimers]);

  const sendAssist = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ASSIST_REQ", reason: "watchdog" }));
  }, []);

  const armWatchdog = useCallback(() => {
    clearTimers();
    if (!isReading) return;
    const t = (ms: number, fn: () => void) => {
      timersRef.current.push(setTimeout(fn, ms));
    };
    t(6_000, sendAssist);
    t(12_000, sendAssist);
    t(18_000, () => setModal("continue"));
    t(36_000, () => setModal("recording"));
    t(42_000, async () => {
      await endSessionRemote("watchdog_42");
      stopReading();
    });
  }, [clearTimers, endSessionRemote, isReading, sendAssist, stopReading]);

  useEffect(() => {
    if (isReading) armWatchdog();
    return () => clearTimers();
  }, [armWatchdog, clearTimers, isReading, lastMatchedGlobal]);

  const startReading = useCallback(async () => {
    setError(null);
    setEvaluation(null);
    stopReading();
    lastMatchedRef.current = -1;
    setLastMatchedGlobal(-1);
    setCharMatched(0);

    let sid: string;
    try {
      const res = await fetch(`${apiBase()}/sessions`, { method: "POST" });
      if (!res.ok) throw new Error(`sessions ${res.status}`);
      const data = (await res.json()) as { session_id: string };
      sid = data.session_id;
      sessionIdRef.current = sid;
      setSessionId(sid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "session start failed");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: { ideal: TARGET_SAMPLE_RATE },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone failed");
      return;
    }

    const ws = new WebSocket(`${wsBase()}/ws/read/${sid}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("WebSocket failed"));
      });
    } catch (e) {
      stream.getTracks().forEach((tr) => tr.stop());
      ws.close();
      wsRef.current = null;
      setError(e instanceof Error ? e.message : "WebSocket error");
      return;
    }

    ws.onmessage = async (ev) => {
      if (typeof ev.data !== "string") return;
      const msg = JSON.parse(ev.data) as Record<string, unknown>;
      if (msg.type === "word_matched") {
        const g = msg.global_word_index as number;
        lastMatchedRef.current = g;
        setLastMatchedGlobal(g);
        setCharMatched(0);
      }
      if (msg.type === "word_char_progress") {
        const g = msg.global_word_index as number;
        if (g === lastMatchedRef.current + 1) {
          setCharMatched(msg.matched_chars as number);
        }
      }
      if (msg.type === "assist_ack" && msg.skipped) {
        const g = msg.global_word_index as number;
        lastMatchedRef.current = g;
        setLastMatchedGlobal(g);
        setCharMatched(0);
        if (msg.tts_url) {
          const url = new URL(msg.tts_url as string, apiBase()).href;
          try {
            const a = new Audio(url);
            void a.play();
          } catch {
            speechSynthesis.speak(
              new SpeechSynthesisUtterance("Let me help with this word."),
            );
          }
        }
      }
    };

    const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    await audioContext.resume();
    await audioContext.audioWorklet.addModule(workletModuleUrl());
    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    const gain = audioContext.createGain();
    gain.gain.value = 0;

    workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const raw = ev.data;
      if (!(raw instanceof Float32Array) || raw.length === 0) return;
      const at16k = resampleLinear(raw, audioContext.sampleRate, TARGET_SAMPLE_RATE);
      const pcm = floatTo16BitPCM(at16k);
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
    };

    source.connect(workletNode);
    workletNode.connect(gain);
    gain.connect(audioContext.destination);

    cleanupAudioRef.current = () => {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
      gain.disconnect();
      source.disconnect();
      stream.getTracks().forEach((tr) => tr.stop());
      void audioContext.close();
    };

    setIsReading(true);
  }, [stopReading]);

  const modalContinue = useCallback(
    (yes: boolean) => {
      setModal(null);
      if (!yes) {
        stopReading();
        void endSessionRemote("user_declined");
        return;
      }
      armWatchdog();
    },
    [armWatchdog, endSessionRemote, stopReading],
  );

  useEffect(() => () => stopReading(), [stopReading]);

  const value = useMemo<ReadingCtx>(
    () => ({
      story,
      sessionId,
      lastMatchedGlobal,
      charMatched,
      isReading,
      error,
      modal,
      evaluation,
      startReading,
      stopReading,
      requestSessionEnd: endSessionRemote,
      modalContinue,
    }),
    [
      sessionId,
      lastMatchedGlobal,
      charMatched,
      isReading,
      error,
      modal,
      evaluation,
      startReading,
      stopReading,
      endSessionRemote,
      modalContinue,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTargetSentenceIndex(): number {
  const { story, lastMatchedGlobal } = useReading();
  const flat = flattenSentences(story);
  const target = lastMatchedGlobal + 1;
  let g = 0;
  for (let si = 0; si < flat.length; si++) {
    const n = wordsInSentence(flat[si].sentence).length;
    if (target < g + n) return si;
    g += n;
  }
  return Math.max(0, flat.length - 1);
}

export function useReadingProgressHelpers() {
  const { story, lastMatchedGlobal, charMatched } = useReading();
  const matchedLengthForWord = useCallback(
    (globalIndex: number, word: string) => {
      if (globalIndex <= lastMatchedGlobal) return word.length;
      if (globalIndex === lastMatchedGlobal + 1)
        return Math.min(word.length, charMatched);
      return 0;
    },
    [charMatched, lastMatchedGlobal],
  );
  return {
    matchedLengthForWord,
    totalWords: countStoryWords(story),
  };
}
