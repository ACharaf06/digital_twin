"""A ceiling on /chat, which spends OpenAI quota on every call.

The limit is per visitor, with a daily backstop for traffic that arrives from
many addresses. Both live in memory: this is one small process with no store to
coordinate with, and a host that scales to zero forgets the counters when it
restarts. So this stops the ordinary case -- one visitor hammering the endpoint
while an instance is warm -- and the spend cap on the OpenAI key is what holds
when it cannot.
"""
from __future__ import annotations

import time

DAY = 86_400.0
# A public endpoint should not let the bucket map grow with the number of
# addresses that have ever called, so idle buckets are dropped periodically.
SWEEP_EVERY = 2048


def visitor(forwarded: str, peer: str | None, hops: int) -> str:
    """The address to hold responsible for a request.

    Proxies append to X-Forwarded-For, so the trustworthy entries are the ones
    on the right; anything a client sent itself stays at the front, where it
    must be ignored. Cloud Run appends the caller's address (hops=1) and a load
    balancer in front of it appends its own after that (hops=2). Counting from
    the left instead would let a visitor pick their own bucket; counting from
    the wrong depth would file every visitor under the proxy, which is one
    shared bucket and a limiter that locks out the whole site at once.
    """
    chain = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    index = len(chain) - max(1, hops)
    if chain and index >= 0:
        return chain[index]
    return peer or "unknown"


class RateLimit:
    """Per-visitor token bucket plus a global daily ceiling."""

    def __init__(self, burst: int, per_minute: float, daily_max: int) -> None:
        self._burst = float(max(1, burst))
        self._refill = max(per_minute, 0.001) / 60.0  # tokens per second
        self._daily_max = daily_max
        self._buckets: dict[str, tuple[float, float]] = {}
        self._day_started = float("-inf")
        self._today = 0
        self._since_sweep = 0

    @property
    def today(self) -> int:
        return self._today

    def check(self, who: str, now: float | None = None) -> str | None:
        """None when the turn may proceed, otherwise the reason it may not."""
        now = time.monotonic() if now is None else now
        if now - self._day_started >= DAY:
            self._day_started, self._today = now, 0
        if self._daily_max and self._today >= self._daily_max:
            return "daily ceiling reached"

        tokens, seen = self._buckets.get(who, (self._burst, now))
        tokens = min(self._burst, tokens + (now - seen) * self._refill)
        if tokens < 1.0:
            self._buckets[who] = (tokens, now)
            return "per-visitor limit reached"

        self._buckets[who] = (tokens - 1.0, now)
        self._today += 1
        self._sweep(now)
        return None

    def _sweep(self, now: float) -> None:
        self._since_sweep += 1
        if self._since_sweep < SWEEP_EVERY:
            return
        self._since_sweep = 0
        idle = self._burst / self._refill  # a bucket is back to full by then
        self._buckets = {
            who: state for who, state in self._buckets.items() if now - state[1] < idle
        }
