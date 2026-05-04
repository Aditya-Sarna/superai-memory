import React, { useState } from "react";
import { motion } from "framer-motion";
import { Search as SearchIcon, Zap } from "lucide-react";
import { search, reinforceMemory } from "../lib/api";
import { TierPill, Pill } from "../components/Primitives";
import { toast } from "sonner";

const EXAMPLE_QUERIES = [
    "what project am I working on?",
    "my coffee preference",
    "deadlines coming up",
    "conversations about databases",
    "running habits",
];

export default function Search() {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const runSearch = async (q) => {
        const qq = (q ?? query).trim();
        if (!qq) return;
        setLoading(true);
        setQuery(qq);
        try {
            const r = await search({ query: qq, top_k: 8, min_score: 0.03 });
            setResult(r);
        } catch (e) {
            toast.error("Search failed.");
        } finally {
            setLoading(false);
        }
    };

    const onReinforce = async (id) => {
        await reinforceMemory(id, 0.15);
        toast.success("Reinforced.");
    };

    return (
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-12">
            <div className="chip mb-3">/search</div>
            <h1 className="font-serif text-6xl leading-none">Hybrid search</h1>
            <p className="text-[color:var(--ink-soft)] mt-3 max-w-xl">
                Semantic fingerprint + raw keyword overlap + graph relations. Each result shows which
                signals triggered — and a context window ready for LLM injection.
            </p>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    runSearch();
                }}
                className="card p-2 flex items-center gap-2 mt-8"
                data-testid="search-form"
            >
                <SearchIcon size={18} className="ml-3 text-[color:var(--ink-muted)]" />
                <input
                    className="flex-1 bg-transparent border-0 outline-0 py-3 px-2 text-base"
                    placeholder="Ask anything the agent should remember…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="search-input"
                    autoFocus
                />
                <button type="submit" className="btn btn-primary" disabled={loading} data-testid="search-btn">
                    {loading ? "Searching…" : "Search"}
                </button>
            </form>

            <div className="flex flex-wrap gap-2 mt-4">
                <span className="chip">try:</span>
                {EXAMPLE_QUERIES.map((q) => (
                    <button
                        key={q}
                        className="pill hover:bg-[color:var(--ink)] hover:text-white hover:border-transparent transition"
                        onClick={() => runSearch(q)}
                        data-testid={`example-query-${q}`}
                    >
                        {q}
                    </button>
                ))}
            </div>

            {result && (
                <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-10"
                    data-testid="search-results"
                >
                    <div className="flex items-baseline justify-between mb-4">
                        <h2 className="font-serif text-3xl">
                            {result.total} result{result.total === 1 ? "" : "s"}
                        </h2>
                        <span className="chip">{result.latency_ms} ms</span>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2 space-y-3">
                            {result.results.map((r, idx) => (
                                <article
                                    key={r.memory.id}
                                    className="card p-5"
                                    data-testid={`search-result-${idx}`}
                                >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <h3 className="font-serif text-xl">{r.memory.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <TierPill tier={r.memory.tier} />
                                            <span className="chip font-mono">
                                                {(r.score * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-[color:var(--ink-soft)] mb-3 leading-relaxed">
                                        {r.memory.summary || r.memory.content}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        <Pill variant="accent">{r.memory.scope}</Pill>
                                        <Pill>{r.memory.modality}</Pill>
                                        {r.sources.map((s) => (
                                            <Pill key={s} className="uppercase font-mono text-[10px]">
                                                {s}
                                            </Pill>
                                        ))}
                                    </div>
                                    {r.highlights.length > 0 && (
                                        <div className="text-xs text-[color:var(--ink-muted)] mb-3">
                                            <span className="chip">matched</span>{" "}
                                            {r.highlights.map((h) => (
                                                <mark key={h}>{h}</mark>
                                            ))
                                                .reduce((acc, el, i) => (i ? [...acc, " ", el] : [el]), [])}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => onReinforce(r.memory.id)}
                                        className="btn btn-subtle"
                                        data-testid={`search-reinforce-${r.memory.id}`}
                                    >
                                        <Zap size={13} /> Reinforce
                                    </button>
                                </article>
                            ))}
                            {result.results.length === 0 && (
                                <div className="text-[color:var(--ink-muted)] text-sm">
                                    Nothing scored above threshold. Try broadening the query or adding more memories.
                                </div>
                            )}
                        </div>

                        <aside className="card p-5 h-fit sticky top-24" data-testid="context-window-panel">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-serif text-xl">Context window</h3>
                                <span className="chip">for LLM</span>
                            </div>
                            <p className="text-xs text-[color:var(--ink-muted)] mb-3">
                                This is the compact, stitched context that would be injected into the agent's prompt.
                            </p>
                            <pre className="text-xs font-mono text-[color:var(--ink-soft)] whitespace-pre-wrap bg-[color:var(--bg)] rounded-lg p-3 border border-[color:var(--line)] max-h-96 overflow-auto">
{result.context_window || "(empty)"}
                            </pre>
                        </aside>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
