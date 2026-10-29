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
      <span className="text-xs text-dim">{isConnected ? "Connected" : "Disconnected"}</span>
      {!isCapturing ? (
        <button onClick={onStart} className="btn-primary">
          ▶ Start Capture
        </button>
      ) : (
        <button onClick={onStop} className="btn-danger">
          ■ Stop
        </button>
      )}
      <button onClick={onClear} className="btn-ghost">
        Clear
      </button>
      {onExportSrt && <button onClick={onExportSrt} className="btn-ghost">Export .srt</button>}
      {onExportVtt && <button onClick={onExportVtt} className="btn-ghost">Export .vtt</button>}
      <div className="flex items-center gap-2 ml-auto">
        <label className="text-xs text-dim">Font <input type="range" min={14} max={26} value={fontSize} onChange={e=>onFontChange(Number(e.target.value))} className="w-20 align-middle" /> {fontSize}px</label>
        <label className="text-xs text-dim">Opacity <input type="range" min={0.4} max={1} step={0.05} value={opacity} onChange={e=>onOpacityChange(Number(e.target.value))} className="w-20 align-middle" /> {Math.round(opacity*100)}%</label>
      </div>
      <span className="text-[11px] text-faint w-full">Requires Share Tab Audio permission (Pure Web) or install Extension/Tauri to capture system audio</span>
    </div>
  );
}
