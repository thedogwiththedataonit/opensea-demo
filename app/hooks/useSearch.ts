"use client";

import { useState, useCallback, useRef } from "react";
import { SearchResult } from "@/app/lib/data/types";

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!q || q.length < 1) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  const clear = useCallback(() => {
    setQuery("");
    setResults(null);
    setLoading(false);
  }, []);

  return { query, results, loading, search, clear };
}
