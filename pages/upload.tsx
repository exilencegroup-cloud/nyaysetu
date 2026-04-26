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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-primary mb-2">
            Upload Judgment
          </h1>
          <p className="text-sm sm:text-base text-secondary">
            Upload a court judgment PDF to extract structured legal intelligence
          </p>
        </div>

        <div className="bg-card rounded-card shadow-card p-6 sm:p-8">
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
            <div className="flex flex-col items-center justify-center py-8 sm:py-12">
              <Loader size="lg" color="accent" />
              <p className="mt-4 text-secondary text-sm sm:text-base">Analyzing document...</p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12">
              <div className="text-red-500 mb-4">
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx={12} cy={12} r={10} />
                  <line x1={12} y1={8} x2={12} y2={12} />
                  <line x1={12} y1={16} x2={12.01} y2={16} />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl font-medium text-primary mb-2">Analysis Failed</h2>
              <p className="text-secondary text-center mb-6 max-w-md text-sm sm:text-base">{error}</p>
              <div className="flex gap-3 flex-col sm:flex-row w-full sm:w-auto">
                <Button onClick={handleAnalyze} variant="primary" className="w-full sm:w-auto">
                  Retry
                </Button>
                <Button onClick={handleReset} variant="secondary" className="w-full sm:w-auto">
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
