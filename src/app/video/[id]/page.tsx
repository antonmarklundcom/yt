import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { outlines, transcripts, videoReads, videos } from "@/db/schema";
import { latestAnalysisForVideo } from "@/lib/analysis/latest";
import { DEFAULT_MODEL } from "@/lib/analysis/pricing";
import { estimateAnalysisCostUsd, formatUsd } from "@/lib/spend";
import { markVideoRead } from "@/lib/videos";
import { isOwner } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { translator, type Locale, type TranslationKey } from "@/lib/i18n";
import { AnalyzeButton } from "@/components/AnalyzeButton";
import { VideoReadControls } from "@/components/VideoReadControls";
import { CaptionBadge } from "@/components/CaptionBadge";
import { CopyAnalysisButton } from "@/components/CopyAnalysisButton";
import { CopyTextButton } from "@/components/CopyTextButton";
import { IdeaOutline } from "@/components/IdeaOutline";
import { formatDate, formatDuration } from "@/lib/format";

/**
 * Selects the title alone rather than reusing the page's query — this runs
 * before the page renders and the whole row is not needed to name a tab.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isInteger(videoId)) return { title: "Video" };

  const [row] = await db
    .select({ title: videos.title })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  return { title: row?.title ?? "Video" };
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isInteger(videoId)) notFound();

  const locale = await getLocale();
  const t = translator(locale);
  // Owner-only controls are hidden rather than shown-and-refused. The server
  // actions check for themselves regardless (src/lib/auth/roles.ts).
  // requireUser() rather than getSession(): read state is per-user (PR-25), so
  // the page needs an id, not just a role. The middleware has already redirected
  // signed-out visitors; this is the same gate, one layer in.
  const user = await requireUser();
  const canSpend = isOwner(user);

  const rows = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  const video = rows[0];
  if (!video) notFound();

  // Opening the page is what "read" means here (PR-19), for this user alone
  // since PR-25. Fire-and-forget would race the read of the state below, so it
  // is awaited — one primary-key upsert whose timestamp stops moving after the
  // first visit.
  await markVideoRead(video.id, user.id);

  // Read after the mark, so the controls show the state the visit just created.
  const [readState] = await db
    .select({ pinned: videoReads.pinned })
    .from(videoReads)
    .where(and(eq(videoReads.videoId, video.id), eq(videoReads.userId, user.id)))
    .limit(1);
  const pinned = readState?.pinned ?? false;

  const analysis = await latestAnalysisForVideo(video.id);

  // The estimate on the button needs the transcript's length, and its absence
  // is also what decides whether analysing is possible at all.
  const [transcript] = await db
    .select({ wordCount: transcripts.wordCount })
    .from(transcripts)
    .where(eq(transcripts.videoId, video.id))
    .limit(1);
  const estimate = canSpend && transcript
    ? {
        haiku: formatUsd(estimateAnalysisCostUsd(transcript.wordCount, DEFAULT_MODEL)),
        sonnet: formatUsd(estimateAnalysisCostUsd(transcript.wordCount, "claude-sonnet-5")),
      }
    : null;
  // Both statuses (PR-29). PR-16 made a failed generation write a row precisely
  // so a paid failure would survive a reload — filtering them out here is what
  // kept them invisible, which meant the row it preserved was never read.
  const outlineRows =
    analysis && analysis.status === "ok"
      ? await db.select().from(outlines).where(eq(outlines.analysisId, analysis.id))
      : [];
  const outlineByIdeaIndex = new Map(outlineRows.map((o) => [o.ideaIndex, o]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <CaptionBadge status={video.captionStatus} locale={locale} />
          <span className="text-xs text-[var(--color-ink-muted)]">
            {video.channelTitle ?? t("video.unknownChannel")} ·{" "}
            {formatDate(video.publishedAt, locale)} · {formatDuration(video.durationSeconds)}
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-balance text-[var(--color-ink)]">
          {video.title}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            {t("video.watch")}
          </a>
          <VideoReadControls
            videoId={video.id}
            pinned={pinned}
            locale={locale}
            canDelete={canSpend}
          />
        </div>
      </div>

      {!analysis && (
        <div className="surface-border surface-card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <div>
            <p className="text-[var(--color-ink)] font-medium">{t("video.notAnalysed.title")}</p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {t(estimate ? "video.notAnalysed.ready" : "video.notAnalysed.noTranscript")}
            </p>
          </div>
          {estimate && (
            <AnalyzeButton
              videoId={video.id}
              labelKey="video.analyzeNow"
              estimate={estimate.haiku}
              locale={locale}
            />
          )}
        </div>
      )}

      {analysis && analysis.status === "failed" && (
        <div className="surface-border surface-card px-6 py-8">
          <p className="font-medium text-[var(--color-danger)]">{t("video.failed.title")}</p>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {analysis.error ?? t("video.failed.noMessage")}
          </p>
          {analysis.rawResponse && (
            <div className="mt-4 flex flex-col items-start gap-2">
              <pre className="surface-border max-h-64 w-full overflow-auto rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-ink-muted)]">
                {analysis.rawResponse}
              </pre>
              <CopyTextButton text={analysis.rawResponse} label={t("video.copyRaw")} />
            </div>
          )}
          {estimate && (
            <div className="mt-5 flex flex-wrap gap-3">
              {/* force: a failed row is not a success, but `analyzeVideo` only
                  skips on a successful one, so this is belt-and-braces for the
                  case where an older successful analysis exists behind it. */}
              <AnalyzeButton
                videoId={video.id}
                labelKey="video.retry"
                estimate={estimate.haiku}
                locale={locale}
                force
              />
              <AnalyzeButton
                videoId={video.id}
                labelKey="video.retrySonnet"
                estimate={estimate.sonnet}
                locale={locale}
                model="claude-sonnet-5"
                variant="secondary"
                force
              />
            </div>
          )}
        </div>
      )}

      {analysis && analysis.status === "ok" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-end gap-3">
            {estimate && analysis.model !== "claude-sonnet-5" && (
              <AnalyzeButton
                videoId={video.id}
                labelKey="video.reanalyseSonnet"
                estimate={estimate.sonnet}
                locale={locale}
                model="claude-sonnet-5"
                variant="secondary"
                force
              />
            )}
            <CopyAnalysisButton video={video} analysis={analysis} />
          </div>

          {analysis.summary && (
            <Section titleKey="section.summary" locale={locale}>
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
            <Section titleKey="section.hook" locale={locale}>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <Field label={t("hook.technique")} value={analysis.hookBreakdown.technique} />
                <Field label={t("hook.first30s")} value={analysis.hookBreakdown.first_30s} />
                <Field label={t("hook.whyItWorks")} value={analysis.hookBreakdown.why_it_works} />
              </dl>
            </Section>
          )}

          {!!analysis.timeline?.length && (
            <Section titleKey="section.timeline" locale={locale}>
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
            <Section titleKey="section.gaps" locale={locale}>
              <ul className="flex flex-col gap-3">
                {analysis.gaps.map((g, i) => (
                  <li key={i} className="text-sm">
                    <p className="text-[var(--color-ink)]">{g.gap}</p>
                    <p className="text-[var(--color-ink-muted)]">
                      {t("gaps.counterAngle")}: {g.counter_angle}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!!analysis.ideas?.length && (
            <Section titleKey="section.ideas" locale={locale}>
              <ul className="flex flex-col gap-4">
                {analysis.ideas.map((idea, i) => {
                  const row = outlineByIdeaIndex.get(i);
                  return (
                    <li key={i} className="surface-border rounded-[var(--radius-sm)] p-3">
                      <p className="font-medium text-[var(--color-ink)]">{idea.title}</p>
                      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{idea.premise}</p>
                      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        {t("ideas.whyNow")}: {idea.why_now}
                      </p>
                      <IdeaOutline
                        analysisId={analysis.id}
                        ideaIndex={i}
                        videoId={video.id}
                        outline={row?.status === "ok" ? row.content : null}
                        failure={
                          row?.status === "failed"
                            ? { error: row.error, rawResponse: row.rawResponse }
                            : null
                        }
                        canGenerate={canSpend}
                      />
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      )}
    </main>
  );
}

function Section({
  titleKey,
  locale,
  children,
}: {
  titleKey: TranslationKey;
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-border surface-card p-5">
      <h2 className="mb-3 text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
        {translator(locale)(titleKey)}
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
