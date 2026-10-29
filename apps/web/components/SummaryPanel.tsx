"use client";

export function SummaryPanel({
  summary,
  chapters,
  actionItems,
  keywords,
  onRequestSummary,
  isLoading,
  onCopy
}: {
  summary: string | null;
  chapters?: { title: string; start_ms: number }[];
  actionItems?: string[];
  keywords?: string[];
  onRequestSummary: () => void;
  isLoading: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="card h-full flex flex-col overflow-hidden">
      <div className="card-header shrink-0">
        <h3 className="text-sm font-medium">AI Summary</h3>
        <div className="flex gap-2">
          <button onClick={onRequestSummary} disabled={isLoading} className="btn-ghost btn-sm">
            {isLoading ? "Summarizing..." : "Summarize"}
          </button>
          {summary && onCopy && <button onClick={onCopy} className="btn-ghost btn-sm">Copy</button>}
        </div>
      </div>
      <div className="text-sm whitespace-pre-wrap leading-relaxed flex-1 overflow-auto p-4 scroll-smooth" aria-live="polite">
        {summary ? <div className="text-ink">{summary}</div> : <div className="text-faint">No summary yet. Press Summarize after transcript is available (buffer 30s-5m, streaming).</div>}
        {chapters && chapters.length>0 && (
          <div className="mt-3">
            <div className="label mb-1">Chapters</div>
            <ul className="list-disc pl-4 text-dim">{chapters.map((c,i)=><li key={i}>{c.title} <span className="text-faint">@{Math.floor(c.start_ms/1000)}s</span></li>)}</ul>
          </div>
        )}
        {actionItems && actionItems.length>0 && (
          <div className="mt-3">
            <div className="label mb-1">Action Items</div>
            <ul className="list-disc pl-4 text-amber-600 dark:text-amber-300">{actionItems.map((a,i)=><li key={i}>{a}</li>)}</ul>
          </div>
        )}
        {keywords && keywords.length>0 && (
          <div className="mt-3 flex flex-wrap gap-1">{keywords.map((k,i)=><span key={i} className="badge badge-chip">{k}</span>)}</div>
        )}
      </div>
    </div>
  );
}
