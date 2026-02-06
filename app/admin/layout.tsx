/**
 * Admin Layout — Standalone (no sidebar/topbar)
 * Dark theme admin interface for observability controls.
 */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-[#2a2a2a] px-6 py-4 flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">OS</div>
        <div>
          <h1 className="text-lg font-semibold">OpenSea Admin</h1>
          <p className="text-xs text-[#8a8a8a]">Observability Controls & Traffic Simulator</p>
        </div>
        <div className="ml-auto">
          <a href="/" className="text-xs text-blue-400 hover:text-blue-300">← Back to Marketplace</a>
        </div>
      </header>
      {children}
    </div>
  );
}
