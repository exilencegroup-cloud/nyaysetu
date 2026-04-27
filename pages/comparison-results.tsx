import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loader } from '@/components/ui/Loader';
import { ArrowLeft, Scale, Check, X } from 'lucide-react';

interface ComparisonData {
  case1_snapshot: {
    case_name: string;
    court: string;
    date: string;
    judges: string;
    case_type: string;
  };
  case2_snapshot: {
    case_name: string;
    court: string;
    date: string;
    judges: string;
    case_type: string;
  };
  facts_comparison: {
    similarities: string[];
    differences: string[];
    key_insights: string;
  };
  arguments_comparison: {
    similarities: string[];
    differences: string[];
    key_insights: string;
  };
  reasoning_comparison: {
    similarities: string[];
    differences: string[];
    key_insights: string;
  };
  outcome_comparison: {
    similarities: string;
    differences: string;
    key_insights: string;
  };
  overall_assessment: string;
}

export default function ComparisonResults() {
  const router = useRouter();
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('nyaysetu_comparison');
    if (stored) {
      try {
        setComparison(JSON.parse(stored));
      } catch {
        console.error('Failed to parse stored comparison');
      }
    }
    setLoading(false);
  }, []);

  const handleNewComparison = () => {
    localStorage.removeItem('nyaysetu_comparison');
    router.push('/compare');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader size="lg" color="accent" />
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <EmptyState onUpload={handleNewComparison} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-serif font-semibold text-primary">Comparison Results</h1>
          <Button onClick={handleNewComparison} variant="secondary" size="sm" className="text-xs sm:text-sm">
            New Comparison
          </Button>
        </div>
      </header>

      <main className="max-w-container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="space-y-8 sm:space-y-12">
          {/* Case Snapshots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <Card padding="lg">
              <h3 className="text-lg font-semibold text-primary mb-4">Case 1</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Name:</span> {comparison.case1_snapshot.case_name}</p>
                <p><span className="font-medium">Court:</span> {comparison.case1_snapshot.court}</p>
                <p><span className="font-medium">Date:</span> {comparison.case1_snapshot.date}</p>
                <p><span className="font-medium">Judges:</span> {comparison.case1_snapshot.judges}</p>
                <p><span className="font-medium">Type:</span> {comparison.case1_snapshot.case_type}</p>
              </div>
            </Card>

            <Card padding="lg">
              <h3 className="text-lg font-semibold text-primary mb-4">Case 2</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Name:</span> {comparison.case2_snapshot.case_name}</p>
                <p><span className="font-medium">Court:</span> {comparison.case2_snapshot.court}</p>
                <p><span className="font-medium">Date:</span> {comparison.case2_snapshot.date}</p>
                <p><span className="font-medium">Judges:</span> {comparison.case2_snapshot.judges}</p>
                <p><span className="font-medium">Type:</span> {comparison.case2_snapshot.case_type}</p>
              </div>
            </Card>
          </div>

          {/* Overall Assessment */}
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <Scale size={20} className="text-accent" />
              <h3 className="text-lg font-semibold text-primary">Overall Assessment</h3>
            </div>
            <p className="text-secondary leading-relaxed">{comparison.overall_assessment}</p>
          </Card>

          {/* Facts Comparison */}
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-primary mb-4">Facts Comparison</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-accent mb-2 flex items-center gap-2">
                  <Check size={16} />
                  Similarities
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary">
                  {comparison.facts_comparison.similarities.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
                  <X size={16} />
                  Differences
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary">
                  {comparison.facts_comparison.differences.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-accent/5 rounded-lg">
                <p className="text-sm text-secondary italic">{comparison.facts_comparison.key_insights}</p>
              </div>
            </div>
          </Card>

          {/* Arguments Comparison */}
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-primary mb-4">Arguments Comparison</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-accent mb-2 flex items-center gap-2">
                  <Check size={16} />
                  Similarities
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary">
                  {comparison.arguments_comparison.similarities.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
                  <X size={16} />
                  Differences
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary">
                  {comparison.arguments_comparison.differences.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-accent/5 rounded-lg">
                <p className="text-sm text-secondary italic">{comparison.arguments_comparison.key_insights}</p>
              </div>
            </div>
          </Card>

          {/* Reasoning Comparison */}
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-primary mb-4">Court Reasoning Comparison</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-accent mb-2 flex items-center gap-2">
                  <Check size={16} />
                  Similarities
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary">
                  {comparison.reasoning_comparison.similarities.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
                  <X size={16} />
                  Differences
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary">
                  {comparison.reasoning_comparison.differences.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-accent/5 rounded-lg">
                <p className="text-sm text-secondary italic">{comparison.reasoning_comparison.key_insights}</p>
              </div>
            </div>
          </Card>

          {/* Outcome Comparison */}
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-primary mb-4">Outcome Comparison</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-accent mb-2">Similarities</h4>
                <p className="text-sm text-secondary">{comparison.outcome_comparison.similarities}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-red-600 mb-2">Differences</h4>
                <p className="text-sm text-secondary">{comparison.outcome_comparison.differences}</p>
              </div>
              <div className="p-3 bg-accent/5 rounded-lg">
                <p className="text-sm text-secondary italic">{comparison.outcome_comparison.key_insights}</p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
