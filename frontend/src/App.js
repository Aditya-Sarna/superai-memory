import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import Shell from "./components/Shell";
import Overview from "./pages/Overview";
import Memories from "./pages/Memories";
import Search from "./pages/Search";
import Timeline from "./pages/Timeline";
import Example from "./pages/Example";

import "./App.css";

function App() {
    return (
        <>
            <BrowserRouter>
                <Shell>
                    <Routes>
                        <Route path="/" element={<Overview />} />
                        <Route path="/memories" element={<Memories />} />
                        <Route path="/search" element={<Search />} />
                        <Route path="/timeline" element={<Timeline />} />
                        <Route path="/example" element={<Example />} />
                        <Route path="*" element={<Overview />} />
                    </Routes>
                </Shell>
            </BrowserRouter>
            <Toaster
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #222",
                        borderRadius: "12px",
                    },
                }}
            />
        </>
    );
}

export default App;
