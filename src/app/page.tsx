import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n";
import { DigestFilters } from "@/components/DigestFilters";
import { Pagination } from "@/components/Pagination";
import { VideoCard } from "@/components/VideoCard";
import {
  listDigestVideos,
  parseCaptionStatus,
  parseDigestSort,
  parseReadFilter,
} from "@/lib/videos";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await getLocale())("digest.eyebrow") };
}

type SearchParams = {
  q?: string;
  status?: string;
  filter?: string;
  sort?: string;
  page?: string;
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = translator(locale);
  const q = params.q?.trim() ?? "";
  const status = parseCaptionStatus(params.status);
  const filter = parseReadFilter(params.filter);
  const sort = parseDigestSort(params.sort);
  const page = Number(params.page) || 1;

  const result = await listDigestVideos({ q: q || undefined, status, filter, sort, page });
  const hasFilters = q !== "" || status !== undefined || filter !== undefined;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
            {t("digest.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">
            {result.total} {t(result.total === 1 ? "digest.countOne" : "digest.countMany")}
          </h1>
        </div>
        <DigestFilters
          q={q}
          status={status ?? ""}
          filter={filter ?? ""}
          sort={sort ?? "published"}
          locale={locale}
        />
      </div>

      {result.videos.length === 0 ? (
        <div className="surface-border surface-card flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <h2 className="text-lg font-medium text-[var(--color-ink)]">
            {t(hasFilters ? "digest.noMatch.title" : "digest.empty.title")}
          </h2>
          <p className="max-w-md text-sm text-[var(--color-ink-muted)] leading-relaxed">
            {t(hasFilters ? "digest.noMatch.body" : "digest.empty.body")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.videos.map((video) => (
              <VideoCard key={video.id} video={video} locale={locale} />
            ))}
          </div>
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            searchParams={params}
            locale={locale}
          />
        </>
      )}
    </main>
  );
}
