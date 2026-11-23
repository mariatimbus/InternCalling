"""Concurrent prefetch keeps each source's records and failures, grouped per host."""

import threading
import time

from opportunity_api.ingestion.models import RawOpportunity
from opportunity_api.ingestion.prefetch import host, prefetch
from opportunity_api.ingestion.sources.base import SourceAdapter


class Slow(SourceAdapter):
    active: dict[str, int] = {}
    peak: dict[str, int] = {}
    lock = threading.Lock()

    def __init__(self, name, endpoint, count=2, error=None):
        self.source_name, self.endpoint, self.count, self.error = name, endpoint, count, error

    def fetch(self):
        key = host(self)
        with self.lock:
            self.active[key] = self.active.get(key, 0) + 1
            self.peak[key] = max(self.peak.get(key, 0), self.active[key])
            running = sum(self.active.values())
            self.peak["*"] = max(self.peak.get("*", 0), running)
        try:
            for i in range(self.count):
                time.sleep(0.05)
                yield RawOpportunity(
                    source=self.source_name,
                    source_id=f"{self.source_name}-{i}",
                    title="Software Engineering Intern",
                )
            if self.error:
                raise self.error
        finally:
            with self.lock:
                self.active[key] -= 1


def test_prefetch_replays_records_and_failures_and_never_doubles_a_host():
    adapters = [
        Slow("gh.a", "https://boards.example/a"),
        Slow("gh.b", "https://boards.example/b", error=ValueError("bad row")),
        Slow("ash.c", "https://ashby.example/c"),
        Slow("lv.d", "https://lever.example/d", count=0),
    ]
    results = {a.source_name: a for a in prefetch(adapters)}
    assert set(results) == {"gh.a", "gh.b", "ash.c", "lv.d"}
    assert Slow.peak["*"] > 1  # different hosts download at the same time
    assert Slow.peak["boards.example"] == 1  # one worker per host keeps request spacing
    assert [r.source_id for r in results["gh.a"].fetch()] == ["gh.a-0", "gh.a-1"]
    replay = results["gh.b"].fetch()
    assert [next(replay).source_id, next(replay).source_id] == ["gh.b-0", "gh.b-1"]
    try:
        next(replay)
    except ValueError as exc:
        assert str(exc) == "bad row"
    else:
        raise AssertionError("failure must be replayed after valid siblings")
    assert list(results["lv.d"].fetch()) == []


def test_prefetch_of_nothing_yields_nothing():
    assert list(prefetch([])) == []
