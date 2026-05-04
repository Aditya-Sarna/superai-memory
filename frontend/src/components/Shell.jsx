import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

const NAV = [
    { to: "/", label: "Overview", end: true },
    { to: "/memories", label: "Memories" },
    { to: "/search", label: "Search" },
    { to: "/timeline", label: "Timeline" },
    { to: "/example", label: "Example" },
];

export default function Shell({ children }) {
    const loc = useLocation();
    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <motion.main
                key={loc.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                className="flex-1"
            >
                {children}
            </motion.main>
            <Footer />
        </div>
    );
}

function Header() {
    return (
        <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-[color:var(--bg)]/85 backdrop-blur">
            <div className="max-w-[1180px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
                <NavLink to="/" className="flex items-center gap-2 group" data-testid="brand-link">
                    <LogoMark />
                    <span className="font-serif text-[22px] leading-none tracking-tight">mnemo</span>
                    <span className="hidden sm:inline pill ml-2">memory for agents</span>
                </NavLink>
                <nav className="hidden md:flex items-center gap-7">
                    {NAV.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.end}
                            data-testid={`nav-${n.label.toLowerCase()}`}
                            className={({ isActive }) =>
                                `tab ${isActive ? "tab-active" : ""}`
                            }
                        >
                            {n.label}
                        </NavLink>
                    ))}
                </nav>
                <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="hidden md:inline-flex btn btn-ghost"
                    data-testid="docs-link"
                    title="API reference"
                >
                    <span className="chip">v1.0</span>
                </a>
            </div>
            <div className="md:hidden border-t border-[color:var(--line)]">
                <div className="max-w-[1180px] mx-auto px-4 flex overflow-x-auto gap-5 py-2">
                    {NAV.map((n) => (
                        <NavLink key={n.to} to={n.to} end={n.end}
                                 className={({isActive})=>`tab text-sm ${isActive?"tab-active":""}`}>
                            {n.label}
                        </NavLink>
                    ))}
                </div>
            </div>
        </header>
    );
}

function Footer() {
    return (
        <footer className="border-t border-[color:var(--line)] mt-20">
            <div className="max-w-[1180px] mx-auto px-6 lg:px-10 py-10 flex flex-col md:flex-row gap-6 justify-between text-sm text-[color:var(--ink-muted)]">
                <div className="flex items-center gap-2">
                    <LogoMark small />
                    <span>mnemo — a semantic memory layer for AI agents.</span>
                </div>
                <div className="flex gap-6">
                    <span className="chip">hot / warm / cold</span>
                    <span className="chip">hybrid retrieval</span>
                    <span className="chip">decay + reinforcement</span>
                </div>
            </div>
        </footer>
    );
}

export function LogoMark({ small = false }) {
    const s = small ? 18 : 22;
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="#111" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="5" fill="#ff5b14" />
            <circle cx="12" cy="12" r="1.8" fill="#fff" />
        </svg>
    );
}
