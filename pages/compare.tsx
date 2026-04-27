import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FileUpload } from '@/components/ui/FileUpload';
import { Loader } from '@/components/ui/Loader';
import { ArrowRight, Scale } from 'lucide-react';

export default function Compare() {
  const router = useRouter();
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile1Select = (selectedFile: File) => {
    setFile1(selectedFile);
    setError(null);
  };

  const handleFile2Select = (selectedFile: File) => {
    setFile2(selectedFile);
    setError(null);
  };

  const handleCompare = async () => {
    if (!file1 || !file2) {
      setError('Please select both PDF files to compare');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file1', file1);
      formData.append('file2', file2);

      const response = await fetch('/api/compare', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Comparison failed');
      }

      const data = await response.json();
      localStorage.setItem('nyaysetu_comparison', JSON.stringify(data));
      router.push('/comparison-results');
    } catch (err) {
      setError('Failed to compare cases. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-serif font-semibold text-primary">Compare Cases</h1>
          <Button onClick={() => router.push('/upload')} variant="secondary" size="sm" className="text-xs sm:text-sm">
            Back to Upload
          </Button>
        </div>
      </header>

      <main className="max-w-container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <Scale size={48} className="mx-auto mb-4 text-accent" />
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-primary mb-2">
              Compare Two Cases
            </h2>
            <p className="text-secondary text-sm sm:text-base">
              Upload two court judgments to compare their facts, arguments, reasoning, and outcomes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">
            <Card padding="lg">
              <h3 className="text-lg font-semibold text-primary mb-4">Case 1</h3>
              <FileUpload onFileSelect={handleFile1Select} />
            </Card>

            <Card padding="lg">
              <h3 className="text-lg font-semibold text-primary mb-4">Case 2</h3>
              <FileUpload onFileSelect={handleFile2Select} />
            </Card>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-center">
            <Button
              onClick={handleCompare}
              disabled={!file1 || !file2 || loading}
              size="lg"
              className="flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader size="sm" color="accent" />
                  Comparing...
                </>
              ) : (
                <>
                  Compare Cases
                  <ArrowRight size={18} />
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
