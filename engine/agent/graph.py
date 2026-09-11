"""The twin's reasoning, as a LangGraph state machine.

    route ──┬─ small_talk / profile ─────────────────────────────► generate
            └─ documents ─► retrieve ─► grade ─┬─ something kept ─► evidence ─► generate
                                          ▲    └─ nothing kept ─┐
                                          └──── next window ◄───┘   (once)

route     classifies the message and rewrites it as a standalone English
          question plus a French one, because most of the corpus is French.
retrieve  fuses keyword and embedding rankings for both phrasings.
grade     has the model keep only passages that help answer, best first -- a
          reranker and a relevance filter in one call. When nothing survives
          it grades the next window of candidates once, then gives up.
evidence  fits the kept passages to the prompt budget, plus the passages
          adjacent to the best two, since an answer can straddle a boundary.
generate  announces the documents used, then streams the answer.
"""
from __future__ import annotations

import logging
from typing import Literal, TypedDict

import openai
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from agent import prompts
from rag.retriever import CHAR_BUDGET, KnowledgeIndex, searchable

log = logging.getLogger("twin")

# Candidate ranks graded on the first pass, then on the one retry. Every
# passage costs ~250 tokens of grading, against a 60K tokens/minute budget.
GRADE_WINDOWS = ((0, 10), (10, 24))
EVIDENCE_PASSAGES = 4
NEIGHBOUR_CHARS = 2400
NEIGHBOURS_OF = 2  # expand around the best two passages only


class RouteDecision(BaseModel):
    """How to handle the visitor's latest message."""

    kind: Literal["small_talk", "profile", "documents"] = Field(
        description="small_talk needs no facts, profile needs only CV-level facts, documents needs his documents"
    )
    standalone: str = Field(description="the message as a complete English question")
    french: str = Field(description="the same question in natural French")


class Grade(BaseModel):
    """Which retrieved passages help answer the question."""

    relevant: list[int] = Field(
        description="numbers of the passages that help answer, most useful first; empty if none"
    )


class TwinState(TypedDict, total=False):
    message: str
    history: list[dict]
    route: str
    queries: list[str]
    ranking: list[int]  # fused candidate positions, best first
    attempt: int  # grading passes made
    relevant: list[int]  # positions the grader kept, most useful first
    evidence: list[dict]
    answer: str


def conversation(history: list[dict], message: str) -> list[BaseMessage]:
    turns: list[BaseMessage] = [
        HumanMessage(turn["content"]) if turn["role"] == "user" else AIMessage(turn["content"])
        for turn in history
    ]
    return [*turns, HumanMessage(message)]


def with_neighbours(index: KnowledgeIndex, primary: list[dict], budget: int = NEIGHBOUR_CHARS) -> list[dict]:
    """The chosen passages, each of the best few joined by the passages around it."""
    taken = {passage["position"] for passage in primary}
    evidence = []
    for rank, passage in enumerate(primary):
        group = [passage]
        for position in index.neighbours(passage["position"]) if rank < NEIGHBOURS_OF else ():
            text = index.chunks[position]["text"]
            if position in taken or len(text) > budget:
                continue
            taken.add(position)
            budget -= len(text)
            group.append({**index.chunks[position], "position": position, "neighbour": True})
        # in reading order, so a sentence cut at a boundary reads through
        evidence.extend(sorted(group, key=lambda item: item["position"]))
    return evidence


def build_graph(
    index: KnowledgeIndex,
    *,
    model: str,
    api_key: str,
    base_url: str | None = None,
    max_retries: int = 2,
    answer: bool = True,
):
    """Compile the twin. With answer=False it stops once the evidence is chosen,
    which is what the probe measures."""

    def chat(**options) -> ChatOpenAI:
        return ChatOpenAI(model=model, api_key=api_key, base_url=base_url, max_retries=max_retries, **options)

    # Structured steps are never streamed: their JSON is useless half-written,
    # and LangGraph's token stream would otherwise switch them to streaming.
    router = chat(temperature=0, max_tokens=300, timeout=20, disable_streaming=True).with_structured_output(RouteDecision)
    grader = chat(temperature=0, max_tokens=100, timeout=20, disable_streaming=True).with_structured_output(Grade)
    writer = chat(temperature=0.3, max_tokens=450, timeout=60, streaming=True)
    profile = prompts.load_profile()

    async def route(state: TwinState) -> TwinState:
        message, history = state["message"], state.get("history", [])
        if not searchable(message) and not history:
            # "hello", "thanks!", "who are you?": nothing to look up, and no
            # earlier turn for it to follow up on. No model call needed.
            return {"route": "small_talk", "queries": []}
        try:
            decision = await router.ainvoke([SystemMessage(prompts.ROUTER), *conversation(history, message)])
        except openai.APIError:
            raise  # the model is unreachable: generating would fail too
        except Exception as error:
            # A malformed decision should not cost the visitor an answer: fall
            # back to searching the message, borrowing the previous question
            # when it is a short follow-up.
            log.warning("[route] unusable decision, searching the message itself: %r", error)
            previous = next((t["content"] for t in reversed(history) if t["role"] == "user"), "")
            short = len(message.strip()) < 25 and previous
            decision = RouteDecision(
                kind="documents" if searchable(message) else "small_talk",
                standalone=f"{previous} {message}" if short else message,
                french="",
            )
        queries = list(dict.fromkeys(q.strip() for q in (decision.standalone or message, decision.french) if q.strip()))
        log.info("[route] %s", decision.kind)
        return {"route": decision.kind, "queries": queries}

    async def retrieve(state: TwinState) -> TwinState:
        ranking = await index.ranked(state["queries"])
        return {"ranking": ranking, "attempt": 0, "relevant": []}

    async def grade(state: TwinState) -> TwinState:
        attempt = state.get("attempt", 0)
        start, end = GRADE_WINDOWS[attempt]
        window = state["ranking"][start:end]
        if not window:
            return {"attempt": attempt + 1, "relevant": []}
        passages = [index.chunks[position] for position in window]
        request = prompts.grading_request(state["queries"][0], passages)
        try:
            verdict = await grader.ainvoke([SystemMessage(prompts.GRADER), HumanMessage(request)])
            numbers = dict.fromkeys(n for n in verdict.relevant if 1 <= n <= len(window))
            relevant = [window[n - 1] for n in numbers]
        except openai.APIError:
            raise
        except Exception as error:
            log.warning("[grade] unusable grade, keeping the fused ranking: %r", error)
            relevant = window[:EVIDENCE_PASSAGES]
        return {"attempt": attempt + 1, "relevant": relevant}

    def after_grading(state: TwinState) -> str:
        attempt = state["attempt"]
        exhausted = attempt >= len(GRADE_WINDOWS) or len(state["ranking"]) <= GRADE_WINDOWS[attempt][0]
        return "evidence" if state["relevant"] or exhausted else "grade"

    def evidence(state: TwinState) -> TwinState:
        primary = index.select(state["relevant"], k=EVIDENCE_PASSAGES, max_chars=CHAR_BUDGET)
        chosen = with_neighbours(index, primary)
        log.info(
            "[evidence] %d passage(s) after %d grading pass(es)%s",
            len(chosen),
            state["attempt"],
            ": " + ", ".join(f"{p['source']}:{p['page']}" if p.get("page") else p["source"] for p in chosen)
            if chosen
            else "",
        )
        return {"evidence": chosen}

    async def generate(state: TwinState) -> TwinState:
        passages = state.get("evidence", [])
        # Provenance first, so the studio can show it while the answer streams.
        # Deduplicated to the document label: file names and pages stay here.
        labels = list(dict.fromkeys(p["label"] for p in passages if p.get("label")))
        if labels:
            get_stream_writer()({"sources": labels})
        system = prompts.build_system(profile, passages, searched=state["route"] == "documents")
        reply = await writer.ainvoke(
            [SystemMessage(system), *conversation(state.get("history", []), state["message"])]
        )
        return {"answer": reply.content}

    after_routing = {"search": "retrieve", "answer": "generate" if answer else END}
    graph = StateGraph(TwinState)
    graph.add_node("route", route)
    graph.add_node("retrieve", retrieve)
    graph.add_node("grade", grade)
    graph.add_node("evidence", evidence)
    graph.add_edge(START, "route")
    graph.add_conditional_edges(
        "route", lambda state: "search" if state["route"] == "documents" else "answer", after_routing
    )
    graph.add_edge("retrieve", "grade")
    graph.add_conditional_edges("grade", after_grading, ["grade", "evidence"])
    if answer:
        graph.add_node("generate", generate)
        graph.add_edge("evidence", "generate")
        graph.add_edge("generate", END)
    else:
        graph.add_edge("evidence", END)
    return graph.compile(name="digital-twin")
