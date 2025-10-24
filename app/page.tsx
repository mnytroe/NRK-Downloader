'use client';

import React, { useRef, useState } from 'react';

type Status = 'idle' | 'working' | 'done' | 'error' | 'aborted';

export default function Page() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const isWorking = status === 'working';

  async function onDownload() {
    if (!url.trim()) {
      setErrorMsg('Vennligst skriv inn en URL');
      setStatus('error');
      return;
    }

    setStatus('working');
    setErrorMsg('');
    
    // Abort any existing request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      // Extract filename from Content-Disposition header
      const disp = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/i.exec(disp);
      const filename = match?.[1] ?? 'nrk-video.mp4';

      // Download blob and trigger download
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);

      setStatus('done');
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setStatus('aborted');
        setErrorMsg('Nedlasting avbrutt');
      } else {
        setStatus('error');
        setErrorMsg(e?.message || 'Ukjent feil');
      }
    }
  }

  function onAbort() {
    abortRef.current?.abort();
    setStatus('aborted');
    setErrorMsg('Nedlasting avbrutt');
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !isWorking) {
      onDownload();
    }
  }

  const statusText = {
    idle: 'Klar',
    working: 'Laster ned... Dette kan ta litt tid.',
    done: 'Ferdig! Filen lastes ned.',
    error: 'Feil',
    aborted: 'Avbrutt',
  }[status];

  const statusColor = {
    idle: 'text-gray-600',
    working: 'text-blue-600',
    done: 'text-green-600',
    error: 'text-red-600',
    aborted: 'text-yellow-600',
  }[status];

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">NRK Nedlaster</h1>
          <p className="text-gray-600">
            Last ned videoer fra NRK til din enhet
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 mb-2">
              NRK URL
            </label>
            <input
              id="url-input"
              type="text"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="https://tv.nrk.no/serie/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isWorking}
            />
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 bg-black text-white rounded-lg px-6 py-3 font-medium hover:bg-gray-800 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={onDownload}
              disabled={isWorking}
            >
              {isWorking ? 'Laster ned...' : 'Last ned'}
            </button>
            <button
              className="border border-gray-300 rounded-lg px-6 py-3 font-medium hover:bg-gray-50 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
              onClick={onAbort}
              disabled={!isWorking}
            >
              Avbryt
            </button>
          </div>

          {/* Status display */}
          <div className="pt-2">
            <p className={`font-medium ${statusColor}`}>
              Status: {statusText}
            </p>
            {errorMsg && (
              <p className="text-sm text-red-600 mt-1">
                {errorMsg}
              </p>
            )}
          </div>
        </div>

        {/* Info section */}
        <div className="border-t border-gray-200 pt-6 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Støttede domener</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• tv.nrk.no</li>
              <li>• www.nrk.no</li>
              <li>• nrk.no</li>
              <li>• radio.nrk.no</li>
            </ul>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 mb-2">Viktig informasjon</h3>
            <p className="text-sm text-yellow-800">
              Du må ha rettigheter til å laste ned innholdet. Dette verktøyet er kun for personlig bruk 
              av innhold du har lov til å laste ned i henhold til NRKs retningslinjer.
            </p>
          </div>

          <div className="text-xs text-gray-500 text-center">
            Laget med Next.js • Bruker yt-dlp og ffmpeg
          </div>
        </div>
      </div>
    </main>
  );
}

