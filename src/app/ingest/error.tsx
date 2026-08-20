"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function IngestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel title="The ingest page could not be loaded" error={error} reset={reset} />;
}
