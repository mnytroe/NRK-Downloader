'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';

type Status = 'idle' | 'working' | 'done' | 'error' | 'aborted';

interface ProgressInfo {
  progress: number;
  downloaded: number;
  total: number;
  eta: number;
  status: string;
}

export default function Page() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState<ProgressInfo>({ progress: 0, downloaded: 0, total: 0, eta: 0, status: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Format bytes to human readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format ETA to human readable format
  const formatETA = (eta: number): string => {
    if (eta <= 0) return 'Ukjent';
    const minutes = Math.floor(eta / 60);
    const seconds = eta % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Start progress tracking
  const startProgressTracking = useCallback((videoUrl: string) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/progress?url=${encodeURIComponent(videoUrl)}`);
        if (response.ok) {
          const progressData = await response.json();
          setProgress(progressData);
          
          if (progressData.status === 'completed' || progressData.status === 'error') {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('Progress tracking error:', error);
      }
    }, 1000); // Check every second
  }, []);

  // Stop progress tracking
  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
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
      stopProgressTracking();
    };
  }, [stopProgressTracking]);

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
    setProgress({ progress: 0, downloaded: 0, total: 0, eta: 0, status: 'working' });
    
    // Start progress tracking
    startProgressTracking(cleanedUrl);
    
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
      setProgress(prev => ({ ...prev, progress: 100, status: 'completed' }));
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setStatus('aborted');
        setErrorMsg('Nedlasting avbrutt');
        setProgress(prev => ({ ...prev, status: 'aborted' }));
      } else {
        setStatus('error');
        setErrorMsg(e?.message || 'Ukjent feil');
        setProgress(prev => ({ ...prev, status: 'error' }));
      }
    } finally {
      stopProgressTracking();
    }
  }

  function onAbort() {
    abortRef.current?.abort();
    setStatus('aborted');
    setErrorMsg('Nedlasting avbrutt');
    setProgress(prev => ({ ...prev, status: 'aborted' }));
    stopProgressTracking();
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
            <div
              className={`relative w-full border-2 border-dashed rounded-lg transition-colors ${
                isDragOver 
                  ? 'border-blue-400 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                id="url-input"
                type="text"
                className="w-full border-0 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition bg-transparent"
                placeholder="https://tv.nrk.no/serie/... eller dra og slipp URL her"
                value={url}
                onChange={(e) => setUrl(cleanUrl(e.target.value))}
                onKeyPress={handleKeyPress}
                onPaste={handlePaste}
                disabled={isWorking}
              />
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-90 rounded-lg">
                  <div className="text-blue-600 font-medium">
                    📎 Slip NRK URL her
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              💡 Tips: Du kan også dra og slippe URL-er fra nettleseren eller lime inn med Ctrl+V
            </p>
            {url && url !== cleanUrl(url) && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                <strong>Ryddet URL:</strong> {cleanUrl(url)}
              </div>
            )}
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

          {/* Progress bar */}
          {isWorking && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Fremdrift</span>
                <span className="text-sm text-gray-600">
                  {Math.round(progress.progress)}%
                </span>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out relative"
                  style={{ width: `${Math.min(progress.progress, 100)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
                </div>
              </div>
              
              <div className="flex justify-between text-xs text-gray-500">
                <span>{formatBytes(progress.downloaded)}</span>
                <span>{formatBytes(progress.total)}</span>
              </div>
              
              {progress.eta > 0 && (
                <div className="text-center text-sm text-gray-600">
                  ⏱️ Gjenstående tid: {formatETA(progress.eta)}
                </div>
              )}
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

