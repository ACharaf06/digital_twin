"""Evidence assembly: kept passages plus the passages around the best of them."""
import json

import pytest

from agent.graph import with_neighbours
from rag.retriever import KnowledgeIndex


def passage(id_, source, text):
    return {"id": id_, "source": source, "label": source, "title": source, "about": "",
            "topic": "", "lang": "en", "page": 1, "pageEnd": 1, "text": text}


@pytest.fixture(scope="module")
def index(tmp_path_factory):
    directory = tmp_path_factory.mktemp("index")
    chunks = [
        passage("a#0", "a.pdf", "The migration started in March."),
        passage("a#1", "a.pdf", "It moved every agent to the new runtime,"),
        passage("a#2", "a.pdf", "which cut latency by half."),
        passage("b#0", "b.pdf", "An unrelated document."),
    ]
    (directory / "index.json").write_text(json.dumps({"chunks": chunks}))
    return KnowledgeIndex(directory)


def positions(evidence):
    return [p["position"] for p in evidence]


def test_a_kept_passage_is_read_with_its_neighbours_in_order(index):
    evidence = with_neighbours(index, index.select([1]))
    assert positions(evidence) == [0, 1, 2]
    assert [bool(p.get("neighbour")) for p in evidence] == [True, False, True]


def test_neighbours_never_cross_into_another_document_or_repeat(index):
    evidence = with_neighbours(index, index.select([3, 1, 2]))
    assert positions(evidence) == [3, 0, 1, 2]


def test_neighbours_only_fill_the_room_left(index):
    assert positions(with_neighbours(index, index.select([1]), budget=10)) == [1]
