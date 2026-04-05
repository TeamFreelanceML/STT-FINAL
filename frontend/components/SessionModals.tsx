"use client";

import { useReading } from "@/context/ReadingProvider";

export function SessionModals() {
  const { modal, modalContinue } = useReading();

  if (!modal) return null;

  const title =
    modal === "continue"
      ? "Do you want to continue?"
      : "Are you still recording?";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Guided reading session watchdog — choose an option to proceed.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
            onClick={() => modalContinue(false)}
          >
            No
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => modalContinue(true)}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
