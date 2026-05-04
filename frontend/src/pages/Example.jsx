import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Trash2, RotateCcw, ArrowRight } from "lucide-react";
import { agentSimulate, seedDemo, getStats } from "../lib/api";
import { TierPill, Pill } from "../components/Primitives";
import { toast } from "sonner";

const SUGGESTED = [
    "My name is Aditya and I love pourover coffee.",
    "Remember: I'm working on Project Atlas.",
    "What project am I working on right now?",
    "What kind of coffee do I like?",
    "Any deadlines coming up soon?",
];

const STEPS = [
    { title: "1. Store", body: "The agent calls POST /api/memories with content, scope, and modality. An LLM enriches it with keywords, entities, and a summary." },
    { title: "2. Retrieve", body: "Next turn, the agent calls POST /api/search. Hybrid scoring fires across semantic / keyword / graph layers." },
    { title: "3. Inject", body: "Top-k memories are stitched into a compact context window — not the full chat history — and passed to the LLM." },
    { title: "4. Lifecycle", body: "Useful memories get reinforced and stay hot. Unused ones decay, cool into warm/cold, and are eventually summarised." },
];

export default function Example() {
    const [tab, setTab] = useState("sandbox");
    return (
        <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-12">
            <div className="chip mb-3">/example</div>
            <h1 className="font-serif text-6xl leading-none mb-3">How it works</h1>
            <p className="text-[color:var(--ink-soft)] max-w-2xl">
                Watch a real agent talk to its memory layer. Tell it about yourself, then ask it what it knows.
                Every memory ingested or retrieved is logged live on the right.
            </p>

            <div className="flex gap-6 mt-10 border-b border-[color:var(--line)]">
                <button
                    className={`tab ${tab === "sandbox" ? "tab-active" : ""}`}
                    onClick={() => setTab("sandbox")}
                    data-testid="tab-sandbox"
                >
                    Live sandbox
                </button>
                <button
                    className={`tab ${tab === "walkthrough" ? "tab-active" : ""}`}
                    onClick={() => setTab("walkthrough")}
                    data-testid="tab-walkthrough"
                >
                    Walkthrough
                </button>
            </div>

            <div className="mt-8">
                {tab === "sandbox" ? <Sandbox /> : <Walkthrough />}
            </div>
        </div>
    );
}

function Walkthrough() {
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {STEPS.map((s) => (
                <motion.div
                    key={s.title}
                    className="card p-6"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    data-testid={`walkthrough-${s.title.split(".")[0]}`}
                >
                    <div className="chip mb-2">{s.title}</div>
                    <p className="font-serif text-2xl leading-snug">{s.body}</p>
                </motion.div>
            ))}
            <div className="md:col-span-2 card p-6 bg-[color:var(--ink)] text-white">
                <div className="chip text-white/60 mb-2">the upshot</div>
                <h3 className="font-serif text-4xl leading-tight">
                    Agents stop stuffing the full chat log into every prompt.
                    They recall the five things that matter — just like we do.
                </h3>
            </div>
        </div>
    );
}

function Sandbox() {
    const [messages, setMessages] = useState([
        { role: "assistant", content: "Hi — I'm an agent backed by mnemo. Tell me something about yourself, or ask me what I know.", at: new Date().toISOString() },
    ]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [lastRetrieved, setLastRetrieved] = useState([]);
    const [lastRemembered, setLastRemembered] = useState(null);
    const [stats, setStats] = useState(null);
    const scrollRef = useRef(null);

    const loadStats = async () => {
        try { setStats(await getStats()); } catch {}
    };
    useEffect(() => { loadStats(); }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, busy]);

    const send = async (textOverride) => {
        const text = (textOverride ?? input).trim();
        if (!text || busy) return;
        setInput("");
        setMessages((m) => [...m, { role: "user", content: text, at: new Date().toISOString() }]);
        setBusy(true);
        try {
            const r = await agentSimulate({ session_id: sessionId, message: text });
            setSessionId(r.session_id);
            setLastRetrieved(r.retrieved_memories || []);
            setLastRemembered(r.remembered_memory_id || null);
            setMessages((m) => [...m, { role: "assistant", content: r.reply, at: new Date().toISOString() }]);
            await loadStats();
        } catch (e) {
            toast.error("Agent error — check backend logs.");
            setMessages((m) => [...m, { role: "assistant", content: "Sorry — I had trouble reaching my memory. Try again?", at: new Date().toISOString() }]);
        } finally {
            setBusy(false);
        }
    };

    const reset = () => {
        setMessages([{ role: "assistant", content: "Session reset. What should I remember next?", at: new Date().toISOString() }]);
        setSessionId(null);
        setLastRetrieved([]);
        setLastRemembered(null);
    };

    const seed = async () => {
        const r = await seedDemo();
        if (r.seeded) toast.success(`Seeded ${r.created} memories to play with.`);
        else toast("Memories already exist — try asking about projects or coffee.");
        await loadStats();
    };

    return (
        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
            {/* Conversation */}
            <div className="card flex flex-col" style={{ height: "640px" }} data-testid="agent-sandbox">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--line)]">
                    <div className="flex items-center gap-2">
                        <span className="dot pulse-dot" style={{ background: "var(--accent)" }} />
                        <span className="font-serif text-xl">Agent · live session</span>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={seed} className="btn btn-subtle" data-testid="sandbox-seed-btn">
                            <Sparkles size={13} /> Seed
                        </button>
                        <button onClick={reset} className="btn btn-subtle" data-testid="sandbox-reset-btn">
                            <RotateCcw size={13} /> Reset
                        </button>
                    </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-5 space-y-4">
                    <AnimatePresence initial={false}>
                        {messages.map((m, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[85%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed ${
                                        m.role === "user"
                                            ? "bg-[color:var(--ink)] text-white rounded-br-sm"
                                            : "bg-[color:var(--bg)] border border-[color:var(--line)] rounded-bl-sm"
                                    }`}
                                    data-testid={`msg-${m.role}-${i}`}
                                >
                                    {m.content}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {busy && (
                        <div className="flex justify-start">
                            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-[color:var(--bg)] border border-[color:var(--line)]">
                                <span className="dot dot-hot pulse-dot" />
                                <span className="dot dot-warm pulse-dot" style={{ animationDelay: "0.2s" }} />
                                <span className="dot dot-cold pulse-dot" style={{ animationDelay: "0.4s" }} />
                            </div>
                        </div>
                    )}
                </div>

                <form
                    onSubmit={(e) => { e.preventDefault(); send(); }}
                    className="border-t border-[color:var(--line)] p-3 flex items-center gap-2"
                >
                    <input
                        className="flex-1 bg-transparent border-0 outline-0 px-3 py-2 text-[15px]"
                        placeholder="Say something to the agent…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={busy}
                        data-testid="agent-input"
                    />
                    <button type="submit" className="btn btn-primary" disabled={busy} data-testid="agent-send-btn">
                        <Send size={14} /> Send
                    </button>
                </form>

                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                    {SUGGESTED.map((s) => (
                        <button
                            key={s}
                            onClick={() => send(s)}
                            disabled={busy}
                            className="pill hover:bg-[color:var(--ink)] hover:text-white hover:border-transparent transition text-left"
                            data-testid={`suggested-${s.slice(0, 10)}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Observability panel */}
            <div className="space-y-4">
                <div className="card p-5" data-testid="retrieved-panel">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-serif text-2xl">Retrieved</h3>
                        <span className="chip">last turn</span>
                    </div>
                    {lastRetrieved.length === 0 ? (
                        <p className="text-sm text-[color:var(--ink-muted)]">
                            Memories retrieved on each turn will appear here with their hybrid score.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {lastRetrieved.map((r) => (
                                <div key={r.memory.id} className="border-l-2 border-[color:var(--accent)] pl-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="font-serif text-lg leading-tight">{r.memory.title}</span>
                                        <span className="chip font-mono">{(r.score * 100).toFixed(0)}%</span>
                                    </div>
                                    <p className="text-xs text-[color:var(--ink-soft)] mt-1">
                                        {r.memory.summary || r.memory.content.slice(0, 120)}
                                    </p>
                                    <div className="flex gap-1.5 mt-2 flex-wrap">
                                        <TierPill tier={r.memory.tier} />
                                        {r.sources.map((s) => (
                                            <Pill key={s} className="uppercase font-mono text-[10px]">{s}</Pill>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card p-5" data-testid="remembered-panel">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-serif text-2xl">Auto-remembered</h3>
                        <span className="chip">if triggered</span>
                    </div>
                    {lastRemembered ? (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="dot dot-hot" />
                            <span>New memory stored — ID</span>
                            <span className="chip font-mono">{lastRemembered.slice(0, 8)}</span>
                            <ArrowRight size={14} className="text-[color:var(--ink-muted)]" />
                        </div>
                    ) : (
                        <p className="text-sm text-[color:var(--ink-muted)]">
                            When you say something memorable ("my name is…", "I prefer…", "remember…"), it's auto-stored.
                        </p>
                    )}
                </div>

                <div className="card p-5" data-testid="live-stats">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-serif text-2xl">Live stats</h3>
                    </div>
                    {stats ? (
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <Stat label="total" value={stats.total} />
                            <Stat label="hot" value={stats.by_tier.hot} color="var(--hot)" />
                            <Stat label="warm" value={stats.by_tier.warm} color="var(--warm)" />
                        </div>
                    ) : (
                        <div className="text-sm text-[color:var(--ink-muted)]">Loading…</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value, color }) {
    return (
        <div>
            <div className="font-serif text-4xl leading-none" style={{ color: color || "var(--ink)" }}>{value}</div>
            <div className="chip mt-1">{label}</div>
        </div>
    );
}
