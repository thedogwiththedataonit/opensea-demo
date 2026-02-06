"use client";

interface ChainFiltersProps {
  active: string;
  onChange: (chain: string) => void;
}

const chains = [
  { id: "all", label: "All" },
  { id: "ethereum", label: "Ξ" },
  { id: "solana", label: "◎" },
  { id: "base", label: "🔵" },
];

export default function ChainFilters({ active, onChange }: ChainFiltersProps) {
  return (
    <div className="flex items-center gap-1">
      {chains.map((chain) => (
        <button
          key={chain.id}
          onClick={() => onChange(chain.id)}
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-colors ${
            active === chain.id
              ? "bg-white text-black"
              : "bg-[#1e1e1e] text-[#8a8a8a] hover:bg-[#2a2a2a]"
          }`}
          title={chain.id}
        >
          {chain.label}
        </button>
      ))}
    </div>
  );
}
