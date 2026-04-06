"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReading } from "@/context/ReadingProvider";

type LogEntry = {
  id: string;
  type: "partial" | "matched" | "noise" | "mispronounce" | "phrase";
  text: string;
  timestamp: number;
};

export function LiveVoiceLog() {
  const { wordProgress } = useReading();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef<LogEntry[]>([]);
  const phraseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = useCallback((entry: LogEntry) => {
    logsRef.current = [...logsRef.current.slice(-49), entry];
    setLogs([...logsRef.current]);
  }, []);

  useEffect(() => {
    if (wordProgress && wordProgress.charIndex > 0) {
      if (phraseTimeoutRef.current) {
        clearTimeout(phraseTimeoutRef.current);
      }
      
      const phrase = `[Heard]: char_idx=${wordProgress.charIndex}`;
      phraseTimeoutRef.current = setTimeout(() => {
        const entry: LogEntry = {
          id: `phrase-${Date.now()}-${Math.random()}`,
          type: "phrase",
          text: phrase,
          timestamp: Date.now(),
        };
        addLog(entry);
      }, 500);
    }
  }, [wordProgress, addLog]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fixed bottom-4 right-4 w-72 h-48 rounded-lg bg-black/90 border border-green-600/30 shadow-2xl overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-green-600/30 bg-green-900/20">
        <p className="text-xs font-mono text-green-400">Live Voice Log</p>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs text-green-400 space-y-0.5"
      >
        {logs.length === 0 && (
          <div className="text-green-700/50">Waiting for audio...</div>
        )}
        {logs.map((log) => {
          let colorClass = "text-green-400";
          let prefix = "> ";

          if (log.type === "matched") {
            colorClass = "text-green-300 font-bold";
            prefix = "✓ ";
          } else if (log.type === "mispronounce") {
            colorClass = "text-amber-400";
            prefix = "⚠ ";
          } else if (log.type === "noise") {
            colorClass = "text-gray-500";
            prefix = "~ ";
          } else if (log.type === "phrase") {
            colorClass = "text-cyan-400 font-semibold";
            prefix = "🎤 ";
          }

          return (
            <div key={log.id} className={`${colorClass} truncate`}>
              {prefix}
              {log.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
