"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function SourcesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel title="Sources could not be loaded" error={error} reset={reset} />;
}
