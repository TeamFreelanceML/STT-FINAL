"use client";

import { useReading } from "@/context/ReadingProvider";
import { ReadingView } from "@/components/ReadingView";
import { SessionModals } from "@/components/SessionModals";
import { LiveVoiceLog } from "@/components/LiveVoiceLog";

export function ReadingSession() {
  const {
    story,
    sessionId,
    isReading,
    error,
    evaluation,
    startReading,
    stopReading,
    requestSessionEnd,
  } = useReading();

  const handleStop = async () => {
    stopReading();
    await requestSessionEnd("user_stop");
  };

  return (
    <div className="flex w-full flex-col gap-8 px-4 py-10">
      <header className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {story.title ?? "Guided reading"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Session:{" "}
            <code className="text-xs">{sessionId ?? "— create with Start"}</code>
          </p>
          <p className="mt-1 max-w-xl text-xs text-zinc-500 dark:text-zinc-400">
            Live track: CPU-friendly stub (Sherpa-ONNX + Silero VAD ready).
            Post-session judge: Faster-Whisper hook. Watchdog: 6s / 12s assist,
            18s / 36s prompts, 42s evaluation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startReading()}
            disabled={isReading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Start Reading
          </button>
          <button
            type="button"
            onClick={() => void handleStop()}
            disabled={!isReading}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Stop
          </button>
        </div>
      </header>

      {error ? (
        <p className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <ReadingView />

      {evaluation ? (
        <section className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
            Session evaluation (4 JSON bundles)
          </h2>
          <pre className="mt-2 max-h-96 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
            {JSON.stringify(evaluation, null, 2)}
          </pre>
        </section>
      ) : null}

      <SessionModals />

      {isReading && <LiveVoiceLog />}
    </div>
  );
}
