'use client';

import { useState } from 'react';
import type { NormalizedError } from '@/lib/errorMap';

export default function ErrorAlert({ err }: { err: NormalizedError }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
        <strong className="text-red-300">{err.title}</strong>
        <span className="ml-2 text-xs text-red-300/70">{err.code}</span>
      </div>
      <p className="mt-2 text-sm text-red-100">{err.message}</p>
      {err.hint && <p className="mt-1 text-xs text-red-200/80">{err.hint}</p>}
      {err.details && (
        <button
          type="button"
          className="mt-3 text-xs underline text-red-200/80 hover:text-red-100"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Skjul detaljer' : 'Vis detaljer'}
        </button>
      )}
      {open && err.details && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-red-200/80">{err.details}</pre>
      )}
    </div>
  );
}

