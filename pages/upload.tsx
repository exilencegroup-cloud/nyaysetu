import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { FileUpload } from '@/components/ui/FileUpload';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { AppState } from '@/lib/types';

export default function Upload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<AppState>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setState('uploading');
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        setState('error');
        setError(result.message || 'Analysis failed');
        return;
      }

      // Store results in localStorage
      localStorage.setItem('nyaysetu_analysis', JSON.stringify(result.data));
      
      setState('success');
      router.push('/results');
    } catch (err) {
      setState('error');
      setError('Network error. Please check your connection.');
    }
  };

  const handleReset = () => {
    setFile(null);
    setState('idle');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <div className="w-full max-w-xl sm:max-w-2xl">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-serif font-bold text-primary mb-2">
            Upload Judgment
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-secondary px-2">
            Upload a court judgment PDF to extract structured legal intelligence
          </p>
        </div>

        <div className="bg-card rounded-card shadow-card p-4 sm:p-6 md:p-8">
          {state === 'idle' && (
            <>
              <FileUpload onFileSelect={handleFileSelect} />
              {file && (
                <div className="mt-6 flex justify-end">
                  <Button onClick={handleAnalyze} variant="primary" size="lg" className="w-full sm:w-auto">
                    Analyze Document
                  </Button>
                </div>
              )}
            </>
          )}

          {state === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-6 sm:py-8 md:py-12">
              <Loader size="lg" color="accent" />
              <p className="mt-4 text-secondary text-xs sm:text-sm md:text-base">Analyzing document...</p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-6 sm:py-8 md:py-12 px-2">
              <div className="text-red-500 mb-3 sm:mb-4">
                <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx={12} cy={12} r={10} />
                  <line x1={12} y1={8} x2={12} y2={12} />
                  <line x1={12} y1={16} x2={12.01} y2={16} />
                </svg>
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-medium text-primary mb-2">Analysis Failed</h2>
              <p className="text-secondary text-center mb-4 sm:mb-6 max-w-md text-xs sm:text-sm md:text-base">{error}</p>
              <div className="flex gap-2 sm:gap-3 flex-col sm:flex-row w-full">
                <Button onClick={handleAnalyze} variant="primary" className="w-full">
                  Retry
                </Button>
                <Button onClick={handleReset} variant="secondary" className="w-full">
                  Upload New
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/')}
            className="text-xs sm:text-sm text-muted hover:text-secondary transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
