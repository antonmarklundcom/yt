"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function VideoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel title="This analysis could not be loaded" error={error} reset={reset} />;
}
