import Link from "next/link";
import { analysisState } from "@/lib/analysis/state";
import type { DigestVideo } from "@/lib/videos";
import { formatCompactNumber, formatDate, formatDuration } from "@/lib/format";
import { AnalysisBadge } from "./AnalysisBadge";
import { CaptionBadge } from "./CaptionBadge";

export function VideoCard({ video }: { video: DigestVideo }) {
  // Read videos recede rather than disappear: the corpus is the point, but an
  // unread item has to be findable in a grid of 24 without reading titles.
  const unread = video.readAt === null;

  return (
    <Link
      href={`/video/${video.id}`}
      className={`surface-border surface-card group flex flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-1 ${
        unread ? "" : "opacity-70 hover:opacity-100"
      }`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[var(--color-surface)]">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external YouTube-hosted thumbnails, not worth Next's image optimizer for a private tool
          <img
            src={video.thumbnailUrl}
            alt=""
            // A page of 24 cards is 24 external requests to i.ytimg.com;
            // only the ones in view are worth paying for.
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-ink-muted)]">
            No thumbnail
          </div>
        )}
        <span className="absolute right-2 bottom-2 rounded-[var(--radius-sm)] bg-black/75 px-1.5 py-0.5 text-xs text-white">
          {formatDuration(video.durationSeconds)}
        </span>
        {video.pinned && (
          <span
            className="absolute top-2 left-2 rounded-[var(--radius-sm)] bg-black/75 px-1.5 py-0.5 text-xs text-white"
            title="Pinned"
          >
            ★ Pinned
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 flex gap-2 text-sm font-medium text-balance text-[var(--color-ink)]">
          {unread && (
            <span
              aria-label="Unread"
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent)]"
            />
          )}
          <span>{video.title}</span>
        </h3>
        <p className="text-xs text-[var(--color-ink-muted)]">
          {video.channelTitle ?? "Unknown channel"}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <CaptionBadge status={video.captionStatus} />
          <AnalysisBadge state={analysisState(video.analysisStatus, video.captionStatus)} />
          <span className="ml-auto text-xs text-[var(--color-ink-muted)]">
            {formatDate(video.publishedAt)} · {formatCompactNumber(video.viewCount)} views
          </span>
        </div>
      </div>
    </Link>
  );
}
