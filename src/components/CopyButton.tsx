import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
  onCopy: () => Promise<void>;
  label?: string;
  big?: boolean;
  done?: boolean;
  disabled?: boolean;
}

export default function CopyButton({ onCopy, label = 'Kopieren', big = false, done = false, disabled = false }: Props) {
  const [flash, setFlash] = useState(false);

  const handle = async () => {
    try {
      await onCopy();
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1500);
    } catch {
      alert('Kopieren nicht möglich – bitte Text manuell markieren.');
    }
  };

  const base = big
    ? 'px-5 py-2.5 text-sm font-semibold rounded-xl text-white bg-linear-to-r from-sky-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30 hover:brightness-110'
    : `px-2.5 py-1.5 text-xs font-medium rounded-lg border ${
        done
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
      }`;

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${base}`}
    >
      {flash || done ? <Check className={big ? 'size-4' : 'size-3.5'} /> : <Copy className={big ? 'size-4' : 'size-3.5'} />}
      {flash ? 'Kopiert' : label}
    </button>
  );
}
