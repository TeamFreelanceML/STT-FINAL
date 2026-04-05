"use client";

import type { ReactNode } from "react";
import { ReadingProvider } from "@/context/ReadingProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <ReadingProvider>{children}</ReadingProvider>;
}
