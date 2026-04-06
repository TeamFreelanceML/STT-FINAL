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

function locateWordPosition(story: Story, globalIndex: number) {
  let g = 0;
  for (let paragraphIdx = 0; paragraphIdx < story.paragraphs.length; paragraphIdx += 1) {
    const paragraph = story.paragraphs[paragraphIdx];
    for (let sentenceIdx = 0; sentenceIdx < paragraph.sentences.length; sentenceIdx += 1) {
      const sentence = paragraph.sentences[sentenceIdx];
      for (let chunkIdx = 0; chunkIdx < sentence.chunks.length; chunkIdx += 1) {
        const words = sentence.chunks[chunkIdx].words;
        if (globalIndex < g + words.length) {
          return {
            currentParaIdx: paragraphIdx,
            currentSentIdx: sentenceIdx,
            currentChunkIdx: chunkIdx,
            wordPtr: globalIndex,
          };
        }
        g += words.length;
      }
    }
  }
  const lastParagraphIdx = Math.max(0, story.paragraphs.length - 1);
  const lastSentenceIdx = Math.max(0, story.paragraphs[lastParagraphIdx].sentences.length - 1);
  const lastChunkIdx = Math.max(0, story.paragraphs[lastParagraphIdx].sentences[lastSentenceIdx].chunks.length - 1);
  return {
    currentParaIdx: lastParagraphIdx,
    currentSentIdx: lastSentenceIdx,
    currentChunkIdx: lastChunkIdx,
    wordPtr: Math.max(0, globalIndex),
  };
}

/** HTTP: use Next rewrite `/api/backend/*` unless NEXT_PUBLIC_API_URL is set (direct to FastAPI). */
function httpApiPrefix(): string {
  const direct = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (direct) return direct;
  return "/api/backend";
}

/**
 * WebSocket must hit FastAPI directly (Next rewrites don’t apply). Default matches next.config BACKEND_URL (8005).
 */
function wsBase(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, "");
  }
  const direct = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (direct) return direct.replace(/^http/, "ws");
  return "ws://127.0.0.1:8005";
}

type ModalKind = "continue" | "recording" | null;

type WordResult = {
  status: "pending" | "current" | "correct" | "skipped" | "wrong" | "repeated";
  score?: number;
};

type SessionState = {
  currentParaIdx: number;
  currentSentIdx: number;
  currentChunkIdx: number;
  wordPtr: number;
};

type WordProgress = {
  matchedIndex: number;
  charIndex: number;
} | null;

type ReadingCtx = {
  story: Story;
  sessionId: string | null;
  sessionState: SessionState;
  wordResults: Record<number, WordResult>;
  wordProgress: WordProgress;
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
  const [sessionState, setSessionState] = useState<SessionState>({
    currentParaIdx: 0,
    currentSentIdx: 0,
    currentChunkIdx: 0,
    wordPtr: 0,
  });
  const [wordResults, setWordResults] = useState<Record<number, WordResult>>({});
  const [wordProgress, setWordProgress] = useState<WordProgress>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [evaluation, setEvaluation] = useState<unknown | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cleanupAudioRef = useRef<(() => void) | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const endSessionRemote = useCallback(async (reason: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const res = await fetch(`${httpApiPrefix()}/sessions/${sid}/end`, {
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
  }, [armWatchdog, clearTimers, isReading, sessionState.wordPtr]);

  const startReading = useCallback(async () => {
    setError(null);
    setEvaluation(null);
    stopReading();
    setSessionState({
      currentParaIdx: 0,
      currentSentIdx: 0,
      currentChunkIdx: 0,
      wordPtr: 0,
    });
    setWordResults({});
    setWordProgress(null);

    let sid: string;
    try {
      const res = await fetch(`${httpApiPrefix()}/sessions`, { method: "POST" });
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

      if (msg.type === "session_state") {
        setWordProgress(null);
        setSessionState(msg.state as SessionState);
      }

      if (msg.type === "word_progress") {
        const matchedIndex = msg.matched_index as number;
        setWordProgress({
          matchedIndex,
          charIndex: msg.char_index as number,
        });
        setSessionState(locateWordPosition(story, matchedIndex));
      }

      if (msg.type === "word_matched") {
        setWordProgress(null);
        const g = msg.global_word_index as number;
        setWordResults((prev) => ({
          ...prev,
          [g]: {
            status: "correct",
            score: msg.score as number,
          },
        }));
        const nextIndex = Math.min(countStoryWords(story) - 1, g + 1);
        setSessionState(locateWordPosition(story, nextIndex));
      }

      if (msg.type === "word_matched_bulk") {
        setWordProgress(null);
        const matches = (msg.matches as Array<{ global_word_index: number; score: number }>) || [];
        setWordResults((prev) => {
          const updated = { ...prev };
          matches.forEach((match) => {
            updated[match.global_word_index] = {
              status: "correct",
              score: match.score || 0.95,
            };
          });
          return updated;
        });
        if (matches.length > 0) {
          const lastMatch = Math.max(...matches.map((m) => m.global_word_index));
          const nextIndex = Math.min(countStoryWords(story) - 1, lastMatch + 1);
          setSessionState(locateWordPosition(story, nextIndex));
        }
      }

      if (msg.type === "chunk_advance") {
        setWordProgress(null);
      }

      if (msg.type === "assist_ack" && msg.skipped === true) {
        setWordProgress(null);
        const g = msg.global_word_index as number;
        setWordResults((prev) => ({
          ...prev,
          [g]: {
            status: "skipped",
          },
        }));
        const nextIndex = Math.min(countStoryWords(story) - 1, g + 1);
        setSessionState(locateWordPosition(story, nextIndex));
      }

      if (msg.type === "word_skipped") {
        setWordProgress(null);
        const g = msg.global_word_index as number;
        setWordResults((prev) => ({
          ...prev,
          [g]: {
            status: "skipped",
          },
        }));
        const nextIndex = Math.min(countStoryWords(story) - 1, g + 1);
        setSessionState(locateWordPosition(story, nextIndex));
      }

      if (msg.type === "mispronounce") {
        const g = msg.global_word_index as number;
        setWordResults((prev) => ({
          ...prev,
          [g]: {
            status: "wrong",
            score: msg.score as number,
          },
        }));
      }

      if (msg.type === "chunk_completed") {
        // Handled by subsequent session_state normally
        setWordProgress(null);
      }

      // Legacy word_matched support
      if (msg.type === "word_matched_legacy") {
        const g = msg.global_word_index as number;
        setWordResults((prev) => ({
          ...prev,
          [g]: { status: "correct" },
        }));
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
      sessionState,
      wordResults,
      wordProgress,
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
      sessionState,
      wordResults,
      wordProgress,
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
  const { story, sessionState } = useReading();
  const flat = flattenSentences(story);
  const target = sessionState.wordPtr;
  let g = 0;
  for (let si = 0; si < flat.length; si++) {
    const n = wordsInSentence(flat[si].sentence).length;
    if (target < g + n) return si;
    g += n;
  }
  return Math.max(0, flat.length - 1);
}

export function useReadingProgressHelpers() {
  const { story, sessionState, wordProgress } = useReading();
  const matchedLengthForWord = useCallback(
    (globalIndex: number, word: string) => {
      if (globalIndex < sessionState.wordPtr) return word.length;
      if (
        wordProgress &&
        wordProgress.matchedIndex === globalIndex &&
        globalIndex === sessionState.wordPtr
      ) {
        return Math.min(word.length, wordProgress.charIndex);
      }
      return 0;
    },
    [sessionState.wordPtr, wordProgress],
  );
  return {
    matchedLengthForWord,
    totalWords: countStoryWords(story),
  };
}
