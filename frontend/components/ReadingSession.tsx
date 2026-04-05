"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import storyData from "@/data/story.json";
import type { Story } from "@/types/story";
import { flattenSentences } from "@/lib/story";
import { ReadingView } from "@/components/ReadingView";

const story = storyData as Story;

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

function wsUrlForSession(sessionId: string): string {
  const base =
    process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ??
    "ws://127.0.0.1:8000";
  return `${base}/ws/stream/${sessionId}`;
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Math.random().toString(36).slice(2)}`;
}

export function ReadingSession() {
  const [sessionId] = useState(newSessionId);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const sentenceCount = flattenSentences(story).length;
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const stopReading = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsReading(false);
  }, []);

  const startReading = useCallback(async () => {
    setError(null);
    stopReading();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16_000,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access failed");
      return;
    }

    const ws = new WebSocket(wsUrlForSession(sessionId));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("WebSocket connection failed"));
      });
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      ws.close();
      wsRef.current = null;
      setError(e instanceof Error ? e.message : "WebSocket error");
      return;
    }

    const audioContext = new AudioContext({ sampleRate: 16_000 });
    const source = audioContext.createMediaStreamSource(stream);

    const gain = audioContext.createGain();
    gain.gain.value = 0;

    // ScriptProcessor is widely supported; swap for AudioWorklet when we need lower latency.
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      const pcm = floatTo16BitPCM(input);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcm);
      }
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioContext.destination);

    cleanupRef.current = () => {
      processor.disconnect();
      gain.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void audioContext.close();
    };

    setIsReading(true);
  }, [sessionId, stopReading]);

  useEffect(() => {
    return () => stopReading();
  }, [stopReading]);

  return (
    <div className="flex w-full flex-col gap-8 px-4 py-10">
      <header className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {story.title ?? "Guided reading"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Session: <code className="text-xs">{sessionId}</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startReading}
            disabled={isReading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Start Reading
          </button>
          <button
            type="button"
            onClick={stopReading}
            disabled={!isReading}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Stop
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
              onClick={() =>
                setActiveSentenceIndex((i) => Math.max(0, i - 1))
              }
            >
              Prev sentence
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
              onClick={() =>
                setActiveSentenceIndex((i) =>
                  Math.min(sentenceCount - 1, i + 1),
                )
              }
            >
              Next sentence
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <p className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <ReadingView
        story={story}
        active_sentence_index={activeSentenceIndex}
      />
    </div>
  );
}
