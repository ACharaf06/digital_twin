"""The ceiling on /chat: who a request is charged to, and when it is refused."""
import pytest

from app.limits import RateLimit, visitor


@pytest.fixture
def limit():
    return RateLimit(burst=2, per_minute=60, daily_max=0)  # one token per second


def test_a_visitor_spends_its_burst_then_waits(limit):
    assert limit.check("a", now=0) is None
    assert limit.check("a", now=0) is None
    assert limit.check("a", now=0) == "per-visitor limit reached"


def test_one_visitor_hammering_never_blocks_another(limit):
    while limit.check("noisy", now=0) is None:
        pass
    assert limit.check("someone-else", now=0) is None


def test_the_bucket_refills_with_time(limit):
    assert limit.check("a", now=0) is None
    assert limit.check("a", now=0) is None
    assert limit.check("a", now=0.5) == "per-visitor limit reached"
    assert limit.check("a", now=1) is None


def test_refused_turns_never_refill_by_being_retried(limit):
    limit.check("a", now=0)
    limit.check("a", now=0)
    for moment in (0.1, 0.2, 0.3, 0.4):
        assert limit.check("a", now=moment) == "per-visitor limit reached"
    assert limit.check("a", now=1) is None


def test_the_daily_ceiling_holds_across_every_address():
    limit = RateLimit(burst=10, per_minute=600, daily_max=3)
    assert [limit.check(f"visitor-{n}", now=0) for n in range(3)] == [None] * 3
    assert limit.check("visitor-4", now=0) == "daily ceiling reached"
    assert limit.check("visitor-5", now=86_400) is None  # a new day


def test_refusals_do_not_count_against_the_daily_budget():
    limit = RateLimit(burst=1, per_minute=1, daily_max=5)
    limit.check("a", now=0)
    for _ in range(20):
        limit.check("a", now=0)
    assert limit.today == 1


def test_the_visitor_is_read_from_the_right_where_proxies_append():
    # Cloud Run appends the caller's address; anything before it was supplied
    # by the caller and must not choose their bucket.
    assert visitor("203.0.113.7", None, hops=1) == "203.0.113.7"
    assert visitor("1.1.1.1, 203.0.113.7", None, hops=1) == "203.0.113.7"
    # With a load balancer in front, its own address is appended last.
    assert visitor("203.0.113.7, 10.0.0.1", None, hops=2) == "203.0.113.7"
    assert visitor("1.1.1.1, 203.0.113.7, 10.0.0.1", None, hops=2) == "203.0.113.7"


def test_a_spoofed_chain_cannot_win_a_fresh_bucket(limit):
    for attempt in range(4):
        forwarded = f"{attempt}.{attempt}.{attempt}.{attempt}, 203.0.113.7"
        limit.check(visitor(forwarded, None, hops=1), now=0)
    assert limit.check(visitor("9.9.9.9, 203.0.113.7", None, hops=1), now=0) == (
        "per-visitor limit reached"
    )


def test_without_a_proxy_header_the_peer_answers_for_the_request():
    assert visitor("", "198.51.100.4", hops=1) == "198.51.100.4"
    assert visitor("   ", None, hops=1) == "unknown"


def test_idle_buckets_are_forgotten_so_the_map_cannot_grow_forever():
    limit = RateLimit(burst=1, per_minute=60, daily_max=0)
    from app.limits import SWEEP_EVERY

    for n in range(SWEEP_EVERY + 1):
        limit.check(f"visitor-{n}", now=n)
    assert len(limit._buckets) < SWEEP_EVERY
