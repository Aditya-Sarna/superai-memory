import React, { useState } from "react";
import { Modal } from "./Primitives";
import { createMemory } from "../lib/api";
import { toast } from "sonner";

const MODALITIES = ["fact", "preference", "interaction", "summary", "text", "document", "web"];

export default function AddMemoryModal({ open, onClose, onCreated, defaults = {} }) {
    const [form, setForm] = useState({
        content: "",
        title: "",
        tags: "",
        scope: "global",
        modality: "fact",
        importance_score: 0.7,
        ...defaults,
    });
    const [loading, setLoading] = useState(false);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    React.useEffect(() => {
        if (open) {
            setForm({
                content: "",
                title: "",
                tags: "",
                scope: "global",
                modality: "fact",
                importance_score: 0.7,
                ...defaults,
            });
        }
        // eslint-disable-next-line
    }, [open]);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.content.trim()) {
            toast.error("Memory content can't be empty.");
            return;
        }
        setLoading(true);
        try {
            const body = {
                content: form.content.trim(),
                title: form.title.trim() || null,
                tags: form.tags
                    .split(",")
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean),
                scope: form.scope.trim() || "global",
                modality: form.modality,
                importance_score: Number(form.importance_score),
            };
            const mem = await createMemory(body);
            toast.success("Memory stored — enriched with LLM keywords.");
            onCreated?.(mem);
            onClose?.();
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || "Failed to add memory.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="New memory"
            subtitle="The agent will enrich this with keywords, entities, and a summary on ingestion."
            size="md"
            testId="add-memory-modal"
        >
            <form onSubmit={submit} className="space-y-4" data-testid="add-memory-form">
                <label className="field">
                    Content
                    <textarea
                        className="input"
                        value={form.content}
                        onChange={set("content")}
                        placeholder="What should be remembered? A fact, preference, or snippet from a conversation…"
                        required
                        data-testid="memory-content-input"
                    />
                </label>
                <label className="field">
                    Title <span className="text-[color:var(--ink-muted)] font-normal">(optional — auto-generated if blank)</span>
                    <input
                        className="input"
                        value={form.title}
                        onChange={set("title")}
                        placeholder="Give it a short name"
                        data-testid="memory-title-input"
                    />
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="field">
                        Scope
                        <input
                            className="input"
                            value={form.scope}
                            onChange={set("scope")}
                            placeholder="global, work, personal…"
                            data-testid="memory-scope-input"
                        />
                    </label>
                    <label className="field">
                        Modality
                        <select
                            className="input"
                            value={form.modality}
                            onChange={set("modality")}
                            data-testid="memory-modality-select"
                        >
                            {MODALITIES.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <label className="field">
                    Tags <span className="text-[color:var(--ink-muted)] font-normal">(comma-separated)</span>
                    <input
                        className="input"
                        value={form.tags}
                        onChange={set("tags")}
                        placeholder="project, priya, deadlines"
                        data-testid="memory-tags-input"
                    />
                </label>
                <label className="field">
                    Importance <span className="chip ml-1">{Number(form.importance_score).toFixed(2)}</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={form.importance_score}
                        onChange={set("importance_score")}
                        data-testid="memory-importance-input"
                    />
                </label>
                <div className="flex items-center justify-end gap-2 pt-3">
                    <button type="button" onClick={onClose} className="btn btn-subtle" data-testid="cancel-memory-btn">
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={loading} data-testid="submit-memory-btn">
                        {loading ? "Storing…" : "Store memory"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
