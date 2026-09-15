"use client";

export type TranslateProvider = "ai" | "mymemory";

type Props = {
  value: TranslateProvider;
  onChange: (v: TranslateProvider) => void;
};

const OPTIONS: { value: TranslateProvider; label: string; desc: string }[] = [
  { value: "ai", label: "AI (Custom)", desc: "Dùng CUSTOM_API_KEY/BASE_URL/MODEL - OpenAI-compatible" },
  { value: "mymemory", label: "MyMemory (FREE)", desc: "Miễn phí, không cần key, ~5000 ký tự/ngày/IP" },
];

export function TranslateProviderSelector({ value, onChange }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as TranslateProvider;
    onChange(v);
    try {
      localStorage.setItem("lt:translateProvider", v);
    } catch {}
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">Translate Provider</span>
      <select
        value={value}
        onChange={handleChange}
        className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm min-w-[220px]"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-zinc-500">{OPTIONS.find((o) => o.value === value)?.desc}</span>
    </label>
  );
}
