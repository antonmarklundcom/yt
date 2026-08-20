import type { Metadata } from "next";
import { DigestFilters } from "@/components/DigestFilters";
import { Pagination } from "@/components/Pagination";
import { VideoCard } from "@/components/VideoCard";
import { listDigestVideos, parseCaptionStatus } from "@/lib/videos";

export const metadata: Metadata = { title: "Digest" };

type SearchParams = { q?: string; status?: string; page?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = parseCaptionStatus(params.status);
  const page = Number(params.page) || 1;

  const result = await listDigestVideos({ q: q || undefined, status, page });
  const hasFilters = q !== "" || status !== undefined;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
            Digest
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">
            {result.total} video{result.total === 1 ? "" : "s"}
          </h1>
        </div>
        <DigestFilters q={q} status={status ?? ""} />
      </div>

      {result.videos.length === 0 ? (
        <div className="surface-border surface-card flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <h2 className="text-lg font-medium text-[var(--color-ink)]">
            {hasFilters ? "No videos match this filter" : "Nothing ingested yet"}
          </h2>
          <p className="max-w-md text-sm text-[var(--color-ink-muted)] leading-relaxed">
            {hasFilters
              ? "Try a different search term or status."
              : "Add a channel, playlist or single video from Ingest and its analysis will appear here."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} searchParams={params} />
        </>
      )}
    </main>
  );
}
