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
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">AI Summary (Phase 3)</h3>
        <div className="flex gap-2">
          <button
            onClick={onRequestSummary}
            disabled={isLoading}
            className="text-xs bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded hover:bg-zinc-700 disabled:opacity-50"
          >
            {isLoading ? "Đang tóm tắt..." : "Tóm tắt"}
          </button>
          {summary && onCopy && <button onClick={onCopy} className="text-xs border border-zinc-700 px-2 py-1 rounded">Copy</button>}
        </div>
      </div>
      <div className="text-sm whitespace-pre-wrap leading-relaxed flex-1 overflow-auto">
        {summary ? <div className="text-zinc-200">{summary}</div> : <div className="text-zinc-500">Chưa có tóm tắt. Bấm Tóm tắt sau khi có transcript (buffer 30s-5p, streaming).</div>}
        {chapters && chapters.length>0 && (
          <div className="mt-3">
            <div className="text-xs text-zinc-400 mb-1">Chapters</div>
            <ul className="list-disc pl-4 text-zinc-300">{chapters.map((c,i)=><li key={i}>{c.title} <span className="text-zinc-500">@{Math.floor(c.start_ms/1000)}s</span></li>)}</ul>
          </div>
        )}
        {actionItems && actionItems.length>0 && (
          <div className="mt-3">
            <div className="text-xs text-zinc-400 mb-1">Action Items</div>
            <ul className="list-disc pl-4 text-amber-200">{actionItems.map((a,i)=><li key={i}>{a}</li>)}</ul>
          </div>
        )}
        {keywords && keywords.length>0 && (
          <div className="mt-3 flex flex-wrap gap-1">{keywords.map((k,i)=><span key={i} className="text-xs bg-zinc-800 px-2 py-1 rounded">{k}</span>)}</div>
        )}
      </div>
    </div>
  );
}
