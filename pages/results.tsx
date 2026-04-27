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
import { RiskFlags } from '@/components/sections/RiskFlags';
import { ChatPanel } from '@/components/sections/ChatPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loader } from '@/components/ui/Loader';
import { SourcePanel } from '@/components/ui/SourcePanel';
import { MessageSquare } from 'lucide-react';

export default function Results() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<LegalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [sourceData, setSourceData] = useState({
    snippet: '',
    highlightText: '',
    hint: '',
    pageNumber: undefined as number | undefined,
    paragraphNumber: undefined as number | undefined,
  });

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

  const handleViewSource = (snippet: string, highlightText: string, hint?: string, pageNumber?: number, paragraphNumber?: number) => {
    setSourceData({
      snippet,
      highlightText,
      hint: hint || '',
      pageNumber,
      paragraphNumber,
    });
    setSourcePanelOpen(true);
  };

  const handleCloseSource = () => {
    setSourcePanelOpen(false);
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
        <div className="max-w-container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-serif font-semibold text-primary">Analysis Results</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChatPanelOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-xs sm:text-sm"
            >
              <MessageSquare size={18} />
              Ask AI
            </button>
            <Button onClick={handleNewUpload} variant="secondary" size="sm" className="text-xs sm:text-sm">
              Upload New
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="space-y-8 sm:space-y-12">
          <CaseSnapshot data={analysis.snapshot} />
          {analysis.risks && analysis.risks.length > 0 && (
            <RiskFlags data={analysis.risks} />
          )}
          <Facts data={analysis.facts} onViewSource={handleViewSource} />
          <LegalIssues data={analysis.legal_issues} onViewSource={handleViewSource} />
          <Arguments data={analysis.arguments} onViewSource={handleViewSource} />
          <CourtReasoning data={analysis.court_reasoning} onViewSource={handleViewSource} />
          <FinalOutcome data={analysis.outcome} />
          <KeyTakeaways data={analysis.key_takeaways} onViewSource={handleViewSource} />
          <ReusableArguments data={analysis.reusable_arguments} onViewSource={handleViewSource} />
        </div>
      </main>

      <SourcePanel
        isOpen={sourcePanelOpen}
        onClose={handleCloseSource}
        sourceSnippet={sourceData.snippet}
        highlightText={sourceData.highlightText}
        sourceHint={sourceData.hint || undefined}
        pageNumber={sourceData.pageNumber}
        paragraphNumber={sourceData.paragraphNumber}
      />
      <ChatPanel
        isOpen={chatPanelOpen}
        onClose={() => setChatPanelOpen(false)}
        caseData={analysis}
      />
    </div>
  );
}
