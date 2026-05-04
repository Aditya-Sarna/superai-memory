import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Zap, Search as SearchIcon } from "lucide-react";
import { listMemories, deleteMemory, reinforceMemory } from "../lib/api";
import { TierPill, Pill, EmptyState, Gauge } from "../components/Primitives";
import AddMemoryModal from "../components/AddMemoryModal";
import { toast } from "sonner";

const TIERS = ["all", "hot", "warm", "cold"];
const SCOPES = ["all", "global", "work", "personal", "interaction"];

export default function Memories() {
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterTier, setFilterTier] = useState("all");
    const [filterScope, setFilterScope] = useState("all");
    const [query, setQuery] = useState("");
    const [openAdd, setOpenAdd] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterTier !== "all") params.tier = filterTier;
            if (filterScope !== "all") params.scope = filterScope;
            if (query.trim()) params.q = query.trim();
            const data = await listMemories(params);
            setMemories(data);
        } catch (e) {
            toast.error("Failed to load memories.");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterTier, filterScope]);

    const onDelete = async (id) => {
        if (!window.confirm("Delete this memory? This is a soft delete.")) return;
        await deleteMemory(id);
        toast.success("Memory removed.");
        setMemories((xs) => xs.filter((m) => m.id !== id));
    };

    const onReinforce = async (id) => {
        try {
            const m = await reinforceMemory(id, 0.15);
            setMemories((xs) => xs.map((x) => (x.id === id ? m : x)));
            toast.success("Memory reinforced — pushed toward hot tier.");
        } catch {
            toast.error("Reinforce failed.");
        }
    };

    const counts = useMemo(() => {
        const c = { all: memories.length, hot: 0, warm: 0, cold: 0 };
        memories.forEach((m) => { c[m.tier] = (c[m.tier] || 0) + 1; });
        return c;
    }, [memories]);

    return (
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-12">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                <div>
                    <div className="chip mb-3">/memories</div>
                    <h1 className="font-serif text-6xl leading-none">Memories</h1>
                    <p className="text-[color:var(--ink-soft)] mt-3 max-w-xl">
                        Every memory stored here is LLM-enriched with keywords, entities, and a short summary —
                        so retrieval stays semantic, not literal.
                    </p>
                </div>
                <button onClick={() => setOpenAdd(true)} className="btn btn-primary" data-testid="open-add-memory-btn">
                    <Plus size={14} /> New memory
                </button>
            </div>

            <div className="card p-3 flex flex-wrap items-center gap-2 mb-6" data-testid="memories-filter-bar">
                <div className="flex items-center gap-1 px-2">
                    <SearchIcon size={15} className="text-[color:var(--ink-muted)]" />
                    <input
                        className="bg-transparent border-0 outline-0 text-sm py-2 w-56"
                        placeholder="Filter memories…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && load()}
                        data-testid="memories-filter-input"
                    />
                </div>
                <div className="hline md:hidden w-full" />
                <div className="flex gap-1 ml-auto flex-wrap">
                    {TIERS.map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilterTier(t)}
                            className={`btn ${filterTier === t ? "btn-primary" : "btn-subtle"}`}
                            data-testid={`tier-filter-${t}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 flex-wrap">
                    {SCOPES.map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilterScope(s)}
                            className={`btn ${filterScope === s ? "btn-ghost" : "btn-subtle"}`}
                            data-testid={`scope-filter-${s}`}
                        >
                            #{s}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="text-[color:var(--ink-muted)] text-sm">Loading memories…</div>
            ) : memories.length === 0 ? (
                <EmptyState
                    title="No memories yet"
                    hint="Click “New memory” to store your first one. It will be auto-enriched with entities and keywords."
                    action={<button onClick={() => setOpenAdd(true)} className="btn btn-primary" data-testid="empty-add-memory-btn"><Plus size={14}/> New memory</button>}
                />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <AnimatePresence>
                        {memories.map((m) => (
                            <motion.article
                                key={m.id}
                                layout
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.97 }}
                                className="card p-5"
                                data-testid={`memory-card-${m.id}`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <h3 className="font-serif text-2xl leading-snug">
                                        {m.title || m.content.slice(0, 80)}
                                    </h3>
                                    <TierPill tier={m.tier} />
                                </div>
                                <p className="text-sm text-[color:var(--ink-soft)] mb-4 leading-relaxed">
                                    {m.content}
                                </p>
                                {m.summary && (
                                    <p className="text-xs italic text-[color:var(--ink-muted)] mb-4">
                                        Summary: {m.summary}
                                    </p>
                                )}

                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    <Pill variant="accent">{m.scope}</Pill>
                                    <Pill>{m.modality}</Pill>
                                    {m.tags?.map((t) => <Pill key={t}>#{t}</Pill>)}
                                </div>

                                {m.keywords?.length > 0 && (
                                    <div className="text-xs text-[color:var(--ink-muted)] mb-3">
                                        <span className="chip">keywords</span>{" "}
                                        {m.keywords.slice(0, 8).join(" · ")}
                                    </div>
                                )}
                                {m.entities?.length > 0 && (
                                    <div className="text-xs text-[color:var(--ink-muted)] mb-4">
                                        <span className="chip">entities</span>{" "}
                                        {m.entities.slice(0, 6).join(" · ")}
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mb-3 text-xs text-[color:var(--ink-muted)]">
                                    <span>importance</span>
                                    <div className="flex-1">
                                        <Gauge value={m.importance_score} color="var(--ink)" />
                                    </div>
                                    <span className="chip">{m.importance_score.toFixed(2)}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => onReinforce(m.id)}
                                        className="btn btn-ghost"
                                        data-testid={`reinforce-${m.id}`}
                                        title="Reinforce — boosts importance and warms the memory"
                                    >
                                        <Zap size={14} /> Reinforce
                                    </button>
                                    <button
                                        onClick={() => onDelete(m.id)}
                                        className="btn btn-subtle text-red-600"
                                        data-testid={`delete-${m.id}`}
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                    <span className="ml-auto chip">
                                        accessed {m.access_count}×
                                    </span>
                                </div>
                            </motion.article>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            <AddMemoryModal open={openAdd} onClose={() => setOpenAdd(false)} onCreated={load} />
        </div>
    );
}
