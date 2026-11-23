"""Fetch sources concurrently while the caller processes finished ones.

One worker per host keeps the shared client's per-host spacing and robots cache
intact (no host is ever hit by two workers), so politeness is unchanged; only
different hosts overlap. Each finished source is handed over as soon as it is
ready, so database work runs while slower hosts are still downloading.
"""

import queue
from collections import defaultdict
from collections.abc import Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from .models import RawOpportunity
from .sources.base import SourceAdapter


class Prefetched(SourceAdapter):
    """Replays an adapter's fetch: the same records, then the same failure, if any."""

    def __init__(self, adapter: SourceAdapter, records: list, error: Exception | None):
        self.source_name = adapter.source_name
        self._records, self._error = records, error

    def fetch(self) -> Iterator[RawOpportunity]:
        yield from self._records
        if self._error is not None:
            raise self._error


def host(adapter: SourceAdapter) -> str:
    endpoint = getattr(adapter, "endpoint", None)
    return urlsplit(endpoint).netloc if isinstance(endpoint, str) else adapter.source_name


def prefetch(adapters: Iterable[SourceAdapter], *, workers: int = 8) -> Iterator[SourceAdapter]:
    groups: dict[str, list[SourceAdapter]] = defaultdict(list)
    for adapter in adapters:
        groups[host(adapter)].append(adapter)
    total = sum(len(group) for group in groups.values())
    if not total:
        return
    done: queue.Queue[Prefetched] = queue.Queue()

    def run(group: list[SourceAdapter]) -> None:
        for adapter in group:
            records, error = [], None
            try:
                for record in adapter.fetch():  # keep valid siblings before a failure
                    records.append(record)
            except Exception as exc:  # replayed to the runner, which reports it
                error = exc
            done.put(Prefetched(adapter, records, error))

    with ThreadPoolExecutor(max_workers=min(workers, len(groups))) as pool:
        for group in groups.values():
            pool.submit(run, group)
        for _ in range(total):
            yield done.get()
