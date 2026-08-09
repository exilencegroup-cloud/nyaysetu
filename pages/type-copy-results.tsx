import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AlertTriangle, ArrowLeft, Download, Eye, FileText, Pencil, Save, Stamp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import { buildTypeCopyDocx, buildTypeCopyPdf } from '@/lib/typeCopyExport';
import { buildTypeCopyDraftText, formatBytes, type TypeCopyPageLayout, type TypeCopyResult } from '@/lib/typeCopyDemo';
import { loadTypeCopyJob, loadTypeCopyResult, saveTypeCopyResult, type TypeCopyJob } from '@/lib/typeCopyStorage';
import { runTypeCopyJob } from '@/lib/typeCopyJobRunner';

export default function TypeCopyResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<TypeCopyResult | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [approvedAt, setApprovedAt] = useState('');
  const [message, setMessage] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [activeJob, setActiveJob] = useState<TypeCopyJob | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const runnerActiveRef = useRef(false);
  const draftDirtyRef = useRef(false);

  const pageCount = result?.pageCount || result?.pages?.length || 0;
  const processing = result?.processing;
  const processingActive = processing?.status === 'queued' || processing?.status === 'processing';
  const completedPageCount = result?.pages?.length || 0;
  const progressPercent = pageCount ? Math.min(100, Math.round((completedPageCount / pageCount) * 100)) : 0;
  const unreadableCount = useMemo(() => {
    if (result?.pages?.length) {
      return result.pages.reduce((count, page) => count + unreadableMarkerCount(page.text) + (page.status === 'not_readable' ? 1 : 0), 0);
    }

    return unreadableMarkerCount(draft);
  }, [draft, result]);
  const extractedCount = result?.pages?.filter((page) => page.status === 'extracted').length || 0;
  const ocrCount = result?.pages?.filter((page) => page.status === 'ocr').length || 0;
  const readableCount = extractedCount + ocrCount;

  useEffect(() => {
    let active = true;

    Promise.all([loadTypeCopyResult(), loadTypeCopyJob()])
      .then(([stored, job]) => {
        if (!active) return;
        if (!stored) return;

        setResult(stored);
        setDraft(stored.draftText);
        setActiveJob(job && job.status !== 'complete' ? job : null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    draftDirtyRef.current = draftDirty;
  }, [draftDirty]);

  useEffect(() => {
    if (loading || !result || !activeJob || runnerActiveRef.current) return;
    if (activeJob.status === 'complete' || activeJob.status === 'failed') return;

    let cancelled = false;
    runnerActiveRef.current = true;

    runTypeCopyJob(activeJob, result, {
      shouldStop: () => cancelled,
      onUpdate: (nextResult, nextJob) => {
        setResult(nextResult);
        setActiveJob(nextJob);
        setMessage(nextResult.processing?.message || '');

        if (!draftDirtyRef.current) {
          setDraft(nextResult.draftText);
        }
      },
    })
      .then((nextResult) => {
        if (!nextResult || cancelled) return;
        setResult(nextResult);
        setActiveJob(null);
        setMessage('Type Copy processing complete.');
        if (!draftDirtyRef.current) setDraft(nextResult.draftText);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setMessage(error.message || 'Type Copy processing stopped.');
      })
      .finally(() => {
        runnerActiveRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [loading]);

  async function saveDraft() {
    if (!result) return;
    const nextResult = buildPreviewResultFromDraft(result, draft);
    await saveTypeCopyResult(nextResult);
    setResult(nextResult);
    setDraft(nextResult.draftText);
    setDraftDirty(false);
    setApprovedAt('');
    setViewMode('preview');
    setMessage('Changes saved and preview updated.');
  }

  function approve() {
    if (processingActive) {
      setMessage('Type Copy is still processing. You can review completed pages now and approve after all pages finish.');
      return;
    }

    const timestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    setApprovedAt(timestamp);
    setMessage('Type Copy approved for export.');
  }

  function exportFile(format: 'docx' | 'pdf') {
    if (!result) return;
    if (!approvedAt) {
      setMessage(processingActive ? 'Wait for all pages to finish before export.' : 'Approve the Type Copy before export.');
      return;
    }

    const metadata = {
      fileName: result.fileName,
      documentId: result.documentId,
      approvedAt,
    };
    const bytes = format === 'docx' ? buildTypeCopyDocx(draft, metadata) : buildTypeCopyPdf(draft, metadata);
    const mime = format === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf';
    const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([blobBytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${result.documentId.toLowerCase()}-type-copy.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${format.toUpperCase()} export generated.`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader size="lg" color="accent" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card padding="lg" className="max-w-md text-center">
          <FileText size={56} className="mx-auto text-muted" />
          <h1 className="mt-4 text-xl font-serif font-semibold text-primary">No Type Copy result</h1>
          <p className="mt-2 text-sm text-secondary">Upload a scanned legal document to generate a Type Copy.</p>
          <Button onClick={() => router.push('/type-copy')} className="mt-6">
            Upload Document
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Type Copy Result | NyaySetu</title>
      </Head>
      <style jsx global>{`
        .type-copy-layout {
          font-family: Georgia, "Times New Roman", serif;
        }
        .type-copy-layout pre {
          margin: 0;
          overflow: visible;
          white-space: pre;
          font-family: "Courier New", monospace;
          line-height: 1.55;
        }
        .type-copy-layout p,
        .type-copy-layout div {
          margin: 0 0 0.75rem;
        }
        .type-copy-layout .type-copy-page,
        .type-copy-layout .type-copy-page div {
          margin: 0;
        }
        .type-copy-layout .type-copy-page {
          min-width: 100%;
        }
        .type-copy-layout table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
        }
        .type-copy-layout th,
        .type-copy-layout td {
          border: 1px solid #2f2a22;
          padding: 0.35rem 0.5rem;
          vertical-align: top;
        }
        .type-copy-layout th {
          font-weight: 700;
        }
      `}</style>

      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="max-w-container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <button
                onClick={() => router.push('/type-copy')}
                className="mb-2 inline-flex items-center gap-2 text-xs text-muted hover:text-secondary transition-colors"
              >
                <ArrowLeft size={15} />
                Upload New
              </button>
              <h1 className="text-lg sm:text-xl font-serif font-semibold text-primary">Type Copy Result</h1>
              <p className="mt-1 text-xs sm:text-sm text-secondary">{result.fileName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveDraft} variant="secondary" size="sm">
                <Save size={15} className="mr-2" />
                Save & Preview
              </Button>
              <Button onClick={approve} size="sm">
                Approve
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-container mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="grid gap-4 self-start">
              <Card padding="md">
                <p className="text-xs uppercase tracking-[0.16em] text-accent font-semibold">Uploaded file</p>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Document ID</dt>
                    <dd className="mt-1 break-all font-medium text-primary">{result.documentId}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Type</dt>
                    <dd className="font-medium uppercase text-primary">{result.extension}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Size</dt>
                    <dd className="font-medium text-primary">{formatBytes(result.fileSize)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Pages</dt>
                    <dd className="font-medium text-primary">{pageCount || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Processed</dt>
                    <dd className="mt-1 text-primary">{result.processedAt}</dd>
                  </div>
                </dl>
              </Card>

              <Card padding="md">
                <p className="text-xs uppercase tracking-[0.16em] text-accent font-semibold">Review markers</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-700">
                    <div className="flex items-center gap-2 font-semibold">
                      <AlertTriangle size={16} />
                      (Unreadable)
                    </div>
                    <p className="mt-1 text-sm">{unreadableCount} marker{unreadableCount === 1 ? '' : 's'}</p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-700">
                    <div className="flex items-center gap-2 font-semibold">
                      <Stamp size={16} />
                      Readable pages
                    </div>
                    <p className="mt-1 text-sm">{readableCount} of {pageCount || 0} pages</p>
                    <p className="mt-1 text-xs">{ocrCount} OCR, {extractedCount} text layer</p>
                  </div>
                </div>
              </Card>
            </aside>

            <section className="grid gap-5">
              {processing ? (
                <Card padding="md">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.16em] text-accent font-semibold">
                        {processing.status === 'failed' ? 'Processing stopped' : processingActive ? 'Processing live' : 'Processing complete'}
                      </p>
                      <h2 className="mt-2 text-lg font-serif font-semibold text-primary">
                        {completedPageCount} of {pageCount} pages ready
                      </h2>
                      <p className={`mt-1 text-sm ${processing.status === 'failed' ? 'text-red-600' : 'text-secondary'}`}>
                        {processing.error || processing.message || 'Completed pages appear here while OCR continues.'}
                      </p>
                    </div>
                    {processingActive ? (
                      <div className="flex items-center gap-3 text-sm text-secondary">
                        <Loader size="sm" color="accent" />
                        <span>Batch size: {processing.chunkSize} page{processing.chunkSize === 1 ? '' : 's'}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </Card>
              ) : null}

              <Card padding="lg">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-accent font-semibold">Generated output</p>
                    <h2 className="mt-2 text-2xl font-serif font-semibold text-primary">Editable Type Copy</h2>
                    <p className="mt-2 text-sm text-secondary">Review and correct highlighted placeholders before export.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border bg-background p-1">
                      <button
                        type="button"
                        onClick={() => setViewMode('edit')}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${
                          viewMode === 'edit' ? 'bg-primary text-white' : 'text-secondary hover:bg-card'
                        }`}
                        aria-pressed={viewMode === 'edit'}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${
                          viewMode === 'preview' ? 'bg-primary text-white' : 'text-secondary hover:bg-card'
                        }`}
                        aria-pressed={viewMode === 'preview'}
                      >
                        <Eye size={14} />
                        Preview
                      </button>
                    </div>
                  </div>
                </div>

                {viewMode === 'edit' ? (
                  <textarea
                    className="mt-5 min-h-[32rem] w-full resize-y overflow-auto rounded-card border border-border bg-background p-4 font-mono text-sm leading-6 text-primary outline-none transition focus:border-accent focus:shadow-focus"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setDraftDirty(true);
                      setApprovedAt('');
                      setMessage('Unsaved changes.');
                    }}
                    aria-label="Editable Type Copy"
                    spellCheck={false}
                    wrap="off"
                  />
                ) : (
                  <div
                    className="mt-5 max-h-[56rem] overflow-auto rounded-card border border-border bg-background p-3 sm:p-5"
                    aria-label="Type Copy layout preview"
                  >
                    {result.pages?.length ? (
                      <div className="grid gap-5">
                        {result.pages.map((page) => (
                          <article
                            key={page.pageNumber}
                            className="mx-auto min-h-[42rem] w-full min-w-[44rem] max-w-[52rem] border border-border bg-white p-8 text-primary shadow-sm"
                          >
                            <div className="mb-5 flex items-center justify-between border-b border-border pb-3 text-xs text-muted">
                              <span>Page {page.pageNumber} of {pageCount}</span>
                              <span className="uppercase">{page.status}</span>
                            </div>
                            <div
                              className="type-copy-layout text-sm leading-6"
                              dangerouslySetInnerHTML={{
                                __html: page.pageLayout
                                  ? pageLayoutToPreviewHtml(page.pageLayout)
                                  : page.layoutHtml || textToPreviewHtml(page.text || draft),
                              }}
                            />
                          </article>
                        ))}
                        {processingActive ? (
                          <article className="mx-auto flex min-h-[16rem] w-full min-w-[44rem] max-w-[52rem] items-center justify-center border border-dashed border-border bg-card p-8 text-center text-secondary">
                            <div>
                              <Loader size="md" color="accent" />
                              <p className="mt-4 text-sm">More pages are being processed...</p>
                            </div>
                          </article>
                        ) : null}
                      </div>
                    ) : (
                      <pre className="font-mono text-sm leading-6 text-primary" style={{ tabSize: 4 }}>
                        {draft}
                      </pre>
                    )}
                  </div>
                )}
              </Card>

              <Card padding="md">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-serif font-semibold text-primary">Export</h2>
                    <p className="mt-1 text-sm text-secondary">Approve once review is complete, then export DOCX or PDF.</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button onClick={() => exportFile('docx')} disabled={!approvedAt || processingActive}>
                      <FileText size={16} className="mr-2" />
                      Export DOCX
                    </Button>
                    <Button onClick={() => exportFile('pdf')} variant="secondary" disabled={!approvedAt || processingActive}>
                      <Download size={16} className="mr-2" />
                      Export PDF
                    </Button>
                  </div>
                </div>
                {message ? (
                  <p className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-primary" role="status">
                    {message}
                  </p>
                ) : null}
              </Card>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}

const canonicalPreviewPageWidth = 1000;
const canonicalPreviewPageHeight = 1414;

function pageLayoutToPreviewHtml(layout: TypeCopyPageLayout) {
  const normalized = normalizePreviewPageLayout(layout);
  if (!normalized.blocks.length) return '';

  const ratio = `${roundPreviewNumber(normalized.pageWidth)} / ${roundPreviewNumber(normalized.pageHeight)}`;
  const blocks = normalized.blocks.map((block) => {
    const style = [
      'position:absolute',
      `left:${previewPercent(block.x, normalized.pageWidth)}%`,
      `top:${previewPercent(block.y, normalized.pageHeight)}%`,
      `width:${previewPercent(block.width, normalized.pageWidth)}%`,
      `min-height:${previewPercent(block.height, normalized.pageHeight)}%`,
      `text-align:${block.align}`,
      'white-space:pre-wrap',
      'line-height:1.32',
      'overflow:visible',
      block.kind === 'header' ? 'font-weight:700' : '',
      block.kind === 'table' ? 'border:1px solid #4b4236;padding:0.35rem' : '',
      block.kind === 'unreadable' ? 'color:#92400e' : '',
    ].filter(Boolean).join(';');

    return `<div style="${style}">${renderPreviewBlockContent(block)}</div>`;
  }).join('');

  return `<div class="type-copy-page" style="position:relative;width:100%;aspect-ratio:${ratio};font-family:'Nirmala UI','Noto Serif Gujarati',Georgia,'Times New Roman',serif;font-size:13px;color:#211b14;background:#fff;">${blocks}</div>`;
}

function normalizePreviewPageLayout(layout: TypeCopyPageLayout): TypeCopyPageLayout {
  const metrics = previewLayoutMetrics(layout);
  const useCanonicalScale = layout.pageWidth > canonicalPreviewPageWidth * 1.45
    && layout.pageHeight > canonicalPreviewPageHeight * 1.45
    && metrics.maxRight > 0
    && metrics.maxBottom > 0
    && metrics.maxRight <= canonicalPreviewPageWidth * 1.15
    && metrics.maxBottom <= canonicalPreviewPageHeight * 1.15;

  if (!useCanonicalScale) return layout;

  return {
    ...layout,
    pageWidth: canonicalPreviewPageWidth,
    pageHeight: canonicalPreviewPageHeight,
    blocks: layout.blocks.map((block) => ({
      ...block,
      x: clampPreviewNumber(block.x, 0, canonicalPreviewPageWidth),
      y: clampPreviewNumber(block.y, 0, canonicalPreviewPageHeight),
      width: clampPreviewNumber(block.width, 1, Math.max(1, canonicalPreviewPageWidth - Math.min(block.x, canonicalPreviewPageWidth))),
      height: clampPreviewNumber(block.height, 1, Math.max(1, canonicalPreviewPageHeight - Math.min(block.y, canonicalPreviewPageHeight))),
    })),
  };
}

function previewLayoutMetrics(layout: TypeCopyPageLayout) {
  return layout.blocks.reduce((metrics, block) => ({
    maxRight: Math.max(metrics.maxRight, block.x + block.width),
    maxBottom: Math.max(metrics.maxBottom, block.y + block.height),
  }), { maxRight: 0, maxBottom: 0 });
}

function renderPreviewBlockText(text: string) {
  return escapeHtml(text)
    .replace(/\(Unreadable\)/g, '<span style="background:#fef3c7;color:#92400e;padding:0 0.18rem;border-radius:0.2rem;">(Unreadable)</span>');
}

function renderPreviewBlockContent(block: TypeCopyPageLayout['blocks'][number]) {
  if (block.kind === 'table') return tableTextToPreviewHtml(block.text);
  return renderPreviewBlockText(block.text);
}

function tableTextToPreviewHtml(text: string) {
  const rows = text
    .split(/\n+/)
    .map(splitPreviewTableCells)
    .filter((cells) => cells.length);

  if (!rows.length || !rows.some((cells) => cells.length > 1)) {
    return renderPreviewBlockText(text);
  }

  const cellCount = Math.max(...rows.map((cells) => cells.length));
  const htmlRows = rows.map((cells) => {
    const htmlCells = Array.from({ length: cellCount }, (_, index) => (
      `<td style="border:1px solid #4b4236;padding:0.28rem 0.4rem;vertical-align:top;">${renderPreviewBlockText(cells[index] || '')}</td>`
    )).join('');

    return `<tr>${htmlCells}</tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse;font-size:inherit;line-height:1.25;">${htmlRows}</table>`;
}

function splitPreviewTableCells(row: string) {
  const cells = row.split(/\t+|\s*\|\s*|\s{2,}/).map((cell) => cell.trim());

  while (cells.length && !cells[0]) cells.shift();
  while (cells.length && !cells[cells.length - 1]) cells.pop();

  return cells.some(Boolean) ? cells : [];
}

function previewPercent(value: number, total: number) {
  return roundPreviewNumber((value / Math.max(total, 1)) * 100);
}

function clampPreviewNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundPreviewNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function textToPreviewHtml(text: string) {
  return `<pre>${escapeHtml(text)}</pre>`;
}

function buildPreviewResultFromDraft(result: TypeCopyResult, draft: string): TypeCopyResult {
  const draftPages = parseDraftPages(draft);

  if (!result.pages?.length || draftPages.size === 0) {
    return {
      ...result,
      draftText: draft,
      pages: [
        {
          pageNumber: 1,
          text: draft,
          layoutHtml: textToPreviewHtml(draft),
          status: result.pages?.[0]?.status || 'ocr',
        },
      ],
      pageCount: 1,
    };
  }

  const pages = result.pages.map((page) => {
    const editedText = draftPages.get(page.pageNumber);
    if (editedText === undefined) return page;

    const originalText = normalizePreviewText(page.text);
    const nextText = normalizePreviewText(editedText);

    if (originalText === nextText) {
      return {
        ...page,
        text: editedText,
        layoutHtml: page.layoutHtml || textToPreviewHtml(editedText),
      };
    }

    return {
      ...page,
      text: editedText,
      layoutHtml: textToPreviewHtml(editedText),
      pageLayout: undefined,
    };
  });

  return {
    ...result,
    draftText: buildTypeCopyDraftText(result.fileName, result.documentId, pages, result.pageCount),
    pages,
    pageCount: result.pageCount,
    processing: result.processing
      ? {
        ...result.processing,
        processedPages: pages.length,
      }
      : result.processing,
  };
}

function parseDraftPages(draft: string) {
  const pages = new Map<number, string>();
  const marker = /---\s*Page\s+(\d+)\s+of\s+\d+\s*---/gi;
  const matches = [...draft.matchAll(marker)];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const pageNumber = Number(current[1]);
    const start = (current.index || 0) + current[0].length;
    const end = next?.index ?? draft.length;

    pages.set(pageNumber, draft.slice(start, end).replace(/^\n+|\n+$/g, ''));
  }

  return pages;
}

function normalizePreviewText(text: string) {
  return text.replace(/\r\n?/g, '\n').trim();
}

function unreadableMarkerCount(text: string) {
  return (text.match(/\((?:Unreadable|Not Readable)\)/gi) || []).length;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
