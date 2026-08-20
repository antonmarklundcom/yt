import Link from "next/link";
import { analysisState } from "@/lib/analysis/state";
import type { DigestVideo } from "@/lib/videos";
import { formatCompactNumber, formatDate, formatDuration } from "@/lib/format";
import { AnalysisBadge } from "./AnalysisBadge";
import { CaptionBadge } from "./CaptionBadge";

export function VideoCard({ video }: { video: DigestVideo }) {
  return (
    <Link
      href={`/video/${video.id}`}
      className="surface-border surface-card group flex flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-1"
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
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-balance text-[var(--color-ink)]">
          {video.title}
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
