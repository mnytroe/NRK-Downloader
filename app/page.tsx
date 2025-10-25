'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';

type Status = 'idle' | 'working' | 'done' | 'error' | 'aborted';


export default function Page() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isWorking = status === 'working';

  // Clean and validate URL
  const cleanUrl = useCallback((url: string): string => {
    if (!url) return '';
    
    console.log('🔍 cleanUrl input:', url);
    
    // Remove any whitespace
    let cleaned = url.trim();
    
    // If URL appears to be duplicated, take only the first complete URL
    if (cleaned.includes('nrk.no') && cleaned.split('nrk.no').length > 2) {
      console.log('🔄 Detected duplicated URL, cleaning...');
      // Find the first complete URL by looking for the pattern
      const nrkMatch = cleaned.match(/https?:\/\/[^\/]*nrk\.no[^\s]*/);
      if (nrkMatch) {
        cleaned = nrkMatch[0];
        console.log('✅ Found complete URL:', cleaned);
      } else {
        // Fallback: split by nrk.no and reconstruct
        const parts = cleaned.split('nrk.no');
        cleaned = parts[0] + 'nrk.no' + parts[1];
        console.log('⚠️ Fallback cleaning:', cleaned);
      }
    }
    
    // Ensure it starts with http/https
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = 'https://' + cleaned;
    }
    
    // Remove any trailing characters that might be invalid
    cleaned = cleaned.replace(/[^\w\-\.\/\?\=\&\:\#]+$/, '');
    
    console.log('🎯 cleanUrl output:', cleaned);
    return cleaned;
  }, []);


  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const text = e.dataTransfer.getData('text');
    if (text && text.includes('nrk.no')) {
      setUrl(cleanUrl(text));
    }
  }, [cleanUrl]);

  // Handle paste from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text && text.includes('nrk.no')) {
      setUrl(cleanUrl(text));
    }
  }, [cleanUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup any ongoing operations
    };
  }, []);

  // Dark mode toggle
  const toggleDarkMode = useCallback(() => {
    console.log('🌙 Toggle dark mode clicked, current state:', isDarkMode);
    const newDarkMode = !isDarkMode;
    console.log('🔄 New dark mode state will be:', newDarkMode);
    
    // Update state - useEffect will handle DOM sync
    setIsDarkMode(newDarkMode);
    
    // Save preference to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', newDarkMode.toString());
      console.log('💾 Saved to localStorage:', newDarkMode);
    }
  }, [isDarkMode]);

  // Initialize dark mode from localStorage - let script in <head> handle DOM
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDarkMode = localStorage.getItem('darkMode') === 'true';
      console.log('🔄 Initializing dark mode from localStorage:', savedDarkMode);
      setIsDarkMode(savedDarkMode);
      // Script in <head> already handles DOM classes, so we just sync state
    }
  }, []);

  // Sync DOM with state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('🔄 State changed, syncing DOM. isDarkMode:', isDarkMode);
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        console.log('✅ Added dark class to document');
      } else {
        document.documentElement.classList.remove('dark');
        console.log('✅ Removed dark class from document');
      }
    }
  }, [isDarkMode]);

  async function onDownload() {
    const cleanedUrl = cleanUrl(url);
    
    // Debug logging
    console.log('Original URL:', url);
    console.log('Cleaned URL:', cleanedUrl);
    
    if (!cleanedUrl.trim()) {
      setErrorMsg('Vennligst skriv inn en gyldig NRK URL');
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
        body: JSON.stringify({ url: cleanedUrl }),
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
    idle: 'text-gray-600 dark:text-gray-400',
    working: 'text-blue-600 dark:text-blue-400',
    done: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    aborted: 'text-yellow-600 dark:text-yellow-400',
  }[status];

  return (
    <main className="shell">
      <section className="panel panel-hover fade-in">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="title">NRK-nedlaster</h1>
            <p className="muted">Lim inn NRK-URL, velg kvalitet og last ned.</p>
          </div>

          {/* Tema-knapp øverst til høyre */}
          <button
            type="button"
            aria-label="Bytt tema"
            className="icon-btn"
            onClick={toggleDarkMode}
            title="Bytt lys/mørk"
          >
            {/* Valgfritt: vis ikon basert på nåværende tema */}
            {isDarkMode ? (
              <svg width="20" height="20" viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 1 0 9.79 9.79z"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zM4 10.5H1v2h3v-2zm9-9.95h2V3.5h-2V.55zm7.45 3.91l-1.41-1.41-1.79 1.8 1.41 1.41 1.79-1.8zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>
            )}
          </button>
        </header>

        <div className="field">
          <label className="label" htmlFor="url-input">
            NRK URL
          </label>
          <div
            className={`relative w-full border-2 border-dashed rounded-xl transition-colors ${
              isDragOver 
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              id="url-input"
              type="text"
              className="input"
              placeholder="https://tv.nrk.no/serie/... eller dra og slipp URL her"
              value={url}
              onChange={(e) => setUrl(cleanUrl(e.target.value))}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              disabled={isWorking}
            />
            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 bg-opacity-90 rounded-xl">
                <div className="text-blue-600 dark:text-blue-400 font-medium">
                  📎 Slip NRK URL her
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            💡 Tips: Du kan også dra og slippe URL-er fra nettleseren eller lime inn med Ctrl+V
          </p>
          {url && url !== cleanUrl(url) && (
            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-gray-800 dark:text-gray-200">
              <strong>Ryddet URL:</strong> {cleanUrl(url)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            className="btn-primary flex-1"
            onClick={onDownload}
            disabled={isWorking}
          >
            {isWorking ? 'Laster ned...' : 'Last ned'}
          </button>
          <button
            className="btn-outline"
            onClick={onAbort}
            disabled={!isWorking}
          >
            Avbryt
          </button>
        </div>

        {/* Simple loading indicator */}
        {isWorking && (
          <div className="text-center py-4">
            <div className="inline-flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <span className="text-gray-600 dark:text-gray-300">Laster ned...</span>
            </div>
          </div>
        )}

        {/* Status display */}
        <div className="pt-2">
          <div className="flex items-center gap-2">
            {isWorking && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            )}
            <p className={`font-medium ${statusColor}`}>
              Status: {statusText}
            </p>
          </div>
          {errorMsg && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Info section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Støttede domener</h3>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• tv.nrk.no</li>
              <li>• www.nrk.no</li>
              <li>• nrk.no</li>
              <li>• radio.nrk.no</li>
            </ul>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">Viktig informasjon</h3>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Du må ha rettigheter til å laste ned innholdet. Dette verktøyet er kun for personlig bruk 
              av innhold du har lov til å laste ned i henhold til NRKs retningslinjer.
            </p>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Laget med Next.js • Bruker yt-dlp og ffmpeg
          </div>
        </div>
      </section>
    </main>
  );
}

