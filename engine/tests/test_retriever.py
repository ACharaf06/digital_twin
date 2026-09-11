"""The hybrid retriever, against a four-passage index and a mock embeddings API.

The French passage shares no words with the English question that should find
it, so only the dense half of retrieval can reach it.
"""
import asyncio
import json
import re

import numpy as np
import pytest

from rag.retriever import KnowledgeIndex, searchable
from tests.mock_openai import MockOpenAI


def passage(id_, source, lang, text):
    return {
        "id": id_,
        "source": source,
        "label": f"doc {id_}",
        "title": f"Doc {id_}",
        "about": "",
        "topic": id_,
        "lang": lang,
        "page": 1,
        "pageEnd": 1,
        "text": text,
    }


CHUNKS = [
    passage("a", "a.pdf", "fr", "Le chat dort toute la journée sur le canapé du salon."),
    passage("b", "b.pdf", "en", "Quarterly revenue in Nice grew while operating costs stayed flat."),
    passage("c", "c.pdf", "en", "Whisk the eggs, then fold in the flour slowly."),
    # an interview transcript: pleasantries that must never be cited
    passage("d", "d.pdf", "en", "Thanks, that's really helpful. Okay, merci beaucoup, bonjour."),
]
VECTORS = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0.6, 0.8, 0]]


def embed(text, dims):
    # Cat questions land on the French passage, and thanks land right on the
    # transcript -- as a real multilingual model puts "merci" near an
    # acknowledgements page. Anything else is orthogonal to every passage.
    if re.search("cat", text, re.I):
        return [0.9, 0.1, 0, 0]
    if re.search("merci|thank", text, re.I):
        return [0, 0.6, 0.8, 0]
    return [0, 0, 0, 1]


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    directory = tmp_path_factory.mktemp("index")
    (directory / "index.json").write_text(
        json.dumps(
            {
                "version": 1,
                "embedProvider": "openai",
                "embedModel": "test-embed",
                "embedDimensions": 4,
                "dims": 4,
                "chunks": CHUNKS,
            }
        )
    )
    np.asarray(VECTORS, dtype="<f4").tofile(directory / "index-vectors.bin")
    mock = MockOpenAI(embed=embed, dims=4).start()
    loop = asyncio.new_event_loop()
    yield directory, mock, loop
    loop.close()
    mock.stop()


def open_index(world, **options):
    directory, mock, _ = world
    return KnowledgeIndex(
        directory,
        **{"openai_api_key": "test-key", "openai_base_url": mock.base_url, **options},
    )


def run(world, coroutine):
    return world[2].run_until_complete(coroutine)


def sources(passages):
    return [p["source"] for p in passages]


def test_an_english_question_reaches_a_french_passage_it_shares_no_words_with(world):
    index = open_index(world)
    assert index.embed_provider == "openai"
    hits = run(world, index.retrieve("Where does the cat sleep?"))
    assert sources(hits)[:1] == ["a.pdf"]
    # embedded with the model and size recorded in the index, not engine config
    call = world[1].requests[-1]
    assert call["path"] == "/v1/embeddings"
    assert call["auth"] == "Bearer test-key"
    assert call["body"]["model"] == "test-embed"
    assert call["body"]["dimensions"] == 4
    assert call["body"]["input"] == ["Where does the cat sleep?"]


def test_lexical_and_dense_hits_are_fused_into_one_ranking(world):
    found = sources(run(world, open_index(world).retrieve("cat eggs flour")))
    assert "a.pdf" in found, "dense hit missing"
    assert "c.pdf" in found, "lexical hit missing"


def test_dense_hits_below_the_similarity_floor_are_dropped(world):
    # searchable, matches no keyword, and is orthogonal to every passage
    assert run(world, open_index(world).retrieve("quantum chromodynamics")) == []


def test_without_an_api_key_the_index_degrades_to_lexical_and_makes_no_call(world):
    made = len(world[1].requests)
    index = open_index(world, openai_api_key="")
    assert index.embed_model is None
    assert "OPENAI_API_KEY" in index.dense_inactive_reason
    assert run(world, index.retrieve("Where does the cat sleep?")) == []
    assert sources(run(world, index.retrieve("operating revenue")))[:1] == ["b.pdf"]
    assert len(world[1].requests) == made


def test_lexical_mode_never_calls_the_embedding_endpoint(world):
    made = len(world[1].requests)
    run(world, open_index(world).retrieve("Where does the cat sleep?", mode="lexical"))
    assert len(world[1].requests) == made


def test_greetings_and_thanks_retrieve_nothing_even_where_the_embedding_matches(world):
    index = open_index(world)
    for message in ["thanks!", "ok", "hello", "bonjour", "merci beaucoup"]:
        assert run(world, index.retrieve(message)) == [], message
    # "nice" stays searchable: it is also the city
    assert sources(run(world, index.retrieve("Nice")))[:1] == ["b.pdf"]


def test_only_messages_with_something_to_search_reach_the_index():
    for text in ["thanks!", "merci beaucoup", "ok", "who are you?", "   "]:
        assert searchable(text) is False, text
    # Arabic and Chinese have no Latin tokens, but the embeddings can read them
    for text in ["tell me more", "What is LCP?", "Nice", "ما موضوع أطروحتك؟", "你的论文是关于什么的？"]:
        assert searchable(text) is True, text


def test_questions_are_embedded_once_then_remembered(world):
    index = open_index(world)
    run(world, index.retrieve("Where does the cat sleep?"))
    made = len(world[1].requests)
    run(world, index.retrieve("Where does the cat sleep?"))
    assert len(world[1].requests) == made
