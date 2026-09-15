"use client";
import { useRouter } from "next/navigation";

export type STTProvider = "deepgram" | "webspeech" | "free";

type Props = {
  value: STTProvider;
  onChange: (v: STTProvider) => void;
};

const OPTIONS: { value: STTProvider; label: string; desc: string }[] = [
  { value: "deepgram", label: "Deepgram Nova-3 (Default)", desc: "Cloud streaming, 300ms, WER ~9% - cần API key" },
  { value: "webspeech", label: "Web Speech API (Browser Live)", desc: "Miễn phí, chỉ Chrome, live ngay trong browser" },
  { value: "free", label: "Free Forever → Xem chi tiết", desc: "Self-host Whisper/WASM - 0đ/tháng, đi tới trang Free" },
];

export function STTProviderSelector({ value, onChange }: Props) {
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as STTProvider;
    if (v === "free") {
      router.push("/free");
      return;
    }
    onChange(v);
    try {
      localStorage.setItem("lt:sttProvider", v);
    } catch {}
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">STT Provider</span>
      <select
        value={value}
        onChange={handleChange}
        className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm min-w-[260px]"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-zinc-500">
        {OPTIONS.find((o) => o.value === value)?.desc}
        {value === "free" && (
          <>
            {" "}
            <button onClick={() => router.push("/free")} className="underline text-amber-400">
              → Đi tới Free
            </button>
          </>
        )}
      </span>
    </label>
  );
}
