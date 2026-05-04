"""
Mnemo — Memory layer for AI agents.
A minimal, production-grade implementation of a persistent memory system:
- Scoped memories tagged with modality
- Hybrid search: semantic fingerprint + keyword + graph (shared entities)
- Lifecycle: hot/warm/cold tiers with decay + reinforcement
- LLM-powered enrichment at ingestion time
"""
from __future__ import annotations

import os
import re
import json
import math
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ConfigDict

# ── Setup ─────────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("mnemo")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Collections
memories_col = db["mnemo_memories"]
events_col = db["mnemo_events"]
sessions_col = db["mnemo_sessions"]

# ── Constants ─────────────────────────────────────────────────────────────────
Modality = Literal["text", "fact", "preference", "interaction", "summary", "document", "web"]
Tier = Literal["hot", "warm", "cold"]
TIER_HOT_THRESHOLD = 0.65
TIER_WARM_THRESHOLD = 0.30
DECAY_HALF_LIFE_DAYS = 14.0  # importance halves every 14 days without access
DEFAULT_USER_ID = "demo-user"  # single-user mode (auth-free)

STOPWORDS = set("""
a an the and or but if while is are was were be been being of in on at to for with by from as
this that these those it its i you he she we they me him her us them my your his their our
do does did have has had will would could should can may might must not no yes so than then
""".split())


# ── Models ────────────────────────────────────────────────────────────────────
class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=50_000)
    title: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    scope: str = "global"
    modality: Modality = "text"
    importance_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    source_uri: Optional[str] = None


class MemoryUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    scope: Optional[str] = None
    importance_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class Memory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = DEFAULT_USER_ID
    content: str
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    entities: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    scope: str = "global"
    modality: Modality = "text"
    tier: Tier = "hot"
    importance_score: float = 0.7
    access_count: int = 0
    reinforcement_count: int = 0
    source_uri: Optional[str] = None
    status: Literal["active", "archived", "deleted"] = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_accessed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=8, ge=1, le=50)
    scope: Optional[str] = None
    modality: Optional[Modality] = None
    min_score: float = Field(default=0.05, ge=0.0, le=1.0)


class SearchResult(BaseModel):
    memory: Memory
    score: float
    sources: List[str]  # ["semantic", "keyword", "graph"]
    highlights: List[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    total: int
    context_window: str
    latency_ms: int


class AgentSimulateRequest(BaseModel):
    session_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=4000)
    use_memory: bool = True
    auto_remember: bool = True


class AgentTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentSimulateResponse(BaseModel):
    session_id: str
    reply: str
    retrieved_memories: List[SearchResult]
    remembered_memory_id: Optional[str] = None
    history: List[AgentTurn]


# ── Helpers ───────────────────────────────────────────────────────────────────
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def serialize_memory(doc: dict) -> dict:
    """Convert stored memory doc → API-safe dict (handle datetimes)."""
    out = {k: v for k, v in doc.items() if k != "_id"}
    for key in ("created_at", "updated_at", "last_accessed_at"):
        if key in out and isinstance(out[key], str):
            try:
                out[key] = datetime.fromisoformat(out[key])
            except Exception:
                pass
    return out


def tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-zA-Z0-9]+", (text or "").lower())
    return [t for t in tokens if len(t) > 2 and t not in STOPWORDS]


def tier_from_score(score: float) -> Tier:
    if score >= TIER_HOT_THRESHOLD:
        return "hot"
    if score >= TIER_WARM_THRESHOLD:
        return "warm"
    return "cold"


async def llm_enrich(content: str, title: Optional[str]) -> Dict[str, Any]:
    """Use Claude Haiku to extract keywords, entities, and a short summary.
    Fallback to local tokenization if LLM fails."""
    fallback_keywords = list(dict.fromkeys(tokenize(f"{title or ''} {content}")))[:20]
    if not EMERGENT_LLM_KEY:
        return {"keywords": fallback_keywords, "entities": [], "summary": None}

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        system = (
            "You are a memory enrichment engine. Given a piece of text, return STRICT JSON "
            "with keys: keywords (list of 5-15 lowercase semantic phrases), "
            "entities (list of named entities — people, places, projects, concepts), "
            "summary (one crisp sentence, <=160 chars). Return ONLY the JSON object."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"enrich-{uuid.uuid4()}",
            system_message=system,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")

        prompt = f"Title: {title or '(none)'}\n\nContent:\n{content[:4000]}"
        resp = await chat.send_message(UserMessage(text=prompt))
        # Strip code fences if present
        raw = resp.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
        return {
            "keywords": [k.lower() for k in data.get("keywords", [])][:20] or fallback_keywords,
            "entities": [e for e in data.get("entities", [])][:15],
            "summary": (data.get("summary") or None),
        }
    except Exception as e:
        logger.warning(f"LLM enrichment failed, falling back: {e}")
        return {"keywords": fallback_keywords, "entities": [], "summary": None}


async def llm_agent_reply(user_message: str, retrieved: List[dict], history: List[dict]) -> str:
    """Simulate an agent response, conditioned on retrieved memories + short history."""
    if not EMERGENT_LLM_KEY:
        return "(demo) I would respond using the retrieved memories above."
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        mem_block = "\n".join(
            [f"- [{m.get('scope','global')}/{m.get('modality','text')}] {m.get('title') or ''}: {m.get('summary') or m.get('content','')[:200]}"
             for m in retrieved]
        ) or "(no prior memories retrieved)"

        hist_block = "\n".join([f"{h['role'].upper()}: {h['content']}" for h in history[-6:]]) or "(new session)"

        system = (
            "You are Mnemo, a thoughtful AI assistant demonstrating a memory layer. "
            "You have access to the user's persistent memories. Be warm, concise (2-4 sentences), "
            "and when you reference a memory, do it naturally (e.g., 'I remember you mentioned...'). "
            "If no relevant memory applies, just answer normally. Do NOT output JSON or headers."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"agent-{uuid.uuid4()}",
            system_message=system,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")

        prompt = (
            f"Retrieved memories:\n{mem_block}\n\n"
            f"Recent conversation:\n{hist_block}\n\n"
            f"User says: {user_message}\n\n"
            f"Your reply:"
        )
        return (await chat.send_message(UserMessage(text=prompt))).strip()
    except Exception as e:
        logger.warning(f"Agent LLM failed: {e}")
        return "I'm having trouble thinking right now, but I'd use your retrieved memories to answer this."


def compute_decay_score(base_score: float, last_accessed: datetime, reinforcement_count: int = 0) -> float:
    """Exponential decay on importance based on inactivity, offset by reinforcements."""
    days = max(0.0, (now_utc() - last_accessed).total_seconds() / 86400.0)
    decayed = base_score * math.exp(-days / (DECAY_HALF_LIFE_DAYS + reinforcement_count * 7))
    return max(0.0, min(1.0, decayed))


# ── Hybrid Search Scoring ─────────────────────────────────────────────────────
def score_memory_against_query(mem: dict, q_tokens: List[str], q_phrases: List[str]) -> Dict[str, Any]:
    """Return {score, sources, highlights}. Three-layer hybrid scoring."""
    mem_keywords = set(mem.get("keywords", []))
    mem_tokens = set(tokenize(f"{mem.get('title','')} {mem.get('content','')}"))
    mem_entities = set([e.lower() for e in mem.get("entities", [])])
    mem_tags = set([t.lower() for t in mem.get("tags", [])])

    if not q_tokens:
        return {"score": 0.0, "sources": [], "highlights": []}

    sources = []

    # 1. Semantic: overlap with LLM-extracted keywords/phrases (strongest signal)
    q_set = set(q_tokens)
    semantic_hits = 0
    # whole phrase matches in keywords
    for phrase in q_phrases:
        for kw in mem_keywords:
            if phrase in kw or kw in phrase:
                semantic_hits += 2
                break
    # token overlap with keywords
    semantic_hits += len(q_set & mem_keywords)
    semantic_score = min(1.0, semantic_hits / max(3, len(q_set)))
    if semantic_score > 0:
        sources.append("semantic")

    # 2. Keyword: raw token overlap with full text
    keyword_overlap = len(q_set & mem_tokens)
    keyword_score = min(1.0, keyword_overlap / max(3, len(q_set)))
    if keyword_score > 0:
        sources.append("keyword")

    # 3. Graph: shared entities / tags (relational)
    graph_hits = len(q_set & mem_entities) + len(q_set & mem_tags)
    graph_score = min(1.0, graph_hits / max(2, len(q_set)))
    if graph_score > 0:
        sources.append("graph")

    # Weighted combination; add small importance bonus
    importance_bonus = 0.1 * float(mem.get("importance_score", 0.5))
    combined = (0.55 * semantic_score + 0.25 * keyword_score + 0.20 * graph_score) + importance_bonus
    combined = min(1.0, combined)

    # Highlights: which query tokens matched where
    highlights = sorted(list(q_set & (mem_keywords | mem_entities | mem_tags)))[:6]

    return {"score": round(combined, 4), "sources": sources, "highlights": highlights}


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Mnemo Memory API", version="1.0.0")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "mnemo", "status": "ok", "version": "1.0.0"}


@api.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "mongo": "connected", "llm_key": bool(EMERGENT_LLM_KEY)}
    except Exception as e:
        raise HTTPException(500, f"unhealthy: {e}")


# ── Memories CRUD ─────────────────────────────────────────────────────────────
@api.post("/memories", response_model=Memory, status_code=201)
async def create_memory(body: MemoryCreate):
    enriched = await llm_enrich(body.content, body.title)
    importance = body.importance_score if body.importance_score is not None else 0.7
    mem = Memory(
        content=body.content,
        title=body.title or (enriched.get("summary") or body.content[:60]),
        summary=enriched.get("summary"),
        tags=body.tags or [],
        entities=enriched.get("entities", []),
        keywords=enriched.get("keywords", []),
        scope=body.scope,
        modality=body.modality,
        importance_score=importance,
        tier=tier_from_score(importance),
        source_uri=body.source_uri,
    )
    doc = mem.model_dump()
    # Serialize datetimes as ISO strings for Mongo
    for k in ("created_at", "updated_at", "last_accessed_at"):
        doc[k] = doc[k].isoformat()
    await memories_col.insert_one(doc)
    await events_col.insert_one({
        "id": str(uuid.uuid4()),
        "type": "ingest",
        "memory_id": mem.id,
        "at": now_utc().isoformat(),
        "scope": mem.scope,
        "modality": mem.modality,
    })
    return mem


@api.get("/memories", response_model=List[Memory])
async def list_memories(
    scope: Optional[str] = None,
    tier: Optional[str] = None,
    modality: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    filt: Dict[str, Any] = {"user_id": DEFAULT_USER_ID, "status": "active"}
    if scope:
        filt["scope"] = scope
    if tier:
        filt["tier"] = tier
    if modality:
        filt["modality"] = modality
    if q:
        filt["$or"] = [
            {"content": {"$regex": re.escape(q), "$options": "i"}},
            {"title": {"$regex": re.escape(q), "$options": "i"}},
            {"tags": {"$in": [q.lower()]}},
        ]
    cursor = memories_col.find(filt, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [Memory(**serialize_memory(d)) for d in docs]


@api.get("/memories/{memory_id}", response_model=Memory)
async def get_memory(memory_id: str):
    doc = await memories_col.find_one({"id": memory_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Memory not found")
    # Bump access stats
    await memories_col.update_one(
        {"id": memory_id},
        {"$inc": {"access_count": 1}, "$set": {"last_accessed_at": now_utc().isoformat()}},
    )
    return Memory(**serialize_memory(doc))


@api.patch("/memories/{memory_id}", response_model=Memory)
async def update_memory(memory_id: str, body: MemoryUpdate):
    doc = await memories_col.find_one({"id": memory_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Memory not found")
    updates: Dict[str, Any] = {"updated_at": now_utc().isoformat()}
    if body.title is not None:
        updates["title"] = body.title
    if body.content is not None:
        updates["content"] = body.content
        enriched = await llm_enrich(body.content, body.title or doc.get("title"))
        updates["keywords"] = enriched.get("keywords", [])
        updates["entities"] = enriched.get("entities", [])
        updates["summary"] = enriched.get("summary")
    if body.tags is not None:
        updates["tags"] = body.tags
    if body.scope is not None:
        updates["scope"] = body.scope
    if body.importance_score is not None:
        updates["importance_score"] = body.importance_score
        updates["tier"] = tier_from_score(body.importance_score)
    await memories_col.update_one({"id": memory_id}, {"$set": updates})
    doc = await memories_col.find_one({"id": memory_id}, {"_id": 0})
    return Memory(**serialize_memory(doc))


@api.delete("/memories/{memory_id}", status_code=204)
async def delete_memory(memory_id: str):
    res = await memories_col.update_one(
        {"id": memory_id}, {"$set": {"status": "deleted", "updated_at": now_utc().isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Memory not found")
    return None


@api.post("/memories/{memory_id}/reinforce", response_model=Memory)
async def reinforce_memory(memory_id: str, boost: float = Query(0.15, ge=0.01, le=0.5)):
    doc = await memories_col.find_one({"id": memory_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Memory not found")
    new_score = min(1.0, float(doc.get("importance_score", 0.5)) + boost)
    await memories_col.update_one(
        {"id": memory_id},
        {
            "$set": {
                "importance_score": new_score,
                "tier": tier_from_score(new_score),
                "last_accessed_at": now_utc().isoformat(),
                "updated_at": now_utc().isoformat(),
            },
            "$inc": {"reinforcement_count": 1},
        },
    )
    await events_col.insert_one({
        "id": str(uuid.uuid4()),
        "type": "reinforce",
        "memory_id": memory_id,
        "boost": boost,
        "at": now_utc().isoformat(),
    })
    doc = await memories_col.find_one({"id": memory_id}, {"_id": 0})
    return Memory(**serialize_memory(doc))


# ── Hybrid Search ─────────────────────────────────────────────────────────────
@api.post("/search", response_model=SearchResponse)
async def search(body: SearchRequest):
    t0 = datetime.now(timezone.utc)
    filt: Dict[str, Any] = {"user_id": DEFAULT_USER_ID, "status": "active"}
    if body.scope:
        filt["scope"] = body.scope
    if body.modality:
        filt["modality"] = body.modality

    q_tokens = tokenize(body.query)
    # phrases = bigrams + keywords-as-phrases (lightweight)
    q_phrases = []
    for i in range(len(q_tokens) - 1):
        q_phrases.append(f"{q_tokens[i]} {q_tokens[i+1]}")

    docs = await memories_col.find(filt, {"_id": 0}).to_list(length=2000)

    scored: List[SearchResult] = []
    for d in docs:
        s = score_memory_against_query(d, q_tokens, q_phrases)
        if s["score"] >= body.min_score:
            scored.append(SearchResult(
                memory=Memory(**serialize_memory(d)),
                score=s["score"],
                sources=s["sources"],
                highlights=s["highlights"],
            ))
    scored.sort(key=lambda r: r.score, reverse=True)
    top = scored[: body.top_k]

    # Bump access stats for retrieved memories
    if top:
        ids = [r.memory.id for r in top]
        await memories_col.update_many(
            {"id": {"$in": ids}},
            {"$inc": {"access_count": 1}, "$set": {"last_accessed_at": now_utc().isoformat()}},
        )
        await events_col.insert_one({
            "id": str(uuid.uuid4()),
            "type": "retrieve",
            "query": body.query,
            "retrieved": ids,
            "at": now_utc().isoformat(),
        })

    context = "\n\n---\n\n".join(
        [f"[{r.memory.scope}/{r.memory.modality}] {r.memory.title}\n{r.memory.summary or r.memory.content}"
         for r in top[:5]]
    )
    latency = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000)
    return SearchResponse(
        query=body.query,
        results=top,
        total=len(top),
        context_window=context,
        latency_ms=latency,
    )


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@api.post("/lifecycle/decay")
async def run_decay():
    """Apply decay to all active memories; reclassify tiers."""
    cursor = memories_col.find({"user_id": DEFAULT_USER_ID, "status": "active"}, {"_id": 0})
    changed = 0
    moved = {"hot": 0, "warm": 0, "cold": 0}
    async for d in cursor:
        last_at_raw = d.get("last_accessed_at") or d.get("created_at")
        try:
            last_at = datetime.fromisoformat(last_at_raw) if isinstance(last_at_raw, str) else last_at_raw
        except Exception:
            last_at = now_utc()
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        new_score = compute_decay_score(
            float(d.get("importance_score", 0.5)), last_at, int(d.get("reinforcement_count", 0))
        )
        new_tier = tier_from_score(new_score)
        moved[new_tier] += 1
        if abs(new_score - float(d.get("importance_score", 0.5))) > 0.001 or new_tier != d.get("tier"):
            await memories_col.update_one(
                {"id": d["id"]},
                {"$set": {"importance_score": new_score, "tier": new_tier, "updated_at": now_utc().isoformat()}},
            )
            changed += 1
    await events_col.insert_one({
        "id": str(uuid.uuid4()), "type": "decay_run", "changed": changed, "at": now_utc().isoformat()
    })
    return {"updated": changed, "distribution": moved}


# ── Stats ─────────────────────────────────────────────────────────────────────
@api.get("/stats")
async def stats():
    base = {"user_id": DEFAULT_USER_ID, "status": "active"}
    total = await memories_col.count_documents(base)
    by_tier = {
        t: await memories_col.count_documents({**base, "tier": t}) for t in ("hot", "warm", "cold")
    }
    pipe_scope = [
        {"$match": base},
        {"$group": {"_id": "$scope", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    by_scope = [{"scope": r["_id"], "count": r["count"]} async for r in memories_col.aggregate(pipe_scope)]
    pipe_mod = [
        {"$match": base},
        {"$group": {"_id": "$modality", "count": {"$sum": 1}}},
    ]
    by_modality = [{"modality": r["_id"], "count": r["count"]} async for r in memories_col.aggregate(pipe_mod)]

    recent_docs = await memories_col.find(base, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    recent = [Memory(**serialize_memory(d)) for d in recent_docs]

    events_recent = await events_col.find({}, {"_id": 0}).sort("at", -1).limit(10).to_list(10)

    return {
        "total": total,
        "by_tier": by_tier,
        "by_scope": by_scope,
        "by_modality": by_modality,
        "recent": [r.model_dump() for r in recent],
        "events": events_recent,
    }


# ── Timeline ──────────────────────────────────────────────────────────────────
@api.get("/timeline", response_model=List[Memory])
async def timeline(limit: int = Query(100, ge=1, le=500), scope: Optional[str] = None):
    filt: Dict[str, Any] = {"user_id": DEFAULT_USER_ID, "status": "active"}
    if scope:
        filt["scope"] = scope
    docs = await memories_col.find(filt, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return [Memory(**serialize_memory(d)) for d in docs]


# ── Agent Simulate (Example tab) ──────────────────────────────────────────────
@api.post("/agent/simulate", response_model=AgentSimulateResponse)
async def agent_simulate(body: AgentSimulateRequest):
    session_id = body.session_id or str(uuid.uuid4())
    # Load session history
    session = await sessions_col.find_one({"id": session_id}, {"_id": 0})
    history: List[Dict[str, Any]] = session.get("history", []) if session else []

    # Retrieve relevant memories
    retrieved_results: List[SearchResult] = []
    if body.use_memory:
        search_resp = await search(SearchRequest(query=body.message, top_k=5, min_score=0.08))
        retrieved_results = search_resp.results

    retrieved_docs = [r.memory.model_dump() for r in retrieved_results]
    reply = await llm_agent_reply(body.message, retrieved_docs, history)

    # Update history
    new_turns = [
        {"role": "user", "content": body.message, "at": now_utc().isoformat()},
        {"role": "assistant", "content": reply, "at": now_utc().isoformat()},
    ]
    history.extend(new_turns)
    await sessions_col.update_one(
        {"id": session_id},
        {"$set": {"id": session_id, "history": history, "updated_at": now_utc().isoformat()}},
        upsert=True,
    )

    # Auto-remember: decide if message contains something memorable (simple heuristic + LLM signal)
    remembered_id: Optional[str] = None
    if body.auto_remember and _should_remember(body.message):
        mem = await create_memory(MemoryCreate(
            content=body.message,
            scope="interaction",
            modality="interaction",
            tags=["agent-session"],
            importance_score=0.65,
        ))
        remembered_id = mem.id

    # Convert history back to model
    hist_models = [AgentTurn(**h) if isinstance(h, dict) else h for h in history]

    return AgentSimulateResponse(
        session_id=session_id,
        reply=reply,
        retrieved_memories=retrieved_results,
        remembered_memory_id=remembered_id,
        history=hist_models,
    )


def _should_remember(message: str) -> bool:
    m = message.lower().strip()
    triggers = [
        "remember", "my name is", "i like", "i love", "i prefer", "i work",
        "i'm working on", "i live", "my favorite", "i hate", "i enjoy",
        "i have", "my goal", "my birthday", "my wife", "my husband", "my kids",
        "i study", "i believe",
    ]
    return any(t in m for t in triggers) and len(m) < 500


# ── Demo seeding ──────────────────────────────────────────────────────────────
@api.post("/demo/seed")
async def seed_demo():
    """Seed a handful of realistic memories for demos if collection is empty."""
    count = await memories_col.count_documents({"user_id": DEFAULT_USER_ID, "status": "active"})
    if count > 0:
        return {"seeded": False, "existing": count}
    samples = [
        {"content": "I'm working on Project Atlas — a semantic memory layer for LLM agents. It uses hybrid retrieval.",
         "title": "Current project: Atlas", "tags": ["project", "work"], "scope": "work", "modality": "fact", "importance_score": 0.9},
        {"content": "My favorite coffee is single-origin Ethiopian, brewed as a V60 pourover. Light roast, floral notes.",
         "title": "Coffee preference", "tags": ["preference", "coffee"], "scope": "personal", "modality": "preference", "importance_score": 0.6},
        {"content": "I had a great conversation with Priya about vector databases — she recommended trying pgvector over Pinecone for our use case.",
         "title": "Chat with Priya re: vector DBs", "tags": ["people", "databases"], "scope": "work", "modality": "interaction", "importance_score": 0.75},
        {"content": "Deadline for Atlas v1 beta: February 14, 2026. Core features must include decay, reinforcement, and hybrid search.",
         "title": "Atlas v1 deadline", "tags": ["deadline", "atlas"], "scope": "work", "modality": "fact", "importance_score": 0.95},
        {"content": "I usually go for long runs on Saturday mornings — helps me think. Trail preferred over road.",
         "title": "Saturday run habit", "tags": ["habit", "running"], "scope": "personal", "modality": "preference", "importance_score": 0.5},
        {"content": "The knowledge graph approach lets us connect memories through shared entities, not just semantic similarity.",
         "title": "Insight: graph + vector", "tags": ["insight", "memory"], "scope": "work", "modality": "summary", "importance_score": 0.8},
    ]
    created = []
    for s in samples:
        m = await create_memory(MemoryCreate(**s))
        created.append(m.id)
    return {"seeded": True, "created": len(created), "ids": created}


# ── Mount ─────────────────────────────────────────────────────────────────────
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
