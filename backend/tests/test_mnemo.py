"""Backend API tests for Mnemo memory system."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://semantic-store-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

created_ids = []


def test_health():
    r = session.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["mongo"] == "connected"


def test_seed():
    r = session.post(f"{API}/demo/seed", timeout=120)
    assert r.status_code == 200
    data = r.json()
    assert "seeded" in data


def test_list_memories():
    r = session.get(f"{API}/memories", timeout=20)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    assert len(arr) >= 1


def test_create_memory_with_llm():
    payload = {
        "content": "TEST_ My name is TestPilot and I love hiking in the Rockies. Remember this fact.",
        "title": "TEST_ pilot fact",
        "tags": ["test", "pilot"],
        "scope": "personal",
        "modality": "fact",
        "importance_score": 0.8,
    }
    r = session.post(f"{API}/memories", json=payload, timeout=60)
    assert r.status_code == 201, r.text
    mem = r.json()
    assert mem["content"] == payload["content"]
    assert mem["scope"] == "personal"
    assert mem["tier"] == "hot"
    assert isinstance(mem["keywords"], list)
    created_ids.append(mem["id"])

    # GET verifies persistence + bumps access
    g = session.get(f"{API}/memories/{mem['id']}", timeout=15)
    assert g.status_code == 200
    assert g.json()["id"] == mem["id"]


def test_patch_memory():
    assert created_ids
    mid = created_ids[0]
    r = session.patch(f"{API}/memories/{mid}", json={"title": "TEST_ updated"}, timeout=60)
    assert r.status_code == 200
    assert r.json()["title"] == "TEST_ updated"


def test_reinforce_memory():
    assert created_ids
    mid = created_ids[0]
    r = session.post(f"{API}/memories/{mid}/reinforce?boost=0.1", timeout=15)
    assert r.status_code == 200
    assert r.json()["reinforcement_count"] >= 1


def test_search_hybrid():
    payload = {"query": "Atlas project memory layer", "top_k": 5, "min_score": 0.05}
    r = session.post(f"{API}/search", json=payload, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert "context_window" in data
    assert "latency_ms" in data
    if data["results"]:
        first = data["results"][0]
        assert "score" in first and "sources" in first


def test_lifecycle_decay():
    r = session.post(f"{API}/lifecycle/decay", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "updated" in data
    assert "distribution" in data


def test_stats():
    r = session.get(f"{API}/stats", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for k in ("total", "by_tier", "by_scope", "by_modality", "recent", "events"):
        assert k in data


def test_timeline():
    r = session.get(f"{API}/timeline", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_agent_simulate():
    payload = {"message": "My name is TestPilot and I love mountain biking", "auto_remember": True}
    r = session.post(f"{API}/agent/simulate", json=payload, timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "reply" in data and len(data["reply"]) > 0
    assert "session_id" in data
    # auto-remember should fire on "my name is" / "i love"
    assert data.get("remembered_memory_id"), "Expected auto-remember to trigger"
    if data["remembered_memory_id"]:
        created_ids.append(data["remembered_memory_id"])


def test_delete_memory():
    assert created_ids
    mid = created_ids[0]
    r = session.delete(f"{API}/memories/{mid}", timeout=15)
    assert r.status_code == 204
    g = session.get(f"{API}/memories/{mid}", timeout=15)
    assert g.status_code == 404


def teardown_module(module):
    for mid in created_ids[1:]:
        try:
            session.delete(f"{API}/memories/{mid}", timeout=10)
        except Exception:
            pass
