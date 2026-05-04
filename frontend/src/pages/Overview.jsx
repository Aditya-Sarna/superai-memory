import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, Plus, Sparkles, ArrowRight } from "lucide-react";
import { getStats, runDecay, seedDemo } from "../lib/api";
import { TierPill, Gauge, Pill } from "../components/Primitives";
import AddMemoryModal from "../components/AddMemoryModal";
import { toast } from "sonner";

export default function Overview() {
    const [stats, setStats] = useState(null);
    const [openAdd, setOpenAdd] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        try {
            const s = await getStats();
            setStats(s);
        } catch (e) {
            console.error(e);
        }
    };
    useEffect(() => { load(); }, []);

    const triggerDecay = async () => {
        setLoading(true);
        try {
            const r = await runDecay();
            toast.success(`Decay applied — ${r.updated} memories reclassified.`);
            await load();
        } finally { setLoading(false); }
    };

    const seed = async () => {
        const r = await seedDemo();
        if (r.seeded) toast.success(`Seeded ${r.created} demo memories.`);
        else toast("Seed skipped — memories already exist.");
        await load();
    };

    const total = stats?.total ?? 0;
    const hot = stats?.by_tier?.hot ?? 0;
    const warm = stats?.by_tier?.warm ?? 0;
    const cold = stats?.by_tier?.cold ?? 0;

    return (
        <div>
            <Hero onAdd={() => setOpenAdd(true)} />
            <section className="max-w-[1180px] mx-auto px-6 lg:px-10 py-14 grid md:grid-cols-3 gap-6">
                <StatCard label="Total memories" value={total} foot={<span className="chip">{stats?.by_scope?.length ?? 0} scopes</span>} />
                <StatCard
                    label="Tier distribution"
                    value={`${hot} / ${warm} / ${cold}`}
                    foot={
                        <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1"><span className="dot dot-hot" /> hot</span>
                            <span className="flex items-center gap-1"><span className="dot dot-warm" /> warm</span>
                            <span className="flex items-center gap-1"><span className="dot dot-cold" /> cold</span>
                        </div>
                    }
                    gauge={
                        total > 0 ? (
                            <div className="flex h-1.5 w-full overflow-hidden rounded-full">
                                <div style={{ width: `${(hot / total) * 100}%`, background: "var(--hot)" }} />
                                <div style={{ width: `${(warm / total) * 100}%`, background: "var(--warm)" }} />
                                <div style={{ width: `${(cold / total) * 100}%`, background: "var(--cold)" }} />
                            </div>
                        ) : null
                    }
                />
                <StatCard
                    label="Lifecycle"
                    value={<span className="font-serif text-4xl">decay + reinforce</span>}
                    foot={
                        <div className="flex gap-2">
                            <button onClick={triggerDecay} disabled={loading} className="btn btn-ghost" data-testid="run-decay-btn">
                                {loading ? "Running…" : "Run decay now"}
                            </button>
                        </div>
                    }
                />
            </section>

            <section className="max-w-[1180px] mx-auto px-6 lg:px-10 pb-20">
                <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-serif text-4xl">Recent memories</h2>
                    <div className="flex items-center gap-2">
                        {total === 0 && (
                            <button onClick={seed} className="btn btn-ghost" data-testid="seed-demo-btn">
                                <Sparkles size={14} /> Seed demo
                            </button>
                        )}
                        <Link to="/memories" className="btn btn-subtle" data-testid="view-all-memories-link">
                            View all <ArrowRight size={14} />
                        </Link>
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                    {(stats?.recent || []).map((m) => (
                        <motion.div
                            key={m.id}
                            className="card card-hover p-5"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            data-testid={`recent-memory-${m.id}`}
                        >
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <h3 className="font-serif text-xl leading-snug">{m.title || m.content.slice(0, 60)}</h3>
                                <TierPill tier={m.tier} />
                            </div>
                            <p className="text-sm text-[color:var(--ink-soft)] line-clamp-2 mb-3">
                                {m.summary || m.content}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                <Pill>{m.scope}</Pill>
                                <Pill>{m.modality}</Pill>
                                {(m.tags || []).slice(0, 3).map((t) => (
                                    <Pill key={t}>{t}</Pill>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                    {total === 0 && (
                        <div className="md:col-span-2 text-[color:var(--ink-muted)] text-sm">
                            No memories yet. Click <span className="chip">Seed demo</span> or <span className="chip">+ New memory</span>.
                        </div>
                    )}
                </div>
            </section>

            <AddMemoryModal open={openAdd} onClose={() => setOpenAdd(false)} onCreated={load} />
        </div>
    );
}

function Hero({ onAdd }) {
    return (
        <section className="relative bg-grid">
            <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-20 pb-24">
                <div className="max-w-3xl">
                    <div className="flex items-center gap-2 mb-6">
                        <span className="pill">
                            <span className="dot pulse-dot" style={{ background: "var(--accent)" }} /> Live memory layer
                        </span>
                        <span className="chip">v1.0</span>
                    </div>
                    <h1 className="display text-[64px] md:text-[84px] mb-6">
                        A memory that <em>remembers</em>
                        <br /> like you do.
                    </h1>
                    <p className="text-lg text-[color:var(--ink-soft)] max-w-2xl leading-relaxed">
                        mnemo stores what matters — facts, preferences, past interactions — and retrieves
                        them by meaning, not keyword. Memories decay, move between hot/warm/cold tiers, and
                        get reinforced when they prove useful. So agents stay focused — and inexpensive.
                    </p>
                    <div className="flex items-center gap-3 mt-10">
                        <button onClick={onAdd} className="btn btn-primary" data-testid="hero-add-memory-btn">
                            <Plus size={14} /> New memory
                        </button>
                        <Link to="/example" className="btn btn-ghost" data-testid="hero-try-demo-link">
                            Try the live demo <ArrowUpRight size={14} />
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

function StatCard({ label, value, foot, gauge }) {
    return (
        <div className="card p-6 flex flex-col gap-3">
            <div className="text-xs uppercase tracking-widest text-[color:var(--ink-muted)]">{label}</div>
            <div className="font-serif text-5xl leading-none">{value}</div>
            {gauge}
            <div className="mt-auto pt-1">{foot}</div>
        </div>
    );
}
