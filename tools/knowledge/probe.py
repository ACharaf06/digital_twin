#!/usr/bin/env python3
"""Retrieval probe: routing, answer recall and language bias, measured.

    engine/.venv/bin/python tools/knowledge/probe.py               # keywords, dense, hybrid
    engine/.venv/bin/python tools/knowledge/probe.py --calibrate   # the dense similarity floor
    engine/.venv/bin/python tools/knowledge/probe.py "any question"
    engine/.venv/bin/python tools/knowledge/probe.py --graph       # the full agentic pipeline

OPENAI_API_KEY comes from the environment or engine/.env. Without it only the
keyword ranking can be measured. --graph runs the twin's graph up to the
evidence it would answer from (route, rewrite, retrieve, grade), so it spends
gpt-4o-mini tokens -- roughly 150K for the whole probe -- but writes no answers.
"""
from __future__ import annotations

import asyncio
import re

import openai
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

import config  # noqa: E402  (loads engine/.env)
from rag.retriever import HybridRetriever, KnowledgeIndex  # noqa: E402

# Routing: the document each question should reach first. Asserted on the top
# hit, not "somewhere in the top 4": the thesis alone is three quarters of the
# index, so the weaker test passes by accident.
ROUTING = [
    ("What is your thesis about?", "These_VF"),
    ("Tell me about world models and ontologies", "These_VF"),
    ("What did you do at SaaSOffice?", "SaaSOffice_work"),
    ("What did you build during your apprenticeship at Amadeus?", "Rapport_REX"),
    ("How does Member Insight predict why a member is calling?", "member-insight"),
    ("How does the configuration chatbot use function calling?", "ALMS-V2"),
    ("Qu'est-ce que tu as fait chez SaaSOffice ?", "SaaSOffice_work"),
    ("decision intelligence", "These_VF"),
]

# Answer recall: English questions whose answer is written only in French. The
# pattern matches the sentence that actually answers, and each was checked to
# have no English counterpart anywhere in the corpus -- so a pass means the
# French prose was reached, not an English fragment near it.
NEEDLES = [
    ("How did the SaaSOffice chatbot classify the people it talked to?", r"Fournisseur|Candidat"),
    ("How did the SaaSOffice chatbot work when you arrived?", r"appel consécutifs d'agents|sous-tâches"),
    ("How many employees did SaaSOffice have when you joined?", r"quatre personnes|cinquantaine de salariés"),
    ("Why did your first configuration chatbot give wrong answers?", r"pages Confluence avaient été écrites|doc drift"),
    ("What did demoing prototypes to clients teach you?", r"annoncer une limite"),
    ("What changes for a GenAI developer when a prototype becomes a product?", r"la difficulté se déplace|faisabilité technique"),
    ("How do you think about technical debt?", r"dette technique"),
    ("Do people have to choose between transparency and performance in AI decisions?", r"positivement\s+corrélées|transparence contre performance"),
]
NEEDLES = [(question, re.compile(pattern)) for question, pattern in NEEDLES]

# Language bias: open questions. The English share of what they retrieve should
# sit near the corpus share, not far above it.
OPEN = [
    "What is your thesis about?",
    "What did you learn during your apprenticeship?",
    "What surprised you most while building AI at Amadeus?",
    "How do you evaluate AI systems?",
    "Tell me about world models",
    "What is decision intelligence?",
]

# Conversational and off-topic turns: nothing should be retrieved for these,
# which is what sets the dense similarity floor from below.
OFF_TOPIC = [
    "hello",
    "thanks!",
    "what's the weather like today?",
    "tell me a joke",
    "who won the football last night?",
    "zzzz",
]

# Hybrid answer recall when text-embedding-3-large and the 1:2 fusion were
# chosen (dense alone scored 6/8, keywords alone 1/8). Falling below it fails
# the probe: something in retrieval regressed.
RECALL_FLOOR = 5

# The studio's conversation starters (web/src/components/TwinConsole.tsx): the
# most-clicked questions on the page, so their routing is worth watching.
STARTERS = [
    "Tell me about your work at Amadeus",
    "Tell me about your most creative project",
    "Tell me about your background and education",
    "What surprised you most while building AI at Amadeus?",
]


def pct(part: int, whole: int) -> str:
    return f"{100 * part / (whole or 1):.0f}%"


def line(document) -> str:
    meta = document.metadata
    where = f"p{meta['page']}" if meta.get("page") else "md"
    text = " ".join(document.page_content.split())[:80]
    return f"[{meta['lang']}] {meta['source'][:34]:34} {where:5} {text}…"


async def report(index: KnowledgeIndex, retrievers: dict) -> int:
    modes = list(retrievers)
    main = modes[-1]

    print(f"\nROUTING — expected document ranked first ({main})")
    routed = 0
    for question, expected in ROUTING:
        hits = await retrievers[main].ainvoke(question)
        got = hits[0].metadata["source"] if hits else "nothing"
        ok = got.startswith(expected)
        routed += ok
        print(f"  {'PASS' if ok else 'FAIL'}  {question}{'' if ok else f'  → {got}'}")

    print("\nANSWER RECALL @4 — English question, answer written only in French")
    print("  " + "".join(f"{mode:9}" for mode in modes) + "question")
    recall = dict.fromkeys(modes, 0)
    for question, pattern in NEEDLES:
        marks = []
        for mode in modes:
            hits = await retrievers[mode].ainvoke(question)
            ok = any(pattern.search(hit.page_content) for hit in hits)
            recall[mode] += ok
            marks.append(f"{'✓' if ok else '·':9}")
        print("  " + "".join(marks) + question)
    print("  " + "".join(f"{f'{recall[m]}/{len(NEEDLES)}':9}" for m in modes) + "total")

    print("\nLANGUAGE — English share of passages retrieved for open questions")
    english = sum(chunk["lang"] == "en" for chunk in index.chunks)
    print(f"  {'corpus':9}{pct(english, index.size)}")
    for mode in modes:
        en = total = 0
        for question in OPEN:
            for hit in await retrievers[mode].ainvoke(question):
                total += 1
                en += hit.metadata["lang"] == "en"
        print(f"  {mode:9}{pct(en, total)}  ({en}/{total})")

    floor = RECALL_FLOOR if index.embed_model else 0
    print(f"\n{routed}/{len(ROUTING)} routed · {main} recall {recall[main]}/{len(NEEDLES)} (floor {floor})")
    return 0 if routed == len(ROUTING) and recall[main] >= floor else 1


async def calibrate(index: KnowledgeIndex) -> int:
    if not index.embed_model:
        print("dense retrieval is off: nothing to calibrate")
        return 1

    async def top(question: str) -> float:
        nearest = await index.nearest(question, 1)
        return nearest[0]["similarity"] if nearest else 0.0

    print("\nOFF-TOPIC — best similarity (these should retrieve nothing)")
    noise = 0.0
    for question in OFF_TOPIC:
        similarity = await top(question)
        noise = max(noise, similarity)
        print(f"  {similarity:.3f}  {question}")

    print("\nANSWERS — similarity of the passage that actually answers")
    signal = float("inf")
    for question, pattern in NEEDLES:
        ranked = await index.nearest(question, index.size)
        rank = next((i for i, hit in enumerate(ranked) if pattern.search(hit["text"])), -1)
        similarity = ranked[rank]["similarity"] if rank >= 0 else 0.0
        signal = min(signal, similarity)
        print(f"  {similarity:.3f}  rank {rank + 1:3}  {question}")

    print("\nOPEN — best similarity")
    for question in OPEN:
        print(f"  {await top(question):.3f}  {question}")

    print(f"\nnoise ceiling {noise:.3f} · weakest answer {signal:.3f}")
    if noise < signal:
        print(f"clean gap: a floor of ~{(noise + signal) / 2:.2f} drops every off-topic turn and keeps every answer")
    else:
        print("no clean gap: some off-topic turn scores as high as a real answer")
    return 0


async def graph_report(index: KnowledgeIndex, hybrid: HybridRetriever) -> int:
    from langchain_core.callbacks import UsageMetadataCallbackHandler

    from agent.graph import build_graph

    if not config.OPENAI_API_KEY:
        print("--graph needs OPENAI_API_KEY")
        return 1
    # Generous retries: questions go back to back into a tokens-per-minute
    # limit, and the SDK's backoff paces them. A daily request cap cannot be
    # waited out, so that stops the run with whatever was measured so far.
    twin = build_graph(
        index,
        model=config.MODEL,
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL,
        max_retries=8,
        answer=False,
    )
    latencies: list[float] = []
    tokens: list[int] = []

    async def run(question: str) -> dict:
        usage = UsageMetadataCallbackHandler()
        started = time.perf_counter()
        state = await twin.ainvoke({"message": question, "history": []}, config={"callbacks": [usage]})
        latencies.append(time.perf_counter() - started)
        tokens.append(sum(m.get("total_tokens", 0) for m in usage.usage_metadata.values()))
        return state

    def where(state: dict) -> str:
        evidence = state.get("evidence", [])
        kept = sum(not p.get("neighbour") for p in evidence)
        passes = state.get("attempt", 0)
        return f"{state['route']}, {kept} kept + {len(evidence) - kept} adjacent, {passes} grading pass(es)"

    recall = {"hybrid": 0, "kept": 0, "graph": 0}
    counts: dict = {}
    try:
        await graph_sections(index, hybrid, run, where, recall, counts)
    except openai.RateLimitError as error:
        detail = error.body.get("message", str(error)) if isinstance(error.body, dict) else str(error)
        print(f"\nSTOPPED by the {config.MODEL} rate limit: {detail}")
    routed, quiet = counts.get("routed", 0), counts.get("quiet", 0)
    if latencies:
        ordered = sorted(latencies)
        print(
            f"\nbefore the first token: median {statistics.median(ordered):.2f}s, "
            f"p90 {ordered[int(0.9 * (len(ordered) - 1))]:.2f}s, max {ordered[-1]:.2f}s over {len(ordered)} questions "
            f"(route + retrieve + grade; rate-limit waits included)"
        )
        print(f"tokens before answering: median {statistics.median(tokens):.0f}, max {max(tokens)} per question")
    print(
        f"\n{routed}/{len(ROUTING)} routed · graph recall {recall['graph']}/{len(NEEDLES)} "
        f"(floor {RECALL_FLOOR}) · {quiet}/{len(OFF_TOPIC)} off-topic quiet"
    )
    return 0 if routed == len(ROUTING) and recall["graph"] >= RECALL_FLOOR else 1


async def graph_sections(index, hybrid, run, where, recall: dict, counts: dict) -> None:
    print(f"\nGRAPH ROUTING — expected document first in the evidence ({config.MODEL})")
    routed = 0
    for question, expected in ROUTING:
        state = await run(question)
        evidence = state.get("evidence", [])
        got = evidence[0]["source"] if evidence else "nothing"
        ok = got.startswith(expected)
        routed += ok
        print(f"  {'PASS' if ok else 'FAIL'}  {question}  [{where(state)}]{'' if ok else f'  → {got}'}")
    counts["routed"] = routed

    print("\nGRAPH ANSWER RECALL — English question, answer written only in French")
    print(f"  {'hybrid@4':10}{'kept':6}{'+adjacent':11}question")
    for question, pattern in NEEDLES:
        baseline = any(pattern.search(hit.page_content) for hit in await hybrid.ainvoke(question))
        state = await run(question)
        evidence = state.get("evidence", [])
        kept = any(pattern.search(p["text"]) for p in evidence if not p.get("neighbour"))
        full = any(pattern.search(p["text"]) for p in evidence)
        for name, ok in (("hybrid", baseline), ("kept", kept), ("graph", full)):
            recall[name] += ok
        marks = f"  {'✓' if baseline else '·':10}{'✓' if kept else '·':6}{'✓' if full else '·':11}"
        print(f"{marks}{question}  [{where(state)}]")
    totals = {name: f"{count}/{len(NEEDLES)}" for name, count in recall.items()}
    print(f"  {totals['hybrid']:10}{totals['kept']:6}{totals['graph']:11}total")

    print("\nGRAPH LANGUAGE — English share of the evidence for open questions")
    english = sum(chunk["lang"] == "en" for chunk in index.chunks)
    en = total = 0
    for question in OPEN:
        for passage in (await run(question)).get("evidence", []):
            total += 1
            en += passage["lang"] == "en"
    print(f"  corpus {pct(english, index.size)} · graph {pct(en, total)}  ({en}/{total})")

    print("\nGRAPH OFF-TOPIC — should cite nothing")
    quiet = counts["quiet"] = 0
    for question in OFF_TOPIC:
        state = await run(question)
        ok = not state.get("evidence")
        quiet += ok
        print(f"  {'PASS' if ok else 'FAIL'}  {question}  [{where(state)}]")
        counts["quiet"] = quiet

    print("\nSTARTERS — the studio's suggested questions")
    for question in STARTERS:
        state = await run(question)
        labels = list(dict.fromkeys(p["label"] for p in state.get("evidence", [])))
        print(f"  {question}  [{where(state)}]  sources: {', '.join(labels) or 'none'}")


async def adhoc(index: KnowledgeIndex, retrievers: dict, question: str) -> int:
    for mode, retriever in retrievers.items():
        print(f"\n{mode}")
        for hit in await retriever.ainvoke(question):
            print(f"  {line(hit)}")
    if index.embed_model:
        print("\nnearest by embedding")
        for hit in await index.nearest(question, 5):
            text = " ".join(hit["text"].split())[:80]
            print(f"  {hit['similarity']:.3f} [{hit['lang']}] {hit['source'][:34]:34} {text}…")
    return 0


async def main(argv: list[str]) -> int:
    index = KnowledgeIndex(
        config.KNOWLEDGE_DIR,
        openai_api_key=config.OPENAI_API_KEY,
        openai_base_url=config.OPENAI_BASE_URL,
    )
    dense = f"{index.embed_provider}:{index.embed_model}" if index.embed_model else f"off ({index.dense_inactive_reason})"
    print(f"index: {index.size} passages · dense: {dense}")
    modes = ["lexical", "dense", "hybrid"] if index.embed_model else ["lexical"]
    # one index behind every mode, so each question is embedded once
    retrievers = {mode: HybridRetriever(index=index, mode=mode) for mode in modes}
    if argv[:1] == ["--calibrate"]:
        return await calibrate(index)
    if argv[:1] == ["--graph"]:
        return await graph_report(index, retrievers["hybrid" if index.embed_model else "lexical"])
    if argv:
        return await adhoc(index, retrievers, " ".join(argv))
    return await report(index, retrievers)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv[1:])))
