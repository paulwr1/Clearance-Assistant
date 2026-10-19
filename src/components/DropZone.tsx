import { useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  icon: LucideIcon;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
}

export default function DropZone({ title, hint, accept, multiple = false, icon: Icon, onFiles, children }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`rounded-3xl border-2 border-dashed p-4 transition ${
        over
          ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-500/10'
          : 'border-slate-300/80 bg-white/70 dark:border-white/15 dark:bg-white/5'
      }`}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-slate-100/70 dark:hover:bg-white/5"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-sky-500 via-violet-500 to-fuchsia-500 text-white shadow-md">
          <Icon className="size-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
