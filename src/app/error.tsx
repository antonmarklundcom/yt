"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function DigestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel title="The digest could not be loaded" error={error} reset={reset} />;
}
