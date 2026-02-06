"use client";

interface BadgeProps {
  variant: "verified" | "chain" | "new" | "warning";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className = "" }: BadgeProps) {
  const styles: Record<string, string> = {
    verified: "text-blue-400",
    chain: "bg-[#2a2a2a] text-[#8a8a8a] text-xs px-2 py-0.5 rounded-full",
    new: "bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
    warning: "bg-red-900/50 text-red-300 text-xs px-2 py-0.5 rounded-full",
  };

  return <span className={`${styles[variant]} ${className}`}>{children}</span>;
}

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#2081e2" className="inline-block flex-shrink-0">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

export function ChainBadge({ chain }: { chain: string }) {
  const chainLabels: Record<string, string> = {
    ethereum: "Ξ Ethereum",
    solana: "◎ Solana",
    ronin: "⬡ Ronin",
    base: "🔵 Base",
    polygon: "⬡ Polygon",
    arbitrum: "◆ Arbitrum",
  };

  return (
    <Badge variant="chain">
      {chainLabels[chain] || chain}
    </Badge>
  );
}
