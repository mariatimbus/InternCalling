"""Bounded, robots-aware, sequential public GETs; no credentials or redirects."""

import json
import time
from collections.abc import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

USER_AGENT = "OpportunityTracker/0.1"
MAX_BYTES = 10_000_000


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PublicJSONClient:
    """Share one instance across companies to enforce a per-host request interval.

    Robots failures fail closed (404 means no rules). Retry only temporary errors,
    at most twice, respecting bounded Retry-After seconds. Never retry parse errors.
    """

    def __init__(
        self,
        *,
        open_url=None,
        sleep: Callable = time.sleep,
        clock: Callable = time.monotonic,
        timeout: float = 15,
        interval: float = 1.0,
    ):
        if timeout <= 0 or interval < 1:
            raise ValueError("positive timeout and at least one second interval required")
        self.open_url = open_url or build_opener(NoRedirect()).open
        self.sleep, self.clock = sleep, clock
        self.timeout, self.interval = timeout, interval
        self._last: dict[str, float] = {}
        self._robots: dict[str, RobotFileParser] = {}

    def _read(self, url: str, interval: float) -> bytes:
        host = urlsplit(url).netloc
        for attempt in range(3):
            delay = interval - (self.clock() - self._last.get(host, float("-inf")))
            if delay > 0:
                self.sleep(delay)
            self._last[host] = self.clock()
            try:
                request = Request(
                    url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
                )
                with self.open_url(request, timeout=self.timeout) as response:
                    data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError("public response exceeds size limit")
                return data
            except (HTTPError, URLError, TimeoutError) as exc:
                if isinstance(exc, HTTPError) and exc.code not in {429, 500, 502, 503, 504}:
                    raise
                if attempt == 2:
                    raise
                retry_after = exc.headers.get("Retry-After") if isinstance(exc, HTTPError) else None
                # Date or unusually long delays defer this company to the next run.
                if retry_after and (not retry_after.isdigit() or int(retry_after) > 60):
                    raise
                self.sleep(max(2**attempt, int(retry_after or 0)))
        raise AssertionError("unreachable")

    def get(self, url: str):
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.username or parts.password:
            raise ValueError("only credential-free HTTPS is supported")
        origin = f"https://{parts.netloc}"
        if origin not in self._robots:
            rules = RobotFileParser()
            try:
                text = self._read(origin + "/robots.txt", self.interval).decode("utf-8")
            except HTTPError as exc:
                if exc.code != 404:
                    raise
                text = "User-agent: *\nDisallow:"
            rules.parse(text.splitlines())
            self._robots[origin] = rules
        rules = self._robots[origin]
        if not rules.can_fetch(USER_AGENT, url):
            raise ValueError("robots policy disallows public endpoint")
        interval = max(self.interval, rules.crawl_delay(USER_AGENT) or 0)
        rate = rules.request_rate(USER_AGENT)
        if rate:
            interval = max(interval, rate.seconds / rate.requests)
        return json.loads(self._read(url, interval))
