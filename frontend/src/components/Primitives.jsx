import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, subtitle, children, size = "md", testId }) {
    useEffect(() => {
        const h = (e) => e.key === "Escape" && onClose?.();
        if (open) window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [open, onClose]);

    const maxW = size === "lg" ? "max-w-3xl" : size === "sm" ? "max-w-md" : "max-w-xl";

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="modal-backdrop"
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    data-testid={testId ? `${testId}-backdrop` : "modal-backdrop"}
                >
                    <motion.div
                        className={`modal ${maxW}`}
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        data-testid={testId}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                {title && <h3 className="font-serif text-3xl leading-none">{title}</h3>}
                                {subtitle && <p className="text-sm text-[color:var(--ink-muted)] mt-2">{subtitle}</p>}
                            </div>
                            <button
                                onClick={onClose}
                                className="btn-subtle btn"
                                aria-label="Close"
                                data-testid="modal-close-btn"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div>{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function Pill({ children, variant = "", className = "" }) {
    return <span className={`pill ${variant ? `pill-${variant}` : ""} ${className}`}>{children}</span>;
}

export function TierPill({ tier }) {
    const label = tier || "cold";
    return (
        <span className={`pill pill-${label}`}>
            <span className={`dot dot-${label}`} />
            {label}
        </span>
    );
}

export function Gauge({ value = 0, color = "var(--ink)" }) {
    return (
        <div className="gauge">
            <div style={{ width: `${Math.round(value * 100)}%`, background: color }} />
        </div>
    );
}

export function EmptyState({ title, hint, action }) {
    return (
        <div className="border border-dashed border-[color:var(--line-strong)] rounded-2xl p-12 text-center">
            <div className="font-serif text-3xl mb-2">{title}</div>
            {hint && <p className="text-[color:var(--ink-muted)] text-sm max-w-md mx-auto">{hint}</p>}
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}
