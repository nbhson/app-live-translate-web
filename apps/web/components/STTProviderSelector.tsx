"use client";
import { useRouter } from "next/navigation";
import { saveSetting } from "../lib/settings";

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
    saveSetting("sttProvider", v);
  };

  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="label">STT Provider</span>
      <select value={value} onChange={handleChange} className="select">
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="hint">
        {OPTIONS.find((o) => o.value === value)?.desc}
        {value === "free" && (
          <>
            {" "}
            <button onClick={() => router.push("/free")} className="underline text-amber-500">
              → Go to Free
            </button>
          </>
        )}
      </span>
    </label>
  );
}
