/**
 * The whole UI's copy, in two languages (PLAN.md §9 PR-22).
 *
 * A flat object and a `t()` helper — deliberately no i18n library and no
 * `[locale]` routing. There are under a hundred strings and exactly one reader;
 * next-intl would add a dependency, a middleware and a routing scheme to solve
 * a problem this file solves in full. Locale lives in a cookie instead, so
 * every URL keeps working and nothing has to be re-linked.
 *
 * `en` is the source of truth: `sv` is typed as a complete map of its keys, so
 * adding an English string without a Swedish one fails typecheck rather than
 * silently rendering a key.
 */

export const en = {
  "app.name": "YT Intel",
  "app.title": "YouTube Intelligence Workspace",
  "app.description": "Private research workspace — read digests instead of watching videos.",

  "nav.digest": "Digest",
  "nav.sources": "Sources",
  "nav.ingest": "Ingest",

  "locale.label": "Language",
  "locale.en": "English",
  "locale.sv": "Svenska",
  "locale.switch": "Switch language",

  "spend.tooltip": "spent this month",

  "digest.eyebrow": "Digest",
  "digest.countOne": "video",
  "digest.countMany": "videos",
  "digest.empty.title": "Nothing ingested yet",
  "digest.empty.body":
    "Add a channel, playlist or single video from Ingest and its analysis will appear here.",
  "digest.noMatch.title": "No videos match this filter",
  "digest.noMatch.body": "Try a different search term, status, or read filter.",

  "filters.search": "Search titles and analyses…",
  "filters.submit": "Filter",
  "filters.status.all": "All statuses",
  "filters.status.available": "Captioned",
  "filters.status.unknown": "Not probed",
  "filters.status.none": "No captions",
  "filters.status.failed": "Fetch failed",
  "filters.read.all": "All videos",
  "filters.read.unread": "Unread",
  "filters.read.pinned": "Pinned",
  "filters.sort.published": "Newest published",
  "filters.sort.added": "Recently added",
  "filters.sort.views": "Most viewed",

  "caption.unknown": "Not probed",
  "caption.available": "Captioned",
  "caption.none": "No captions",
  "caption.failed": "Fetch failed",

  "analysisState.analysed": "Analysed",
  "analysisState.failed": "Analysis failed",
  "analysisState.pending": "Pending analysis",

  "card.unread": "Unread",
  "card.pinned": "Pinned",
  "card.views": "views",
  "card.noThumbnail": "No thumbnail",

  "pagination.previous": "← Previous",
  "pagination.next": "Next →",
  "pagination.position": "Page {page} of {total}",

  "video.unknownChannel": "Unknown channel",
  "video.watch": "Watch on YouTube ↗",
  "video.pin": "☆ Pin",
  "video.unpin": "★ Unpin",
  "video.markUnread": "Mark unread",
  "video.delete": "Delete",
  "video.deleteConfirm":
    "Delete this video, its transcript and every analysis of it? Re-analysing later costs money again.",
  "video.notAnalysed.title": "Not analysed yet",
  "video.notAnalysed.ready": "A transcript is stored, so this video can be analysed now.",
  "video.notAnalysed.noTranscript":
    "This video has no stored transcript, so it cannot be analysed.",
  "video.analyzeNow": "Analyze now",
  "video.analysing": "Analysing…",
  "video.retry": "Retry analysis",
  "video.retrySonnet": "Retry with Sonnet",
  "video.reanalyseSonnet": "Re-analyze with Sonnet",
  "video.failed.title": "Analysis failed",
  "video.failed.noMessage": "No error message was recorded.",
  "video.copyRaw": "Copy raw response",
  "video.copyAnalysis": "Copy full analysis",
  "video.copied": "Copied",

  "section.summary": "Summary",
  "section.hook": "Hook",
  "section.timeline": "Timeline",
  "section.gaps": "Gaps",
  "section.ideas": "Ideas",
  "hook.technique": "Technique",
  "hook.first30s": "First 30 seconds",
  "hook.whyItWorks": "Why it works",
  "gaps.counterAngle": "Counter-angle",
  "ideas.whyNow": "Why now",

  "outline.generate": "Generate outline",
  "outline.generating": "Generating…",
  "outline.copy": "Copy outline",
  "outline.hook": "Hook",
  "outline.rehook": "Re-hook",
  "outline.teachingPoints": "Teaching points",
  "outline.twist": "Twist",
  "outline.cta": "CTA",

  "sources.eyebrow": "Sources",
  "sources.title": "Tracked channels & playlists",
  "sources.cronNote":
    "Active sources are polled hourly by cron — new uploads are ingested and analysed in a batch without anyone opening this page. Pausing a source stops the poll but keeps its videos and its position in the queue.",
  "sources.empty": "Nothing tracked yet.",
  "sources.kind.channel": "Channel",
  "sources.kind.playlist": "Playlist",
  "sources.active": "Active",
  "sources.paused": "Paused",
  "sources.videoCountOne": "video",
  "sources.videoCountMany": "videos",
  "sources.lastPolled": "last polled",
  "sources.never": "never",
  "sources.pause": "Pause",
  "sources.resume": "Resume",
  "sources.remove": "Remove",
  "sources.removeConfirm":
    "Stop tracking this source? Its videos and analyses are kept — only the source row is removed.",
  "sources.titleLabel": "Source title",
  "sources.saveTitle": "Save title",
  "sources.addPlaceholder": "Channel or playlist URL, or @handle",
  "sources.add": "Track",
  "sources.adding": "Adding…",
  "sources.added": "Source added. It will be polled on the next hourly cron run.",

  "ingest.eyebrow": "Ingest",
  "ingest.title": "Add a URL",
  "ingest.intro":
    "A single video is ingested and analysed immediately. A playlist or channel is ingested (captions fetched, up to 25 videos) but not auto-analysed — run analysis from the digest feed afterward.",
  "ingest.urlLabel": "Video, playlist or channel URL (or @handle)",
  "ingest.urlPlaceholder": "https://youtube.com/watch?v=…",
  "ingest.showTranscript": "No captions? Paste a transcript instead",
  "ingest.hideTranscript": "Cancel manual transcript",
  "ingest.transcriptLabel": "Transcript text (single video URL above required)",
  "ingest.transcriptPlaceholder": "Paste the transcript…",
  "ingest.submit": "Ingest & analyse",
  "ingest.working": "Working…",
  "ingest.progress.resolved": "Resolved {description}",
  "ingest.progress.listed": "Found {count} video(s)",
  "ingest.progress.stored": "Stored {index}/{total} — {title}",
  "ingest.progress.captions": "Captions {index}/{total} ({outcome}) — {title}",
  "ingest.failed": "Ingest failed.",

  "result.success": "Done",
  "result.info": "Note",
  "result.error": "Failed",

  "error.eyebrow": "Error",
  "error.digest.title": "The digest could not be loaded",
  "error.video.title": "This analysis could not be loaded",
  "error.sources.title": "Sources could not be loaded",
  "error.ingest.title": "The ingest page could not be loaded",
  "error.retry": "Try again",
  "error.noMessage": "No error message was recorded.",

  "notFound.title": "Page not found",
  "notFound.body": "Nothing lives at this URL.",
  "notFound.video.title": "No such video",
  "notFound.video.body":
    "This video is not in the workspace. It may have been removed, or the link may be wrong.",
  "notFound.back": "Back to the digest",

  "login.title": "Sign in",
  "login.intro": "This workspace is private. Sign in with the account the seed script created.",
  "login.email": "Email",
  "login.password": "Password",
  "login.signIn": "Sign in",
  "login.signingIn": "Signing in…",
  "login.signOut": "Sign out",
} as const;

export type TranslationKey = keyof typeof en;

export const sv: Record<TranslationKey, string> = {
  "app.name": "YT Intel",
  "app.title": "YouTube-analysarbetsyta",
  "app.description": "Privat researchverktyg — läs sammanfattningar i stället för att titta.",

  "nav.digest": "Flöde",
  "nav.sources": "Källor",
  "nav.ingest": "Lägg till",

  "locale.label": "Språk",
  "locale.en": "English",
  "locale.sv": "Svenska",
  "locale.switch": "Byt språk",

  "spend.tooltip": "spenderat denna månad",

  "digest.eyebrow": "Flöde",
  "digest.countOne": "video",
  "digest.countMany": "videor",
  "digest.empty.title": "Inget inläst ännu",
  "digest.empty.body":
    "Lägg till en kanal, spellista eller enskild video under Lägg till, så dyker analysen upp här.",
  "digest.noMatch.title": "Inga videor matchar filtret",
  "digest.noMatch.body": "Prova en annan sökterm, status eller lässtatus.",

  "filters.search": "Sök i titlar och analyser…",
  "filters.submit": "Filtrera",
  "filters.status.all": "Alla statusar",
  "filters.status.available": "Har undertexter",
  "filters.status.unknown": "Inte kontrollerad",
  "filters.status.none": "Saknar undertexter",
  "filters.status.failed": "Hämtning misslyckades",
  "filters.read.all": "Alla videor",
  "filters.read.unread": "Olästa",
  "filters.read.pinned": "Fästa",
  "filters.sort.published": "Senast publicerat",
  "filters.sort.added": "Senast tillagt",
  "filters.sort.views": "Mest visade",

  "caption.unknown": "Inte kontrollerad",
  "caption.available": "Har undertexter",
  "caption.none": "Saknar undertexter",
  "caption.failed": "Hämtning misslyckades",

  "analysisState.analysed": "Analyserad",
  "analysisState.failed": "Analysen misslyckades",
  "analysisState.pending": "Väntar på analys",

  "card.unread": "Oläst",
  "card.pinned": "Fäst",
  "card.views": "visningar",
  "card.noThumbnail": "Ingen miniatyrbild",

  "pagination.previous": "← Föregående",
  "pagination.next": "Nästa →",
  "pagination.position": "Sida {page} av {total}",

  "video.unknownChannel": "Okänd kanal",
  "video.watch": "Titta på YouTube ↗",
  "video.pin": "☆ Fäst",
  "video.unpin": "★ Lossa",
  "video.markUnread": "Markera som oläst",
  "video.delete": "Radera",
  "video.deleteConfirm":
    "Radera videon, dess transkript och alla analyser av den? Att analysera om kostar pengar igen.",
  "video.notAnalysed.title": "Inte analyserad ännu",
  "video.notAnalysed.ready": "Ett transkript finns lagrat, så videon kan analyseras nu.",
  "video.notAnalysed.noTranscript":
    "Videon har inget lagrat transkript och kan därför inte analyseras.",
  "video.analyzeNow": "Analysera nu",
  "video.analysing": "Analyserar…",
  "video.retry": "Försök analysera igen",
  "video.retrySonnet": "Försök igen med Sonnet",
  "video.reanalyseSonnet": "Analysera om med Sonnet",
  "video.failed.title": "Analysen misslyckades",
  "video.failed.noMessage": "Inget felmeddelande sparades.",
  "video.copyRaw": "Kopiera råsvar",
  "video.copyAnalysis": "Kopiera hela analysen",
  "video.copied": "Kopierat",

  "section.summary": "Sammanfattning",
  "section.hook": "Hook",
  "section.timeline": "Tidslinje",
  "section.gaps": "Luckor",
  "section.ideas": "Idéer",
  "hook.technique": "Teknik",
  "hook.first30s": "Första 30 sekunderna",
  "hook.whyItWorks": "Varför det funkar",
  "gaps.counterAngle": "Motvinkel",
  "ideas.whyNow": "Varför nu",

  "outline.generate": "Skapa disposition",
  "outline.generating": "Skapar…",
  "outline.copy": "Kopiera disposition",
  "outline.hook": "Hook",
  "outline.rehook": "Åter-hook",
  "outline.teachingPoints": "Lärpunkter",
  "outline.twist": "Vändning",
  "outline.cta": "Uppmaning",

  "sources.eyebrow": "Källor",
  "sources.title": "Bevakade kanaler och spellistor",
  "sources.cronNote":
    "Aktiva källor pollas varje timme av cron — nya uppladdningar läses in och analyseras i en batch utan att någon öppnar den här sidan. Att pausa en källa stoppar pollningen men behåller dess videor och dess plats i kön.",
  "sources.empty": "Inget bevakas ännu.",
  "sources.kind.channel": "Kanal",
  "sources.kind.playlist": "Spellista",
  "sources.active": "Aktiv",
  "sources.paused": "Pausad",
  "sources.videoCountOne": "video",
  "sources.videoCountMany": "videor",
  "sources.lastPolled": "senast pollad",
  "sources.never": "aldrig",
  "sources.pause": "Pausa",
  "sources.resume": "Återuppta",
  "sources.remove": "Ta bort",
  "sources.removeConfirm":
    "Sluta bevaka den här källan? Dess videor och analyser behålls — bara källraden tas bort.",
  "sources.titleLabel": "Källans titel",
  "sources.saveTitle": "Spara titel",
  "sources.addPlaceholder": "URL till kanal eller spellista, eller @handle",
  "sources.add": "Bevaka",
  "sources.adding": "Lägger till…",
  "sources.added": "Källan tillagd. Den pollas vid nästa timkörning.",

  "ingest.eyebrow": "Lägg till",
  "ingest.title": "Lägg till en URL",
  "ingest.intro":
    "En enskild video läses in och analyseras direkt. En spellista eller kanal läses in (undertexter hämtas, upp till 25 videor) men analyseras inte automatiskt — kör analysen från flödet efteråt.",
  "ingest.urlLabel": "URL till video, spellista eller kanal (eller @handle)",
  "ingest.urlPlaceholder": "https://youtube.com/watch?v=…",
  "ingest.showTranscript": "Inga undertexter? Klistra in ett transkript i stället",
  "ingest.hideTranscript": "Avbryt manuellt transkript",
  "ingest.transcriptLabel": "Transkripttext (kräver en enskild video-URL ovan)",
  "ingest.transcriptPlaceholder": "Klistra in transkriptet…",
  "ingest.submit": "Läs in och analysera",
  "ingest.working": "Arbetar…",
  "ingest.progress.resolved": "Hittade {description}",
  "ingest.progress.listed": "Hittade {count} video(r)",
  "ingest.progress.stored": "Sparade {index}/{total} — {title}",
  "ingest.progress.captions": "Undertexter {index}/{total} ({outcome}) — {title}",
  "ingest.failed": "Inläsningen misslyckades.",

  "result.success": "Klart",
  "result.info": "Obs",
  "result.error": "Misslyckades",

  "error.eyebrow": "Fel",
  "error.digest.title": "Flödet kunde inte läsas in",
  "error.video.title": "Analysen kunde inte läsas in",
  "error.sources.title": "Källorna kunde inte läsas in",
  "error.ingest.title": "Sidan kunde inte läsas in",
  "error.retry": "Försök igen",
  "error.noMessage": "Inget felmeddelande sparades.",

  "notFound.title": "Sidan hittades inte",
  "notFound.body": "Det finns ingenting på den här adressen.",
  "notFound.video.title": "Videon finns inte",
  "notFound.video.body":
    "Videon finns inte i arbetsytan. Den kan ha tagits bort, eller så är länken fel.",
  "notFound.back": "Tillbaka till flödet",

  "login.title": "Logga in",
  "login.intro": "Den här arbetsytan är privat. Logga in med kontot som seed-skriptet skapade.",
  "login.email": "E-post",
  "login.password": "Lösenord",
  "login.signIn": "Logga in",
  "login.signingIn": "Loggar in…",
  "login.signOut": "Logga ut",
};

export const DICTIONARIES = { en, sv } as const;
