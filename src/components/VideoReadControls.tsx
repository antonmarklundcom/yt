import { setVideoPinned, setVideoUnread } from "@/lib/read.actions";

const BUTTON =
  "surface-border rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)]";

/**
 * Plain server-action forms — no client JS. Opening the page already marked it
 * read, so "Mark unread" is the way back into the unread queue.
 */
export function VideoReadControls({ videoId, pinned }: { videoId: number; pinned: boolean }) {
  return (
    <div className="flex gap-2">
      <form action={setVideoPinned.bind(null, videoId, !pinned)}>
        <button type="submit" className={BUTTON}>
          {pinned ? "★ Unpin" : "☆ Pin"}
        </button>
      </form>
      <form action={setVideoUnread.bind(null, videoId)}>
        <button type="submit" className={BUTTON}>
          Mark unread
        </button>
      </form>
    </div>
  );
}
