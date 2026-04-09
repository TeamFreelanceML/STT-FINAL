"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle,
  FileAudio,
  RotateCcw,
  XCircle,
  Zap,
} from "lucide-react";

interface ChunkIssueWord {
  word: string;
  spoken_word?: string | null;
  chunk_id: string;
  paragraph_id: string;
}

interface InsertedWord {
  word: string;
  start?: number | null;
  end?: number | null;
  chunk_id?: string | null;
  paragraph_id?: string | null;
}

interface ChunkWordComparison {
  type: "expected_word" | "extra_word" | "repeated_word";
  word: string;
  spoken_word?: string | null;
  status: string;
  start?: number | null;
  end?: number | null;
}

interface ChunkReport {
  chunk_id: string;
  paragraph_id: string;
  expected_text: string;
  user_read_text: string;
  word_comparison: ChunkWordComparison[];
  status: "correct" | "mistakeful";
  mistake_reasons: string[];
  extra_words_near_chunk?: string[];
  repeated_words_near_chunk?: string[];
}

interface ParagraphReport {
  paragraph_id: string;
  total_chunks: number;
  chunks: ChunkReport[];
}

interface FormulaDetails {
  formula: string;
  computed_score: number;
  [key: string]: string | number | string[] | object[] | undefined;
}

interface EvaluationResult {
  accuracy_score?: number;
  wcpm?: number;
  chunking_score?: number;
  total_words?: number;
  correct_words?: number;
  valid_spoken_words?: number;
  duration_seconds?: number;
  wrong_word_map?: ChunkIssueWord[];
  skipped_word_map?: ChunkIssueWord[];
  extra_word_map?: InsertedWord[];
  repeated_word_map?: InsertedWord[];
  paragraph_reports?: ParagraphReport[];
  accuracy_details?: FormulaDetails;
  wcpm_details?: FormulaDetails;
  chunking_details?: FormulaDetails & {
    mistaken_chunk_ids?: string[];
    boundary_violations?: Array<{
      from_chunk_id: string;
      to_chunk_id: string;
      gap_seconds: number;
    }>;
  };
}

function ScoreProofCard({
  title,
  icon,
  accentClass,
  value,
}: {
  title: string;
  icon: React.ReactNode;
  accentClass: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-[#1E293B] bg-[linear-gradient(180deg,rgba(19,26,42,0.98),rgba(11,15,25,0.98))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur">
      <div className="flex items-center gap-3 text-slate-300">
        <div className={accentClass}>{icon}</div>
        <div className="text-sm font-bold tracking-[0.2em] uppercase">{title}</div>
      </div>
      <div className="mt-8 text-5xl font-black tracking-tight text-white">{value}</div>
    </div>
  );
}

function ScoreDetailsPanel({
  title,
  details,
}: {
  title: string;
  details?: FormulaDetails;
}) {
  if (!details) return null;

  const detailEntries = Object.entries(details).filter(
    ([key]) => key !== "formula" && key !== "computed_score"
  );

  const labelMap: Record<string, string> = {
    correct_story_words: "Correct story words",
    total_story_words: "Total story words",
    valid_spoken_words: "Valid spoken words",
    total_reading_seconds: "Total reading seconds",
    correct_chunks: "Correct chunks",
    total_chunks: "Total chunks",
    mistaken_chunk_ids: "Mistaken chunks",
    boundary_violations: "Chunk boundary mistakes",
  };

  const formatValue = (key: string, value: string | number | string[] | object[] | undefined) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return "None";
      if (key === "mistaken_chunk_ids") return `${value.length} chunk(s) marked mistakeful`;
      if (key === "boundary_violations") return `${value.length} boundary issue(s) found`;
      return `${value.length} item(s)`;
    }
    return String(value);
  };

  return (
    <div className="rounded-2xl border border-[#243149] bg-[#0B0F19] p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
        {title}
      </div>
      <div className="mt-3 rounded-xl border border-[#1E293B] bg-[#131A2A] p-4 text-sm text-slate-100">
        {details.formula}
      </div>
      <div className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
          Final result
        </div>
        <div className="mt-2 text-2xl font-black text-white">
          {details.computed_score}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {detailEntries.map(([key, detailValue]) => (
          <div
            key={key}
            className="rounded-xl border border-[#1E293B] bg-[#131A2A] p-4"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {labelMap[key] || key.replace(/_/g, " ")}
            </div>
            <div className="mt-2 text-base font-bold text-white break-words">
              {formatValue(key, detailValue)}
            </div>
            {Array.isArray(detailValue) && detailValue.length > 0 && (
              <div className="mt-3 rounded-lg border border-[#243149] bg-[#0B0F19] p-3 text-sm text-slate-300">
                {key === "mistaken_chunk_ids" ? (
                  <div className="flex flex-wrap gap-2">
                    {detailValue.map((item, index) => (
                      <span
                        key={`${key}-${index}`}
                        className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-200"
                      >
                        {String(item)}
                      </span>
                    ))}
                  </div>
                ) : key === "boundary_violations" ? (
                  <div className="space-y-2">
                    {detailValue.map((item, index) => {
                      const violation = item as {
                        from_chunk_id: string;
                        to_chunk_id: string;
                        gap_seconds: number;
                      };
                      return (
                        <div
                          key={`${key}-${index}`}
                          className="rounded-lg border border-[#243149] bg-[#131A2A] px-3 py-2"
                        >
                          Gap between `{violation.from_chunk_id}` and `{violation.to_chunk_id}` was{" "}
                          <span className="font-bold text-white">{violation.gap_seconds}s</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  accent,
  icon,
}: {
  title: string;
  value: number;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#1E293B] bg-[#131A2A] p-5">
      <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] ${accent}`}>
        {icon}
        {title}
      </div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {description ? <p className="mt-2 text-sm text-slate-400">{description}</p> : null}
      </div>
    </div>
  );
}

function getWordStyle(status: string) {
  switch (status) {
    case "correct":
    case "acceptable_variant":
      return "bg-emerald-500/12 text-emerald-300 border border-emerald-500/20";
    case "mispronounced":
      return "bg-red-500/12 text-red-300 border border-red-500/20";
    case "skipped":
      return "bg-slate-700/40 text-slate-400 line-through border border-slate-600/40";
    case "extra":
      return "bg-cyan-500/12 text-cyan-300 border border-cyan-500/20";
    case "repeated":
      return "bg-orange-500/12 text-orange-300 border border-orange-500/20";
    case "unclear_audio":
      return "bg-violet-500/12 text-violet-300 border border-violet-500/20";
    default:
      return "bg-slate-800/70 text-slate-200 border border-slate-700/50";
  }
}

function getUserReadTokenLabel(item: ChunkWordComparison) {
  if (item.type === "expected_word") {
    if (item.status === "skipped") return item.word;
    return item.spoken_word || item.word;
  }

  return item.word;
}

function buildUserReadDisplay(items: ChunkWordComparison[]) {
  const spokenItems = items
    .filter((item) => item.type === "expected_word" && item.status !== "skipped")
    .sort((a, b) => {
      const aStart = a.start ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.start ?? Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    });

  const skippedItems = items.filter(
    (item) => item.type === "expected_word" && item.status === "skipped"
  );

  return [...spokenItems, ...skippedItems];
}

export default function ResultsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<EvaluationResult | null>(null);

  useEffect(() => {
    setMounted(true);
    const stored =
      sessionStorage.getItem("latest_evaluation") ||
      sessionStorage.getItem("evaluationData");
    if (!stored) return;
    try {
      setData(JSON.parse(stored));
    } catch (err) {
      console.error("Parse Error:", err);
    }
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center text-white text-2xl font-bold">
        Loading report...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen bg-[#0B0F19] items-center justify-center text-white">
        <div className="rounded-3xl border border-[#1E293B] bg-[#131A2A] p-10 flex flex-col items-center">
          <h2 className="text-2xl font-bold mb-6 tracking-wide">No Report Data</h2>
          <button
            onClick={() => router.push("/")}
            className="mt-4 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full transition-all flex items-center gap-2"
          >
            <Activity size={20} />
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const wrongWords = data.wrong_word_map || [];
  const skippedWords = data.skipped_word_map || [];
  const extraWords = data.extra_word_map || [];
  const repeatedWords = data.repeated_word_map || [];
  const paragraphReports = data.paragraph_reports || [];

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top,#172554_0%,#0B0F19_34%,#0B0F19_100%)] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6 lg:px-8">
        <div className="sticky top-4 z-20 rounded-3xl border border-white/10 bg-[#0B0F19]/88 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.26em] text-blue-300">
                Reading Analysis
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
                Evaluation Report
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-400">
                Review each paragraph and every chunk inside it. The report pairs
                the expected chunk with the student-read chunk and keeps long
                sections contained with scrollable panels.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push("/")}
                className="rounded-full border border-slate-700 bg-[#131A2A] px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-[#1B2438]"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ScoreProofCard
              title="Accuracy"
              icon={<CheckCircle size={20} />}
              accentClass="text-emerald-400"
              value={`${data.accuracy_score || 0}%`}
            />
            <ScoreProofCard
              title="Reading Speed"
              icon={<Zap size={20} />}
              accentClass="text-indigo-400"
              value={`${data.wcpm || 0} WCPM`}
            />
            <ScoreProofCard
              title="Chunking Score"
              icon={<BookOpen size={20} />}
              accentClass="text-blue-400"
              value={`${data.chunking_score || 0}%`}
            />
          </div>

          <div className="rounded-3xl border border-[#1E293B] bg-[#131A2A]/95 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <SectionHeader
              title="Quick Totals"
              description="High-level counts for the four evaluation JSON groups."
            />
            <div className="mt-5 grid grid-cols-2 gap-4">
              <SummaryCard
                title="Wrong Words"
                value={wrongWords.length}
                accent="text-red-300"
                icon={<AlertCircle size={16} />}
              />
              <SummaryCard
                title="Skipped Words"
                value={skippedWords.length}
                accent="text-slate-300"
                icon={<XCircle size={16} />}
              />
              <SummaryCard
                title="Extra Words"
                value={extraWords.length}
                accent="text-cyan-300"
                icon={<FileAudio size={16} />}
              />
              <SummaryCard
                title="Repeated Words"
                value={repeatedWords.length}
                accent="text-orange-300"
                icon={<RotateCcw size={16} />}
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[#1E293B] bg-[#131A2A]/95 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
          <SectionHeader
            title="How Scores Were Calculated"
            description="Each score shows its formula and the exact values used to compute it."
          />
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ScoreDetailsPanel title="Accuracy Proof" details={data.accuracy_details} />
            <ScoreDetailsPanel title="Reading Speed Proof" details={data.wcpm_details} />
            <ScoreDetailsPanel title="Chunking Proof" details={data.chunking_details} />
          </div>
        </div>

        <div className="rounded-3xl border border-[#1E293B] bg-[#131A2A]/95 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
          <SectionHeader
            title="Chunk-by-Chunk Report"
            description="Each paragraph shows its total chunks. Every chunk compares the actual chunk with what the student read."
          />

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-300">Correct</span>
            <span className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-red-300">Mispronounced</span>
            <span className="rounded-full border border-slate-600/40 bg-slate-700/30 px-3 py-1 text-slate-300">Skipped</span>
            <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-cyan-300">Extra</span>
            <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-orange-300">Repeated</span>
          </div>

          <div className="mt-6 max-h-[980px] space-y-8 overflow-y-auto pr-2">
            {paragraphReports.map((paragraph) => (
              <section
                key={paragraph.paragraph_id}
                className="rounded-3xl border border-[#243149] bg-[#0B0F19] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                      Paragraph Summary
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-white">
                      {paragraph.paragraph_id.replace("_", " ").toUpperCase()}
                    </h3>
                  </div>
                  <div className="rounded-full border border-[#243149] bg-[#131A2A] px-4 py-2 text-sm text-slate-300">
                    Total chunks: <span className="font-bold text-white">{paragraph.total_chunks}</span>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {paragraph.chunks.map((chunk) => (
                    <article
                      key={chunk.chunk_id}
                      className={`rounded-2xl border p-5 ${
                        chunk.status === "mistakeful"
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-emerald-500/20 bg-emerald-500/5"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-base font-bold text-white">
                          {paragraph.paragraph_id} -&gt; {chunk.chunk_id}
                        </div>
                        <div
                          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${
                            chunk.status === "mistakeful"
                              ? "bg-amber-500/15 text-amber-200"
                              : "bg-emerald-500/15 text-emerald-200"
                          }`}
                        >
                          {chunk.status}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-[#243149] bg-[#131A2A] p-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                            Actual Chunk
                          </div>
                          <div className="mt-3 max-h-40 overflow-y-auto pr-1 text-lg leading-8 text-white">
                            {chunk.expected_text}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-[#243149] bg-[#131A2A] p-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                            User Read Chunk
                          </div>
                          <div className="mt-3 max-h-48 overflow-y-auto pr-1">
                            <div className="flex flex-wrap gap-2 leading-8">
                              {buildUserReadDisplay(chunk.word_comparison).length > 0 ? (
                                buildUserReadDisplay(chunk.word_comparison).map((item, index) => (
                                  <span
                                    key={`${chunk.chunk_id}-user-${index}-${item.word}`}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${getWordStyle(item.status)}`}
                                    title={
                                      item.type === "expected_word" &&
                                      item.spoken_word &&
                                      item.spoken_word !== item.word
                                        ? `Expected: ${item.word}`
                                        : undefined
                                    }
                                  >
                                    {getUserReadTokenLabel(item)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400">
                                  No spoken words captured for this chunk.
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-[#243149] bg-[#131A2A] p-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                          Comparison Reference
                        </div>
                        <div className="mt-3 max-h-40 overflow-y-auto pr-1">
                          <div className="flex flex-wrap gap-2 leading-8">
                            {chunk.word_comparison.map((item, index) => (
                              <span
                                key={`${chunk.chunk_id}-${index}-${item.word}`}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${getWordStyle(item.status)}`}
                                title={
                                  item.type === "expected_word" &&
                                  item.spoken_word &&
                                  item.spoken_word !== item.word
                                    ? `Spoken: ${item.spoken_word}`
                                    : undefined
                                }
                              >
                                {item.word}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {(chunk.extra_words_near_chunk?.length || chunk.repeated_words_near_chunk?.length) ? (
                        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                              Extra Words Near This Chunk
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 leading-8">
                              {chunk.extra_words_near_chunk && chunk.extra_words_near_chunk.length > 0 ? (
                                chunk.extra_words_near_chunk.map((word, index) => (
                                  <span
                                    key={`${chunk.chunk_id}-extra-${index}-${word}`}
                                    className="rounded-lg border border-cyan-500/20 bg-cyan-500/12 px-3 py-1.5 text-sm font-medium text-cyan-300"
                                  >
                                    {word}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400">No extra words anchored here.</span>
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-300">
                              Repeated Words Near This Chunk
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 leading-8">
                              {chunk.repeated_words_near_chunk && chunk.repeated_words_near_chunk.length > 0 ? (
                                chunk.repeated_words_near_chunk.map((word, index) => (
                                  <span
                                    key={`${chunk.chunk_id}-repeat-${index}-${word}`}
                                    className="rounded-lg border border-orange-500/20 bg-orange-500/12 px-3 py-1.5 text-sm font-medium text-orange-300"
                                  >
                                    {word}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400">No repeated words anchored here.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {chunk.mistake_reasons.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-300">
                            Why this chunk is marked mistakeful
                          </div>
                          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1 text-sm text-red-100/90">
                            {chunk.mistake_reasons.map((reason, index) => (
                              <div key={`${chunk.chunk_id}-reason-${index}`}>{reason}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-[#1E293B] bg-[#131A2A]/95 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <SectionHeader
              title="Wrong And Skipped JSON"
              description="Scrollable raw payloads for the first two evaluation outputs."
            />
            <div className="mt-5 grid grid-cols-1 gap-4">
              <pre className="max-h-72 overflow-auto rounded-2xl bg-[#0B0F19] p-4 text-sm text-red-200">
                {JSON.stringify({ wrong_words: wrongWords }, null, 2)}
              </pre>
              <pre className="max-h-72 overflow-auto rounded-2xl bg-[#0B0F19] p-4 text-sm text-slate-200">
                {JSON.stringify({ skipped_words: skippedWords }, null, 2)}
              </pre>
            </div>
          </div>

          <div className="rounded-3xl border border-[#1E293B] bg-[#131A2A]/95 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <SectionHeader
              title="Extra And Repeated JSON"
              description="Scrollable raw payloads for the remaining two evaluation outputs."
            />
            <div className="mt-5 grid grid-cols-1 gap-4">
              <pre className="max-h-72 overflow-auto rounded-2xl bg-[#0B0F19] p-4 text-sm text-cyan-200">
                {JSON.stringify({ extra_words: extraWords }, null, 2)}
              </pre>
              <pre className="max-h-72 overflow-auto rounded-2xl bg-[#0B0F19] p-4 text-sm text-orange-200">
                {JSON.stringify({ repeated_words: repeatedWords }, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
