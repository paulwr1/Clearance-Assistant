import CopyButton from './CopyButton';
import { copyText } from '../lib/clipboard';

interface Props {
  label: string;
  value: string;
  source: string;
  hint?: string;
  required?: boolean;
  done: boolean;
  onChange: (v: string) => void;
  onCopied: () => void;
}

export default function FieldRow({ label, value, source, hint, required = true, done, onChange, onCopied }: Props) {
  const missing = required && !value.trim();
  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        done
          ? 'border-emerald-300/70 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5'
          : missing
            ? 'border-amber-300/80 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5'
            : 'border-slate-200/70 bg-white/80 dark:border-white/10 dark:bg-white/5'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </span>
        <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">{source}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={missing ? 'fehlt – bitte eintragen' : ''}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-white/10 dark:bg-black/20"
        />
        <CopyButton
          disabled={!value.trim()}
          done={done}
          onCopy={async () => {
            await copyText(value.trim());
            onCopied();
          }}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
