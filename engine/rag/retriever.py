"""Hybrid retrieval over the committed knowledge index.

The index is engine/knowledge/index.json plus index-vectors.bin, both written by
tools/knowledge/build-index.py and committed, so retrieval needs no database and
no build step. Keywords are scored with BM25F over two fields -- the passage body
and the English descriptor the ingest attached. When the index holds embeddings,
the question is embedded with the index's own model and the two rankings are
fused by weighted reciprocal rank fusion. Without a key it degrades to keywords.

The constants were measured, not chosen: engine/README.md (Retrieval) has the
numbers behind each, and tools/knowledge/probe.py re-measures them.
"""
from __future__ import annotations

import asyncio
import json
import math
import re
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal, Optional, Sequence

import numpy as np
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from pydantic import ConfigDict

K1 = 1.2
B = 0.75
RRF_K = 60
# The English descriptor is scored as its own BM25 field. Folding it into the
# body would make a short passage "mostly header" and hand it the length bonus,
# which floats the shortest passages to the top.
HEADER_WEIGHT = 0.6
# A dense index always has a nearest neighbour, even for "hello". Calibrated for
# text-embedding-3-large at 1,024 dimensions: off-topic turns peaked at 0.28 and
# the weakest real answer scored 0.35. Re-run `probe.py --calibrate` after
# changing the embedding model.
DENSE_MIN_SIMILARITY = 0.31
# Dense counts double. For English questions the keyword ranking skews to the
# corpus's English fragments (88% of its hits against 20% of passages), but
# keywords still catch rare exact terms (LCP, retroclaim, a tool name) that
# dense misses. 1:2 was the most dense weight that kept routing at 8/8.
FUSION_WEIGHTS = {"lexical": 1.0, "dense": 2.0}
TOP = 40  # candidates each ranking contributes to the fusion
# Sized to fit four passages (mean 890 characters, longest ~1,600). At 3,200 a
# "top 4" returned 3.1 on average, and the answer was often the fourth.
CHAR_BUDGET = 4400
EMBED_TIMEOUT = 5.0
CACHE_SIZE = 256

Mode = Literal["lexical", "dense", "hybrid"]
Embed = Callable[[str], Awaitable[Sequence[float]]]

# Greetings, thanks and acknowledgements occur in this corpus only as
# pleasantries in the thesis interview transcripts ("ok" alone is in 70
# passages), so matching them would cite the thesis under a "thanks!". "nice" is
# deliberately absent: it is also the city.
CONVERSATIONAL = """
    hello hi hey hiya yo thanks thank thx cheers ok okay cool
    awesome yeah yep yup nope lol haha bye goodbye please sorry great sure much
    bonjour salut coucou bonsoir merci ciao oui beaucoup super
"""

# Function words carry no retrieval signal and the corpus is bilingual, so both
# languages are stripped. Accents are folded before this set is consulted.
STOPWORDS = frozenset(
    (
        """
    a able about above after again against all also am an and any are aren as at
    be because been before being below between both but by can cannot could did
    do does doing don down during each few for from further had has have having
    he her here hers him his how i if in into is it its itself just me more most
    my no nor not of off on once only or other our out over own same she should
    so some such than that the their them then there these they this those
    through to too under until up very was we were what when where which while
    who whom why will with would you your
    au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma
    mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa
    se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y
    ete etee etees etes etant suis es est sommes etes sont sera serai avoir etre
    avait avais avons avez ont aussi comme donc car plus moins tres bien peut
    entre sans sous chez dont alors encore fait faire cela cette
    """
        + CONVERSATIONAL
    ).split()
)

_MARKS = re.compile("[̀-ͯ]")
_SEPARATORS = re.compile(r"[^a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase, strip accents, drop stopwords, trim simple plurals."""
    folded = _MARKS.sub("", unicodedata.normalize("NFD", text)).lower()
    tokens = []
    for raw in _SEPARATORS.split(folded):
        if len(raw) < 2 or len(raw) > 30 or raw in STOPWORDS:
            continue
        # "agents" and "agent" should collide; "process" must not become "proces"
        plural = len(raw) > 4 and raw.endswith("s") and not raw.endswith("ss")
        tokens.append(raw[:-1] if plural else raw)
    return tokens


def _latin(char: str) -> bool:
    # Stands in for \\p{Script=Latin}: named Latin letters, plus the ordinals and
    # modifier letters ("ª", "ᴬ") whose compatibility form is a plain letter.
    return "LATIN" in unicodedata.name(char, "") or unicodedata.normalize("NFKD", char).isascii()


def searchable(text: str) -> bool:
    """Whether a message has anything to search for.

    Greetings, thanks and stopword-only questions ("who are you?") do not: the
    profile answers those, and retrieving for them cites whatever says "merci"
    in its acknowledgements. Text in a script the tokenizer cannot read (Arabic,
    Chinese...) always counts, because the embeddings handle it.
    """
    if tokenize(text):
        return True
    return any(char.isalpha() and not _latin(char) for char in text)


class KnowledgeIndex:
    """The committed index, loaded once, ranked by keywords and embeddings."""

    def __init__(
        self,
        directory: Path,
        *,
        openai_api_key: str = "",
        openai_base_url: Optional[str] = None,
        embed: Optional[Embed] = None,
        min_similarity: float = DENSE_MIN_SIMILARITY,
        max_retries: int = 2,
    ) -> None:
        self.min_similarity = min_similarity
        self._cache: OrderedDict[str, np.ndarray] = OrderedDict()
        try:
            index = json.loads((Path(directory) / "index.json").read_text(encoding="utf8"))
            reason = None
        except (OSError, ValueError):
            index = {}
            reason = "no index.json -- run tools/knowledge/build-index.py"

        self.chunks: list[dict] = index.get("chunks", [])
        self.built: Optional[str] = index.get("built")
        self.dims = int(index.get("dims") or 0)
        model = index.get("embedModel")
        # Indexes written before the provider was recorded were always Ollama.
        provider = (index.get("embedProvider") or "ollama") if model else None
        if reason is None and not model:
            reason = "the index has no embeddings"

        vectors: Optional[np.ndarray] = None
        self._embed: Optional[Embed] = None
        if model and self.dims:
            try:
                raw = np.fromfile(Path(directory) / "index-vectors.bin", dtype="<f4")
                if raw.size == len(self.chunks) * self.dims:
                    vectors = raw.reshape(len(self.chunks), self.dims).astype(np.float64)
                else:
                    reason = "index-vectors.bin does not match index.json -- rebuild the index"
            except OSError:
                reason = "index-vectors.bin is missing -- rebuild the index"
        if vectors is not None:
            # The question must be embedded by the same model, at the same size,
            # as the passages: a different model returns confident nonsense
            # rather than an error. So both come from the index, never config.
            if embed is not None:
                self._embed = embed
            elif provider != "openai":
                reason = f"this engine embeds questions with OpenAI; the index was built with {provider}"
            elif not openai_api_key:
                reason = f"the index holds {model} vectors but OPENAI_API_KEY is not set"
            else:
                from langchain_openai import OpenAIEmbeddings

                self._embed = OpenAIEmbeddings(
                    model=model,
                    dimensions=index.get("embedDimensions") or None,
                    api_key=openai_api_key,
                    base_url=openai_base_url,
                    max_retries=max_retries,
                    # questions are short; skipping the length check also skips
                    # tiktoken, which would download its tables on first use
                    check_embedding_ctx_length=False,
                ).aembed_query
            if self._embed is None:
                vectors = None
        self._vectors = vectors
        self.embed_model: Optional[str] = model if vectors is not None else None
        self.embed_provider: Optional[str] = provider if vectors is not None else None
        self.dense_inactive_reason: Optional[str] = None if vectors is not None else reason

        # BM25F statistics. ~800 short passages tokenize in well under a second,
        # so the index stays plain text rather than a precomputed posting list.
        self._df: dict[str, int] = {}
        self._body: list[Counter] = []
        self._header: list[Counter] = []
        for chunk in self.chunks:
            header = Counter(tokenize(f"{chunk['title']} {chunk['about']} {chunk['topic']}"))
            body = Counter(tokenize(chunk["text"]))
            for token in header.keys() | body.keys():
                self._df[token] = self._df.get(token, 0) + 1
            self._header.append(header)
            self._body.append(body)
        self._body_len = [sum(counts.values()) for counts in self._body]
        self._header_len = [sum(counts.values()) for counts in self._header]
        count = len(self.chunks) or 1
        self._avg_body = (sum(self._body_len) / count) or 1
        self._avg_header = (sum(self._header_len) / count) or 1

    @property
    def ready(self) -> bool:
        return bool(self.chunks)

    @property
    def size(self) -> int:
        return len(self.chunks)

    @staticmethod
    def _saturate(frequency: int, length: int, average: float) -> float:
        return (frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * length) / average))

    def lexical(self, query: str) -> list[int]:
        """Positions of the best keyword matches, best first."""
        terms = tokenize(query)
        if not terms:
            return []
        count = len(self.chunks)
        scores = [0.0] * count
        for term in terms:
            df = self._df.get(term)
            if not df:
                continue
            idf = math.log(1 + (count - df + 0.5) / (df + 0.5))
            for position in range(count):
                body = self._body[position].get(term, 0)
                header = self._header[position].get(term, 0)
                if not body and not header:
                    continue
                score = (
                    self._saturate(body, self._body_len[position], self._avg_body) if body else 0.0
                )
                if header:
                    score += HEADER_WEIGHT * self._saturate(
                        header, self._header_len[position], self._avg_header
                    )
                scores[position] += idf * score
        ranked = sorted((p for p in range(count) if scores[p] > 0), key=lambda p: -scores[p])
        return ranked[:TOP]

    async def _query_vector(self, query: str) -> Optional[np.ndarray]:
        # The conversation starters are fixed strings, so the same few questions
        # get embedded for every visitor; remembering them saves a paid round trip.
        if query in self._cache:
            self._cache.move_to_end(query)
            return self._cache[query]
        assert self._embed is not None
        embedding = np.asarray(
            await asyncio.wait_for(self._embed(query), EMBED_TIMEOUT), dtype=np.float64
        )
        if embedding.shape != (self.dims,):
            return None
        unit = embedding / (math.hypot(*embedding) or 1.0)
        unit = unit.astype(np.float32).astype(np.float64)  # the index's own precision
        self._cache[query] = unit
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return unit

    async def similarities(self, query: str) -> list[tuple[int, float]]:
        """Every passage's cosine similarity to the question, best first."""
        if self._vectors is None:
            return []
        unit = await self._query_vector(query)
        if unit is None:
            return []
        scores = self._vectors @ unit  # stored L2-normalised, so this is the cosine
        return sorted(((p, float(s)) for p, s in enumerate(scores)), key=lambda item: -item[1])

    async def dense(self, query: str) -> list[int]:
        """Positions of the nearest passages above the similarity floor."""
        ranked = await self.similarities(query)
        return [p for p, similarity in ranked if similarity >= self.min_similarity][:TOP]

    async def rankings(
        self, query: str, mode: Mode = "hybrid", weights: dict = FUSION_WEIGHTS
    ) -> list[tuple[list[int], float]]:
        """The ranked lists one phrasing contributes, each with its fusion weight."""
        lists: list[tuple[list[int], float]] = []
        if mode != "dense":
            lists.append((self.lexical(query), weights["lexical"]))
        if mode != "lexical" and self._vectors is not None:
            try:
                hits = await self.dense(query)
            except Exception:  # an unreachable embedding endpoint: keywords only this turn
                hits = []
            if hits:
                lists.append((hits, weights["dense"]))
        return lists

    @staticmethod
    def fuse(lists: Sequence[tuple[Sequence[int], float]]) -> list[int]:
        """Weighted reciprocal rank fusion; absent from a list costs nothing."""
        scores: dict[int, float] = {}
        for ranking, weight in lists:
            for rank, position in enumerate(ranking):
                scores[position] = scores.get(position, 0.0) + weight / (RRF_K + rank + 1)
        return sorted(scores, key=lambda position: -scores[position])

    async def ranked(
        self, queries: Sequence[str], mode: Mode = "hybrid", weights: dict = FUSION_WEIGHTS
    ) -> list[int]:
        """One fused ranking across several phrasings of the same question."""
        usable = [q for q in queries if q and q.strip() and searchable(q)]
        if not self.chunks or not usable:
            return []
        groups = await asyncio.gather(*(self.rankings(q, mode, weights) for q in usable))
        return self.fuse([item for group in groups for item in group])

    def select(
        self,
        ranking: Sequence[int],
        *,
        k: int = 4,
        max_chars: int = CHAR_BUDGET,
        per_source: Optional[int] = None,
    ) -> list[dict]:
        """Best passages that fit, capped by characters rather than by count."""
        # No per-document cap by default: a question about one document needs
        # all four passages from it, and a cap of 3 measurably cost those answers.
        per_source = k if per_source is None else per_source
        picked: list[dict] = []
        by_source: dict[str, int] = {}
        budget = max_chars
        for position in ranking:
            if len(picked) >= k:
                break
            chunk = self.chunks[position]
            used = by_source.get(chunk["source"], 0)
            if used >= per_source or len(chunk["text"]) > budget:
                continue
            by_source[chunk["source"]] = used + 1
            budget -= len(chunk["text"])
            picked.append({**chunk, "position": position})
        return picked

    async def retrieve(
        self,
        query: str,
        *,
        k: int = 4,
        max_chars: int = CHAR_BUDGET,
        per_source: Optional[int] = None,
        mode: Mode = "hybrid",
        weights: dict = FUSION_WEIGHTS,
    ) -> list[dict]:
        """Top passages for one question. `mode` isolates a ranking for measurement."""
        ranking = await self.ranked([query], mode, weights)
        return self.select(ranking, k=k, max_chars=max_chars, per_source=per_source)

    async def nearest(self, query: str, n: int = 5) -> list[dict]:
        """Nearest passages by embedding alone, with their scores, for calibration."""
        ranked = await self.similarities(query)
        return [
            {**self.chunks[p], "position": p, "similarity": similarity}
            for p, similarity in ranked[:n]
        ]

    def neighbours(self, position: int) -> list[int]:
        """The passages just before and after, when they are from the same document."""
        source = self.chunks[position]["source"]
        return [
            p
            for p in (position - 1, position + 1)
            if 0 <= p < len(self.chunks) and self.chunks[p]["source"] == source
        ]


def to_document(passage: dict) -> Document:
    keys = ("id", "source", "label", "title", "lang", "page", "pageEnd", "position", "similarity")
    return Document(
        page_content=passage["text"],
        metadata={key: passage[key] for key in keys if key in passage},
    )


class HybridRetriever(BaseRetriever):
    """LangChain face of the index: one question in, grounded passages out."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    index: Any  # KnowledgeIndex
    k: int = 4
    max_chars: int = CHAR_BUDGET
    mode: Mode = "hybrid"

    async def _aget_relevant_documents(self, query: str, *, run_manager: Any) -> list[Document]:
        passages = await self.index.retrieve(
            query, k=self.k, max_chars=self.max_chars, mode=self.mode
        )
        return [to_document(passage) for passage in passages]

    def _get_relevant_documents(self, query: str, *, run_manager: Any) -> list[Document]:
        raise NotImplementedError("the index embeds questions asynchronously: use ainvoke")
