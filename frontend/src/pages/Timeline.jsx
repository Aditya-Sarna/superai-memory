import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { timeline as fetchTimeline } from "../lib/api";
import { TierPill, Pill } from "../components/Primitives";
import { format, formatDistanceToNow } from "date-fns";

export default function Timeline() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const t = await fetchTimeline({ limit: 200 });
                setItems(t);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const grouped = groupByDay(items);

    return (
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-12">
            <div className="chip mb-3">/timeline</div>
            <h1 className="font-serif text-6xl leading-none">Timeline</h1>
            <p className="text-[color:var(--ink-soft)] mt-3 max-w-xl">
                Every memory, chronologically. The agent lives its history here.
            </p>

            {loading ? (
                <div className="text-[color:var(--ink-muted)] text-sm mt-8">Loading…</div>
            ) : (
                <div className="mt-12 relative">
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[color:var(--line)]" />
                    <div className="space-y-10">
                        {grouped.map(({ day, entries }) => (
                            <section key={day}>
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="w-[23px] h-[23px] rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--bg)] relative z-10" />
                                    <h3 className="font-serif text-2xl">{day}</h3>
                                    <span className="chip">{entries.length} {entries.length === 1 ? "memory" : "memories"}</span>
                                </div>
                                <div className="pl-10 space-y-3">
                                    {entries.map((m, idx) => (
                                        <motion.article
                                            key={m.id}
                                            initial={{ opacity: 0, x: -4 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.02 }}
                                            className="card p-4"
                                            data-testid={`timeline-item-${m.id}`}
                                        >
                                            <div className="flex items-center gap-2 text-xs text-[color:var(--ink-muted)] mb-2">
                                                <span className="font-mono">
                                                    {format(new Date(m.created_at), "HH:mm")}
                                                </span>
                                                <span>·</span>
                                                <span>{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                                            </div>
                                            <div className="flex items-start justify-between gap-3">
                                                <h4 className="font-serif text-xl">{m.title || m.content.slice(0, 80)}</h4>
                                                <TierPill tier={m.tier} />
                                            </div>
                                            <p className="text-sm text-[color:var(--ink-soft)] mt-1 mb-2">
                                                {m.summary || m.content.slice(0, 180)}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                <Pill variant="accent">{m.scope}</Pill>
                                                <Pill>{m.modality}</Pill>
                                                {m.tags?.slice(0, 3).map((t) => <Pill key={t}>#{t}</Pill>)}
                                            </div>
                                        </motion.article>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            )}

            {!loading && items.length === 0 && (
                <div className="text-sm text-[color:var(--ink-muted)] mt-8">No memories yet.</div>
            )}
        </div>
    );
}

function groupByDay(items) {
    const buckets = new Map();
    for (const m of items) {
        const d = new Date(m.created_at);
        const label = format(d, "EEEE, MMM d, yyyy");
        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label).push(m);
    }
    return Array.from(buckets.entries()).map(([day, entries]) => ({ day, entries }));
}
