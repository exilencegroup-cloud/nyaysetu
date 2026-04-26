import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LegalAnalysis } from '@/lib/types';
import { CaseSnapshot } from '@/components/sections/CaseSnapshot';
import { Facts } from '@/components/sections/Facts';
import { LegalIssues } from '@/components/sections/LegalIssues';
import { Arguments } from '@/components/sections/Arguments';
import { CourtReasoning } from '@/components/sections/CourtReasoning';
import { FinalOutcome } from '@/components/sections/FinalOutcome';
import { KeyTakeaways } from '@/components/sections/KeyTakeaways';
import { ReusableArguments } from '@/components/sections/ReusableArguments';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loader } from '@/components/ui/Loader';

export default function Results() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<LegalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('nyaysetu_analysis');
    if (stored) {
      try {
        setAnalysis(JSON.parse(stored));
      } catch {
        console.error('Failed to parse stored analysis');
      }
    }
    setLoading(false);
  }, []);

  const handleNewUpload = () => {
    localStorage.removeItem('nyaysetu_analysis');
    router.push('/upload');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader size="lg" color="accent" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <EmptyState onUpload={handleNewUpload} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-container mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-serif font-semibold text-primary">Analysis Results</h1>
          <Button onClick={handleNewUpload} variant="secondary" size="sm">
            Upload New
          </Button>
        </div>
      </header>

      <main className="max-w-container mx-auto px-6 py-12">
        <div className="space-y-12">
          <CaseSnapshot data={analysis.snapshot} />
          <Facts data={analysis.facts} />
          <LegalIssues data={analysis.legal_issues} />
          <Arguments data={analysis.arguments} />
          <CourtReasoning data={analysis.court_reasoning} />
          <FinalOutcome data={analysis.outcome} />
          <KeyTakeaways data={analysis.key_takeaways} />
          <ReusableArguments data={analysis.reusable_arguments} />
        </div>
      </main>
    </div>
  );
}
