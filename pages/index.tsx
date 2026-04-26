import React from 'react';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';
import { FileSearch, Scale } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  const handleUpload = () => {
    router.push('/upload');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-accent/10 rounded-2xl">
            <Scale size={48} className="text-accent" />
          </div>
        </div>
        
        <h1 className="text-4xl sm:text-5xl font-serif font-bold text-primary mb-4">
          Legal Intelligence Assistant
        </h1>
        
        <p className="text-base sm:text-lg text-secondary mb-8 max-w-md mx-auto leading-relaxed">
          Upload court judgment PDFs and extract structured legal intelligence in seconds.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button onClick={handleUpload} variant="primary" size="lg">
            <FileSearch size={20} className="mr-2" />
            Upload Judgment
          </Button>
        </div>
        
        <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-left">
          <div className="p-4 sm:p-6 bg-card rounded-card shadow-card">
            <div className="text-accent font-semibold mb-2 text-sm sm:text-base">Extract</div>
            <p className="text-xs sm:text-sm text-secondary">Automatically extract case facts, issues, and arguments</p>
          </div>
          <div className="p-4 sm:p-6 bg-card rounded-card shadow-card">
            <div className="text-accent font-semibold mb-2 text-sm sm:text-base">Analyze</div>
            <p className="text-xs sm:text-sm text-secondary">AI-powered analysis of court reasoning and outcomes</p>
          </div>
          <div className="p-4 sm:p-6 bg-card rounded-card shadow-card">
            <div className="text-accent font-semibold mb-2 text-sm sm:text-base">Reuse</div>
            <p className="text-xs sm:text-sm text-secondary">Build reusable arguments from precedents</p>
          </div>
        </div>
      </div>
    </div>
  );
}
