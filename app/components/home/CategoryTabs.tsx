"use client";

interface CategoryTabsProps {
  active: string;
  onChange: (category: string) => void;
}

const categories = [
  { id: "all", label: "All", icon: "" },
  { id: "gaming", label: "Gaming", icon: "🎮" },
  { id: "art", label: "Art", icon: "✏️" },
  { id: "pfps", label: "PFPs", icon: "👤" },
];

export default function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  return (
    <div className="flex items-center gap-2">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            active === cat.id
              ? "bg-white text-black"
              : "bg-[#1e1e1e] text-[#8a8a8a] hover:text-white hover:bg-[#2a2a2a]"
          }`}
        >
          {cat.icon && <span>{cat.icon}</span>}
          {cat.label}
        </button>
      ))}
      <button className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-[#1e1e1e] text-[#8a8a8a] hover:text-white hover:bg-[#2a2a2a] transition-colors">
        More
      </button>
    </div>
  );
}
