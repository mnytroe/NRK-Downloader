'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';

type Status = 'idle' | 'working' | 'done' | 'error' | 'aborted';


export default function Page() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const isWorking = status === 'working';

  // Clean and validate URL
  const cleanUrl = useCallback((url: string): string => {
    if (!url) return '';
    
    console.log('🔍 cleanUrl input:', url);
    
    // Remove any whitespace
    let cleaned = url.trim();
    
    // Check for duplicated URLs (same URL repeated, even without spaces)
    // Strategy: Find the first complete NRK URL, then check if it's repeated
    
    // First, try to find URLs separated by spaces or line breaks
    const urlPattern = /https?:\/\/[^\s]+/g;
    const allUrls = cleaned.match(urlPattern);
    
    if (allUrls && allUrls.length > 1) {
      // Multiple URLs found - check if they're duplicates
      const firstUrl = allUrls[0];
      const allSame = allUrls.every(url => url === firstUrl);
      
      if (allSame && firstUrl.includes('nrk.no')) {
        // All URLs are the same NRK URL, use only the first one
        console.log('🔄 Detected duplicated URL (with separators), using first occurrence');
        cleaned = firstUrl;
      } else if (firstUrl.includes('nrk.no')) {
        // Multiple different URLs, but we only want the first NRK URL
        console.log('🔄 Detected multiple URLs, extracting first NRK URL');
        cleaned = firstUrl;
      }
    } else {
      // No spaces found - check if URL is duplicated by looking for pattern repetition
      // Find first NRK URL by looking for the pattern and checking if it repeats
      // Try to match URL until we find another https:// or end of string
      const httpsIndex = cleaned.indexOf('https://');
      if (httpsIndex !== -1) {
        // Find where the URL likely ends by looking for next https://
        const nextHttpsIndex = cleaned.indexOf('https://', httpsIndex + 1);
        let firstUrl: string;
        
        if (nextHttpsIndex !== -1) {
          // There's another https://, so the first URL is everything up to that point
          firstUrl = cleaned.substring(httpsIndex, nextHttpsIndex);
        } else {
          // No next https://, so try to extract the URL using a pattern
          const nrkMatch = cleaned.match(/https?:\/\/[^\/]*nrk\.no[^\s]*/);
          firstUrl = nrkMatch ? nrkMatch[0] : cleaned;
        }
        
        // Check if the same URL appears again immediately after
        const restOfString = cleaned.substring(firstUrl.length);
        if (restOfString.startsWith(firstUrl)) {
          // URL is duplicated without space, use only the first occurrence
          console.log('🔄 Detected duplicated URL (no separator), using first occurrence');
          cleaned = firstUrl;
        } else if (restOfString.trim().startsWith(firstUrl)) {
          // URL is duplicated with whitespace
          console.log('🔄 Detected duplicated URL (with whitespace), using first occurrence');
          cleaned = firstUrl;
        }
      }
      
      // Fallback: if we still have a duplicated pattern
      if (cleaned.includes('nrk.no') && cleaned.split('nrk.no').length > 2) {
        console.log('🔄 Detected duplicated URL pattern, cleaning...');
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
    }
    
    // Ensure it starts with http/https
    // Check if it already starts with http or https (even if incomplete)
    // Also check for partial typing like "h", "ht", "htt", "http", "http:", "http:/", "https", "https:", "https:/"
    // This prevents adding "https://" when user is typing or deleting parts of "http://" or "https://"
    const lowerCleaned = cleaned.toLowerCase();
    
    // If it starts with "h", assume user is typing/deleting a protocol (http/https)
    // This prevents adding "https://" when user has "htt", "http", "https", etc.
    if (!lowerCleaned.startsWith('h')) {
      // Only add https:// if it doesn't start with "h" (any prefix of http/https)
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
      // If it's an NRK URL, prevent default and handle specially
      e.preventDefault();
      setUrl(cleanUrl(text));
    }
    // Otherwise, let default paste behavior happen (user can paste other text)
  }, [cleanUrl]);

  // Handle keyboard navigation for drop zone
  const handleDropZoneKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Focus the input field when drop zone is activated
      const input = document.getElementById('url-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }
  }, []);

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

  // Initialize dark mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDarkMode = localStorage.getItem('darkMode');
      // If no saved preference, default to dark mode (true)
      // If saved preference exists, use it
      const shouldUseDarkMode = savedDarkMode === null ? true : savedDarkMode === 'true';
      console.log('🔄 Initializing dark mode from localStorage:', shouldUseDarkMode);
      setIsDarkMode(shouldUseDarkMode);
      
      // Apply the class immediately
      if (shouldUseDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
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

    // Check if URL contains NRK domain
    if (!cleanedUrl.includes('nrk.no')) {
      setErrorMsg('Kun NRK-lenker støttes');
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
      
      // Check if blob is empty (0 bytes) - indicates download failed
      if (blob.size === 0) {
        throw new Error('Download failed: received empty file. Video may not be available or download failed.');
      }
      
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
      } else if (e?.message?.includes('Rate limit')) {
        setStatus('error');
        setErrorMsg('Rate limit: prøv igjen om 60s');
      } else if (e?.message?.includes('Only NRK URLs')) {
        setStatus('error');
        setErrorMsg('Kun NRK-lenker støttes');
      } else if (e?.message?.includes('Invalid request')) {
        setStatus('error');
        setErrorMsg('Ugyldig URL-format');
      } else {
        setStatus('error');
        setErrorMsg(e?.message || 'Nedlasting feilet');
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
    working: 'Laster ned...',
    done: 'Ferdig!',
    error: 'Feil',
    aborted: 'Avbrutt',
  }[status];

  return (
    <main className="shell">
      <section className="panel panel-hover fade-in">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="title mb-1">
              NRK-Nedlaster
            </h1>
            <p className="muted text-sm">Lim inn NRK-URL, velg kvalitet og last ned.</p>
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
          <div
            className={`drop-wrap ${isDragOver ? 'drop-wrap--drag' : ''} ${isDarkMode ? 'dark-mode-dashed' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="Lim inn NRK URL eller dra og slipp fil her"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onKeyDown={handleDropZoneKeyDown}
          >
            <input
              id="url-input"
              type="text"
              className="input-plain"
              placeholder="https://tv.nrk.no/serie/... eller dra og slipp URL her"
              value={url}
              onChange={(e) => setUrl(cleanUrl(e.target.value))}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              disabled={isWorking}
            />
            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 bg-opacity-90 rounded-lg">
                <div className="text-blue-600 dark:text-blue-400 font-medium">
                  📎 Slip NRK URL her
                </div>
              </div>
            )}
          </div>
          {url && url !== cleanUrl(url) && (
            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-gray-800 dark:text-gray-200">
              <strong>Ryddet URL:</strong> {cleanUrl(url)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
                <button
                  className="btn-primary w-full md:w-auto"
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

        {/* Loading indicator OR Status display */}
        {isWorking ? (
          <div className="text-center py-2">
            <div className="inline-flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
              <span className="text-gray-600 dark:text-gray-300">Laster ned...</span>
            </div>
          </div>
        ) : (
          <div className="pt-1">
            <span className={`badge ${
              status === 'idle'    ? 'badge-idle' :
              status === 'done'    ? 'badge-done' :
              status === 'error'   ? 'badge-error' : 'badge-aborted'
            }`}>
              Status: {statusText}
            </span>

            {errorMsg && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                {errorMsg}
              </p>
            )}
          </div>
        )}

        {/* Info section */}
        <div className="section-divider space-y-2 mt-3">
          <div className="info-card info-yellow">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Viktig informasjon</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Du må ha rettigheter til å laste ned innholdet. Dette verktøyet er kun for personlig bruk 
              av innhold du har lov til å laste ned i henhold til NRKs retningslinjer.
            </p>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Laget med Next.js ved hjelp av yt-dlp og ffmpeg. Vibbekodet av{' '}
            <a 
              href="https://github.com/mnytroe/NRK-Downloader" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              mnytroe
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

