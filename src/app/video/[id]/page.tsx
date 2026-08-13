import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { outlines, videos } from "@/db/schema";
import { latestAnalysisForVideo } from "@/lib/analysis/latest";
import { CaptionBadge } from "@/components/CaptionBadge";
import { CopyAnalysisButton } from "@/components/CopyAnalysisButton";
import { IdeaOutline } from "@/components/IdeaOutline";
import { formatDate, formatDuration } from "@/lib/format";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isInteger(videoId)) notFound();

  const rows = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  const video = rows[0];
  if (!video) notFound();

  const analysis = await latestAnalysisForVideo(video.id);
  const outlineRows =
    analysis && analysis.status === "ok"
      ? await db.select().from(outlines).where(eq(outlines.analysisId, analysis.id))
      : [];
  const outlineByIdeaIndex = new Map(outlineRows.map((o) => [o.ideaIndex, o.content]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <CaptionBadge status={video.captionStatus} />
          <span className="text-xs text-[var(--color-ink-muted)]">
            {video.channelTitle ?? "Unknown channel"} · {formatDate(video.publishedAt)} ·{" "}
            {formatDuration(video.durationSeconds)}
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-balance text-[var(--color-ink)]">
          {video.title}
        </h1>
        <a
          href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          Watch on YouTube ↗
        </a>
      </div>

      {!analysis && (
        <div className="surface-border surface-card px-6 py-12 text-center">
          <p className="text-[var(--color-ink)] font-medium">Not analysed yet</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {video.captionStatus === "available"
              ? "A transcript is stored, but analysis has not run for this video."
              : "This video has no stored transcript, so it cannot be analysed."}
          </p>
        </div>
      )}

      {analysis && analysis.status === "failed" && (
        <div className="surface-border surface-card px-6 py-8">
          <p className="font-medium text-[var(--color-danger)]">Analysis failed</p>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {analysis.error ?? "No error message was recorded."}
          </p>
          {analysis.rawResponse && (
            <pre className="surface-border mt-4 max-h-64 overflow-auto rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-ink-muted)]">
              {analysis.rawResponse}
            </pre>
          )}
        </div>
      )}

      {analysis && analysis.status === "ok" && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-end">
            <CopyAnalysisButton video={video} analysis={analysis} />
          </div>

          {analysis.summary && (
            <Section title="Summary">
              <p className="text-sm leading-relaxed text-[var(--color-ink)]">{analysis.summary}</p>
              {!!analysis.takeaways?.length && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-muted)]">
                  {analysis.takeaways.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {analysis.hookBreakdown && (
            <Section title="Hook">
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <Field label="Technique" value={analysis.hookBreakdown.technique} />
                <Field label="First 30 seconds" value={analysis.hookBreakdown.first_30s} />
                <Field label="Why it works" value={analysis.hookBreakdown.why_it_works} />
              </dl>
            </Section>
          )}

          {!!analysis.timeline?.length && (
            <Section title="Timeline">
              <ol className="flex flex-col gap-3">
                {analysis.timeline.map((entry, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-16 shrink-0 font-mono text-[var(--color-accent)]">
                      {entry.ts}
                    </span>
                    <span>
                      <span className="font-medium text-[var(--color-ink)]">{entry.topic}</span>
                      <span className="text-[var(--color-ink-muted)]"> — {entry.beat}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {!!analysis.gaps?.length && (
            <Section title="Gaps">
              <ul className="flex flex-col gap-3">
                {analysis.gaps.map((g, i) => (
                  <li key={i} className="text-sm">
                    <p className="text-[var(--color-ink)]">{g.gap}</p>
                    <p className="text-[var(--color-ink-muted)]">Counter-angle: {g.counter_angle}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!!analysis.ideas?.length && (
            <Section title="Ideas">
              <ul className="flex flex-col gap-4">
                {analysis.ideas.map((idea, i) => (
                  <li key={i} className="surface-border rounded-[var(--radius-sm)] p-3">
                    <p className="font-medium text-[var(--color-ink)]">{idea.title}</p>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{idea.premise}</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                      Why now: {idea.why_now}
                    </p>
                    <IdeaOutline
                      analysisId={analysis.id}
                      ideaIndex={i}
                      videoId={video.id}
                      outline={outlineByIdeaIndex.get(i) ?? null}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-border surface-card p-5">
      <h2 className="mb-3 text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
