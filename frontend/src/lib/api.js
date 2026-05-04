import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, headers: { "Content-Type": "application/json" } });

export const listMemories = (params = {}) => api.get("/memories", { params }).then((r) => r.data);
export const getMemory = (id) => api.get(`/memories/${id}`).then((r) => r.data);
export const createMemory = (body) => api.post("/memories", body).then((r) => r.data);
export const updateMemory = (id, body) => api.patch(`/memories/${id}`, body).then((r) => r.data);
export const deleteMemory = (id) => api.delete(`/memories/${id}`).then((r) => r.data);
export const reinforceMemory = (id, boost = 0.15) =>
    api.post(`/memories/${id}/reinforce`, null, { params: { boost } }).then((r) => r.data);
export const search = (body) => api.post("/search", body).then((r) => r.data);
export const getStats = () => api.get("/stats").then((r) => r.data);
export const runDecay = () => api.post("/lifecycle/decay").then((r) => r.data);
export const timeline = (params = {}) => api.get("/timeline", { params }).then((r) => r.data);
export const agentSimulate = (body) => api.post("/agent/simulate", body).then((r) => r.data);
export const seedDemo = () => api.post("/demo/seed").then((r) => r.data);

export default api;
