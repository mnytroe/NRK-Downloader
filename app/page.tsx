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
    <main className={`min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6 ${isDarkMode ? 'dark:from-gray-900 dark:to-gray-800' : ''}`}>
      <div className={`bg-white rounded-lg shadow-lg max-w-2xl w-full p-8 space-y-6 ${isDarkMode ? 'dark:bg-gray-800' : ''}`}>
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>NRK Nedlaster</h1>
            <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Last ned videoer fra NRK til din enhet
            </p>
          </div>
          
          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className={`p-2 rounded-lg transition-colors cursor-pointer z-10 relative ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
            aria-label="Toggle dark mode"
            type="button"
          >
            {isDarkMode ? (
              <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="url-input" className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              NRK URL
            </label>
            <div
              className={`relative w-full border-2 border-dashed rounded-lg transition-colors ${
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
                className={`w-full border-0 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition bg-transparent placeholder-gray-500 dark:placeholder-gray-400 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
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
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              💡 Tips: Du kan også dra og slippe URL-er fra nettleseren eller lime inn med Ctrl+V
            </p>
            {url && url !== cleanUrl(url) && (
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-gray-800 dark:text-gray-200">
                <strong>Ryddet URL:</strong> {cleanUrl(url)}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              className={`flex-1 rounded-lg px-6 py-3 font-medium transition disabled:cursor-not-allowed ${
                isDarkMode 
                  ? 'bg-white text-black hover:bg-gray-200 disabled:bg-gray-600' 
                  : 'bg-black text-white hover:bg-gray-800 disabled:bg-gray-400'
              }`}
              onClick={onDownload}
              disabled={isWorking}
            >
              {isWorking ? 'Laster ned...' : 'Last ned'}
            </button>
            <button
              className={`border rounded-lg px-6 py-3 font-medium transition disabled:cursor-not-allowed ${
                isDarkMode 
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700 disabled:bg-gray-800' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100'
              }`}
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
        </div>

        {/* Info section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Støttede domener</h3>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• tv.nrk.no</li>
              <li>• www.nrk.no</li>
              <li>• nrk.no</li>
              <li>• radio.nrk.no</li>
            </ul>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
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
      </div>
    </main>
  );
}

