import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Archive, Ban, CircleCheck, CircleHelp, Clock, FileText, Files, ListChecks,
  LoaderCircle, MessageSquareText, ShieldCheck, Sparkles, Tag, Trash2, TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ThemeToggle from './components/ThemeToggle';
import ResultCard from './components/ResultCard';
import CopyButton from './components/CopyButton';
import { analyzeMail, hashText, SAMPLE_MAIL } from './lib/analyzer';
import { clearHistory, loadHistory, saveToHistory } from './lib/history';
import type { AnalysisResult, CaseKey, Tone } from './types';

const CASE_ICONS: Record<CaseKey, LucideIcon> = {
  archivieren: Archive,
  'nicht-archivieren': Ban,
  doppelt: Files,
  'in-bearbeitung': Clock,
  unklar: CircleHelp,
};

const TONE_STYLES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  danger: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/30',
};

function CaseBadge({ result }: { result: AnalysisResult }) {
  const Icon = CASE_ICONS[result.caseType.key];
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset ${TONE_STYLES[result.caseType.tone]}`}>
      <Icon className="size-4" />
      {result.caseType.title}
    </span>
  );
}

export default function App() {
  const [mail, setMail] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = () => {
    if (!mail.trim() || loading) return;
    setLoading(true);
    setResult(null);
    window.setTimeout(() => {
      const r = analyzeMail(mail, loadHistory());
      if (r.ticketNumber && (r.caseType.key === 'archivieren' || r.caseType.key === 'doppelt')) {
        saveToHistory(r.ticketNumber, hashText(mail));
      }
      setResult(r);
      setLoading(false);
    }, 600);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAnalyze();
  };

  const handleClear = () => {
    setMail('');
    setResult(null);
  };

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-linear-to-r from-sky-400/30 via-violet-400/30 to-pink-400/30 blur-3xl dark:from-sky-500/20 dark:via-violet-500/20 dark:to-pink-500/20" />
      </div>

      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0d17]/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-sky-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="font-semibold leading-tight">Clearance Assistant</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">DPP · Hotline-Archiv</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 text-center">
          <h1 className="bg-linear-to-r from-sky-500 via-violet-500 to-fuchsia-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            Was steht in der Clearance-Mail?
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            Mail einfügen, analysieren, Schritte abarbeiten.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-3 shadow-xl shadow-slate-200/50 backdrop-blur-xl transition focus-within:ring-2 focus-within:ring-violet-500/40 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <textarea
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Füge hier die komplette Clearance-Mail ein (inkl. Betreff) …"
            rows={9}
            className="w-full resize-y rounded-2xl bg-transparent p-3 text-sm leading-relaxed outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <div className="flex flex-col gap-3 border-t border-slate-200/70 px-2 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMail(SAMPLE_MAIL)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <FileText className="size-4" /> Beispiel einfügen
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Trash2 className="size-4" /> Leeren
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-400 sm:inline">Strg + Enter</span>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!mail.trim() || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-sky-500 via-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {loading ? 'Analysiere …' : 'Analysieren'}
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-white/5" />
            ))}
          </div>
        )}

        {result && !loading && (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <ResultCard title="Vorgangstyp" icon={Tag} accent="blue" className="md:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <CaseBadge result={result} />
                <div>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{result.caseType.description}</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-500 dark:text-slate-400">
                    {result.caseType.reasons.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </ResultCard>

            <ResultCard title="Vorhandene Informationen" icon={CircleCheck} accent="emerald" delay={80}>
              {result.present.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Keine Informationen erkannt.</p>
              ) : (
                <dl className="divide-y divide-slate-200/70 dark:divide-white/10">
                  {result.present.map((f) => (
                    <div key={f.label} className="flex items-start justify-between gap-4 py-2 text-sm">
                      <dt className="text-slate-500 dark:text-slate-400">{f.label}</dt>
                      <dd className="text-right font-medium break-words">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </ResultCard>

            <ResultCard title="Fehlende Informationen" icon={TriangleAlert} accent="amber" delay={160}>
              {result.missing.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Für diesen Vorgang brauchst du keine weiteren Infos.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200/70 dark:divide-white/10">
                  {result.missing.map((f) => (
                    <li key={f.label} className="flex items-start justify-between gap-4 py-2 text-sm">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-right text-slate-500 dark:text-slate-400">→ {f.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title="Empfohlene Schritte" icon={ListChecks} accent="violet" className="md:col-span-2" delay={240}>
              <ol className="space-y-3">
                {result.steps.map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </ResultCard>

            <ResultCard
              title="Antwortvorschlag"
              icon={MessageSquareText}
              accent="pink"
              className="md:col-span-2"
              delay={320}
              action={result.reply.text ? <CopyButton text={result.reply.text} /> : undefined}
            >
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{result.reply.note}</p>
              {result.reply.text && (
                <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-relaxed dark:bg-black/30">
                  {result.reply.text}
                </pre>
              )}
            </ResultCard>
          </div>
        )}
      </main>

      <footer className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 pb-8 text-xs text-slate-500 sm:flex-row sm:px-6 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-4" /> Läuft lokal im Browser – die Mail wird nirgendwohin gesendet.
        </span>
        <button type="button" onClick={clearHistory} className="underline-offset-2 hover:underline">
          Ticket-Verlauf löschen
        </button>
      </footer>
    </div>
  );
}
