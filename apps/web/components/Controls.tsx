"use client";

export function Controls({
  isCapturing,
  isConnected,
  onStart,
  onStop,
  onClear,
  onExportSrt,
  onExportVtt,
  fontSize,
  opacity,
  onFontChange,
  onOpacityChange
}: {
  isCapturing: boolean;
  isConnected: boolean;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onExportSrt?: () => void;
  onExportVtt?: () => void;
  fontSize: number;
  opacity: number;
  onFontChange: (n:number)=>void;
  onOpacityChange: (n:number)=>void;
}) {
  return (
    <div className="flex gap-3 items-center flex-wrap">
      <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
      <span className="text-xs text-zinc-400">{isConnected ? "Connected" : "Disconnected"}</span>
      {!isCapturing ? (
        <button onClick={onStart} className="bg-white text-black px-4 py-2 rounded font-medium hover:bg-zinc-200">
          ▶ Start Capture
        </button>
      ) : (
        <button onClick={onStop} className="bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700">
          ■ Stop
        </button>
      )}
      <button onClick={onClear} className="border border-zinc-700 px-3 py-2 rounded text-sm hover:bg-zinc-900">
        Clear
      </button>
      {onExportSrt && <button onClick={onExportSrt} className="border border-zinc-700 px-3 py-2 rounded text-sm hover:bg-zinc-900">Export .srt</button>}
      {onExportVtt && <button onClick={onExportVtt} className="border border-zinc-700 px-3 py-2 rounded text-sm hover:bg-zinc-900">Export .vtt</button>}
      <div className="flex items-center gap-2 ml-auto">
        <label className="text-xs text-zinc-400">Font <input type="range" min={14} max={26} value={fontSize} onChange={e=>onFontChange(Number(e.target.value))} className="w-20 align-middle" /> {fontSize}px</label>
        <label className="text-xs text-zinc-400">Opacity <input type="range" min={0.4} max={1} step={0.05} value={opacity} onChange={e=>onOpacityChange(Number(e.target.value))} className="w-20 align-middle" /> {Math.round(opacity*100)}%</label>
      </div>
      <span className="text-[11px] text-zinc-500 w-full">Yêu cầu quyền Share Tab Audio (Pure Web) hoặc cài Extension/Tauri để bắt system audio</span>
    </div>
  );
}
