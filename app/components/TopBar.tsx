"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import SearchModal from "./SearchModal";

export default function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle '/' keyboard shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !searchOpen && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  return (
    <>
      <header className="fixed top-0 left-[52px] right-0 h-[56px] bg-[#121212] border-b border-[#2a2a2a] flex items-center px-4 z-40">
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-[#8a8a8a] hover:border-[#555] transition-colors w-[320px]"
          ref={inputRef as unknown as React.RefObject<HTMLButtonElement>}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="text-sm">Search OpenSea</span>
          <span className="ml-auto text-xs bg-[#333] px-1.5 py-0.5 rounded">/</span>
        </button>

        <div className="flex-1" />

        {/* Connect Wallet */}
        <Link
          href="#"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Connect Wallet
        </Link>
      </header>

      {/* Search Modal */}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}
