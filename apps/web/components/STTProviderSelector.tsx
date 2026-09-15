"use client";
import { useRouter } from "next/navigation";

export type STTProvider = "deepgram" | "webspeech" | "free";

type Props = {
  value: STTProvider;
  onChange: (v: STTProvider) => void;
};

const OPTIONS: { value: STTProvider; label: string; desc: string }[] = [
  { value: "deepgram", label: "Deepgram Nova-3 (Default)", desc: "Cloud streaming, 300ms, WER ~9% - API key required" },
  { value: "webspeech", label: "Web Speech API (Browser Live)", desc: "Free, Chrome only, live in browser" },
  { value: "free", label: "Free Forever → View details", desc: "Self-host Whisper/WASM - $0/month, go to Free page" },
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
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-400">STT Provider</span>
      <select
        value={value}
        onChange={handleChange}
        className="h-9 bg-zinc-900 border border-zinc-700 rounded-lg px-3 text-sm w-full focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="text-[11px] leading-tight text-zinc-500 min-h-[28px]">
        {OPTIONS.find((o) => o.value === value)?.desc}
        {value === "free" && (
          <>
            {" "}
            <button onClick={() => router.push("/free")} className="underline text-amber-400">
              → Go to Free
            </button>
          </>
        )}
      </span>
    </label>
  );
}
