#!/usr/bin/env python3
"""Build the digital twin's retrieval index from assets/knowledge/.

Offline step: extract text from the source PDFs and Markdown, split it into
overlapping passages, and write a JSON index that engine/rag/retrieve.mjs loads
at start-up. The index is committed, so retrieval works anywhere the site is
served -- only answer generation needs a model behind it.

    python3 tools/knowledge/build-index.py

Embeddings are optional. Set EMBED_MODEL to also write one dense vector per
passage into index-vectors.bin, which the engine fuses with the lexical ranking:

    EMBED_MODEL=text-embedding-3-large EMBED_DIMENSIONS=1024 python3 tools/knowledge/build-index.py

text-embedding-* models go to OpenAI, with OPENAI_API_KEY read from the
environment or engine/.env; any other model goes to a local Ollama (override
with EMBED_PROVIDER). Provider, model and size are recorded in the index,
because whatever embedded the passages must also embed every question.
"""
from __future__ import annotations

import json
import os
import re
import struct
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "assets" / "knowledge"
OUT_DIR = ROOT / "engine" / "knowledge"
OUT_INDEX = OUT_DIR / "index.json"
OUT_VECTORS = OUT_DIR / "index-vectors.bin"

TARGET_CHARS = 900
OVERLAP_CHARS = 150

# An English descriptor for every source. Two of these documents are written in
# French; a lexical index cannot match an English question against French prose,
# so each passage carries this English surface alongside its own text. Keep the
# wording close to how a visitor would ask about the document.
DOCS = {
    "ALMS-AI Implementation - Configuration Module": {
        "title": "Amadeus LCP configuration chatbot - AI implementation design",
        "about": (
            "Design of the AI implementation for the configuration module of ALMS, "
            "the Amadeus loyalty platform: the configuration chatbot Charaf built."
        ),
        "topic": "amadeus configuration chatbot",
    },
    "ALMS-V2 of AI Implementation - Configuration Module": {
        "title": "Amadeus LCP configuration chatbot - AI implementation, version 2",
        "about": (
            "Second version of the AI implementation for the ALMS configuration "
            "module: the hybrid approach with generated documentation and function "
            "calling that replaced the first RAG-over-Confluence prototype."
        ),
        "topic": "amadeus configuration chatbot",
    },
    "member-insight-ai-agent": {
        "title": "Amadeus Member Insight AI agent - functional and technical report",
        "about": (
            "The Member Insight agent: predicts why a loyalty member is calling, "
            "recommends a next best action, and answers questions about their point "
            "history for airline call-centre agents."
        ),
        "topic": "amadeus member insight",
    },
    "Rapport_REX_Charaf_Amadeus": {
        "title": "Apprenticeship report - Charaf Achir at Amadeus (written in French)",
        "about": (
            "Charaf's own apprenticeship experience report on his GenAI work at "
            "Amadeus: the company, the team, the mission, what he built and learned."
        ),
        "topic": "amadeus apprenticeship",
        "lang": "fr",
    },
    "SaaSOffice_work": {
        "title": "SaaSOffice - AI engineering internship work",
        "about": (
            "Charaf's AI engineering internship at SaaSOffice, a SaaS startup in "
            "Sophia Antipolis: what he built there."
        ),
        "topic": "saasoffice internship",
    },
    "These_VF": {
        "title": (
            "Professional thesis - From Descriptive Business Intelligence to "
            "AI-Native Decision Systems: World Models, Ontologies, and Decision "
            "Intelligence (written in French)"
        ),
        "about": (
            "Charaf's professional thesis on moving from descriptive business "
            "intelligence to AI-native decision systems, covering world models, "
            "ontologies and decision intelligence."
        ),
        "topic": "thesis decision intelligence",
        "lang": "fr",
    },
}

# Short, human names for the chat UI's provenance chips: what Charaf would call
# the document out loud. The long `title` stays the retrieval surface.
LABELS = {
    "ALMS-AI Implementation - Configuration Module": "my configuration-chatbot design",
    "ALMS-V2 of AI Implementation - Configuration Module": "my configuration-chatbot design (v2)",
    "member-insight-ai-agent": "my Member Insight report",
    "Rapport_REX_Charaf_Amadeus": "my apprenticeship report",
    "SaaSOffice_work": "my SaaSOffice internship report",
    "These_VF": "my thesis",
}

FR_MARKERS = {
    "le", "la", "les", "des", "une", "dans", "pour", "que", "qui", "est", "sur",
    "avec", "cette", "nous", "plus", "aux", "par", "ont", "ete", "etre", "leur",
    "sont", "au", "du", "ce", "il", "elle", "ses", "mais", "comme", "chez",
}
EN_MARKERS = {
    "the", "and", "of", "to", "in", "is", "that", "for", "with", "this", "are",
    "it", "as", "be", "on", "by", "from", "which", "was", "were", "an", "at",
    "has", "have", "not", "they", "their",
}


def fold(text: str) -> str:
    """Lowercase and strip accents -- the engine tokenizer does the same."""
    stripped = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in stripped if unicodedata.category(c) != "Mn")


def detect_language(text: str, default: str = "en") -> str:
    words = re.findall(r"[a-z]+", fold(text))
    if len(words) < 20:
        return default
    counts = Counter(words)
    french = sum(counts[w] for w in FR_MARKERS)
    english = sum(counts[w] for w in EN_MARKERS)
    if french == english == 0:
        return default
    return "fr" if french > english else "en"


def clean(text: str) -> str:
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl")
    text = text.replace("’", "'").replace(" ", " ")
    # words broken across a line break by hyphenation
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def read_pdf(path: Path) -> list[tuple[str, int]]:
    """Return one flowing (text, page number) block per page, minus furniture.

    Newlines in these exports carry no paragraph meaning -- several of the
    documents come back one word per line -- so the page is rebuilt as running
    text and build_passages cuts it on sentence boundaries instead.
    """
    import pypdf

    reader = pypdf.PdfReader(str(path))
    pages = [(page.extract_text() or "") for page in reader.pages]

    def edges(text: str) -> list[str]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return lines[:2] + lines[-2:]

    # Running headers and footers sit at the top and bottom of the page, so only
    # those positions are candidates. Testing every line by frequency would
    # delete the language's own stopwords from a word-per-line extraction.
    seen: dict[str, set[int]] = {}
    for number, page in enumerate(pages):
        for line in edges(page):
            if len(line) < 80:
                seen.setdefault(line, set()).add(number)
    threshold = max(3, len(pages) // 3)
    furniture = {k for k, v in seen.items() if len(v) >= threshold}

    out: list[tuple[str, int]] = []
    for number, page in enumerate(pages, start=1):
        text = re.sub(r"(\w)-\n(\w)", r"\1\2", page)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        edge = set(edges(text))
        kept = [
            line
            for line in lines
            if line not in furniture
            and not (line in edge and re.fullmatch(r"\d{1,4}", line))
        ]
        body = clean(" ".join(kept))
        if len(body) > 2:
            out.append((body, number))
    return out


def read_markdown(path: Path) -> list[tuple[str, int]]:
    blocks = []
    for block in re.split(r"\n\s*\n", clean(path.read_text(encoding="utf8"))):
        block = block.strip()
        if block:
            blocks.append((block, 0))
    return blocks


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ü])", text)
    return [p for p in parts if p.strip()]


def build_passages(blocks: list[tuple[str, int]]) -> list[tuple[str, int, int]]:
    """Pack paragraphs into ~TARGET_CHARS passages with a carried-over tail."""
    units: list[tuple[str, int]] = []
    for text, page in blocks:
        if len(text) <= TARGET_CHARS * 1.6:
            units.append((text, page))
            continue
        current = ""
        for sentence in split_sentences(text):
            if current and len(current) + len(sentence) > TARGET_CHARS:
                units.append((current.strip(), page))
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current.strip():
            units.append((current.strip(), page))

    passages: list[tuple[str, int, int]] = []
    body, first_page, last_page = "", None, None
    for text, page in units:
        if body and len(body) + len(text) + 1 > TARGET_CHARS:
            passages.append((body.strip(), first_page, last_page))
            tail = body[-OVERLAP_CHARS:]
            body = tail[tail.find(" ") + 1 :] if " " in tail else ""
            first_page = page
        if first_page is None:
            first_page = page
        last_page = page
        body = f"{body} {text}".strip()
    if body.strip():
        passages.append((body.strip(), first_page, last_page))
    # A passage shorter than this is a stray heading or caption: it carries no
    # usable context and only adds noise to the ranking.
    return [p for p in passages if len(p[0]) >= 250]


def describe(path: Path) -> dict:
    for prefix, meta in DOCS.items():
        if path.stem.startswith(prefix):
            return {**meta, "label": LABELS.get(prefix, meta["title"])}
    return {
        "title": path.stem,
        "about": "",
        "topic": path.stem.lower(),
        "label": path.stem,
    }


def load_env_file(path: Path) -> None:
    """Fill unset variables from a KEY=VALUE file, so the key can live in engine/.env."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export ") :].strip()
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def post_json(url: str, payload: dict, headers: dict | None = None) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def error_code(error: urllib.error.HTTPError) -> str:
    """The provider's error code only: its message can echo part of the key.

    A response body can be read once, so the code is kept on the error.
    """
    if not hasattr(error, "provider_code"):
        try:
            detail = json.loads(error.read().decode("utf8", "replace")).get("error", {})
            error.provider_code = str(detail.get("code") or detail.get("type") or "")
        except (ValueError, AttributeError):
            error.provider_code = ""
    return error.provider_code


def seconds(value: str | None) -> float:
    """OpenAI's rate-limit reset format ('1.5s', '6m0s', '120ms') in seconds."""
    units = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}
    return sum(
        float(amount) * units[unit]
        for amount, unit in re.findall(r"(\d+(?:\.\d+)?)(ms|s|m|h)", value or "")
    )


def post_with_backoff(url: str, payload: dict, headers: dict) -> dict:
    """POST, waiting out rate limits: a low-tier key has a small per-minute budget."""
    for attempt in range(8):
        try:
            return post_json(url, payload, headers)
        except urllib.error.HTTPError as error:
            # insufficient_quota is also a 429, and no amount of waiting fixes it
            if error.code != 429 or error_code(error) == "insufficient_quota" or attempt == 7:
                raise
            try:
                wait = float(error.headers.get("retry-after") or 0)
            except ValueError:
                wait = 0.0
            # Tokens are the usual binding limit for embeddings, and the request
            # clock resets far more slowly, so waiting on it would overshoot.
            wait = (
                wait
                or seconds(error.headers.get("x-ratelimit-reset-tokens"))
                or seconds(error.headers.get("x-ratelimit-reset-requests"))
            )
            wait = min(90.0, (wait or 2.0 ** (attempt + 1)) + 0.5)
            print(f"\n  rate limited; waiting {wait:.0f}s", end="", flush=True)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def embed_ollama(texts: list[str], model: str, dims: int) -> list[list[float]]:
    base = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    vectors: list[list[float]] = []
    for start in range(0, len(texts), 16):
        batch = texts[start : start + 16]
        data = post_json(f"{base}/api/embed", {"model": model, "input": batch})
        vectors.extend(data["embeddings"])
        print(f"  embedded {min(start + 16, len(texts))}/{len(texts)}", end="\r")
    print()
    return vectors


def embed_openai(texts: list[str], model: str, dims: int) -> list[list[float]]:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set in the environment or engine/.env")
    base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    vectors: list[list[float]] = []
    billed = 0
    # ~12K tokens a request, so even a low-tier per-minute budget admits each
    # one on its own; post_with_backoff waits out the rest.
    step = 32
    for start in range(0, len(texts), step):
        payload: dict = {"model": model, "input": texts[start : start + step]}
        if dims:
            # Matryoshka truncation done by the model itself, not by slicing
            payload["dimensions"] = dims
        data = post_with_backoff(
            f"{base}/embeddings", payload, {"Authorization": f"Bearer {key}"}
        )
        rows = sorted(data["data"], key=lambda row: row["index"])
        vectors.extend(row["embedding"] for row in rows)
        billed += data.get("usage", {}).get("total_tokens", 0)
        done = min(start + step, len(texts))
        print(f"\r  embedded {done}/{len(texts)}", end="", flush=True)
    print(f"\n  {billed} tokens billed")
    return vectors


def main() -> int:
    if not SOURCE_DIR.is_dir():
        print(f"[ingest] missing {SOURCE_DIR}", file=sys.stderr)
        return 1

    sources = sorted(
        p for p in SOURCE_DIR.iterdir() if p.suffix.lower() in {".pdf", ".md"}
    )
    if not sources:
        print(f"[ingest] no .pdf or .md in {SOURCE_DIR}", file=sys.stderr)
        return 1

    chunks = []
    for path in sources:
        meta = describe(path)
        blocks = read_pdf(path) if path.suffix.lower() == ".pdf" else read_markdown(path)
        passages = build_passages(blocks)
        default_lang = meta.get("lang", "en")
        for index, (text, first, last) in enumerate(passages):
            chunks.append(
                {
                    "id": f"{path.stem[:32]}#{index}",
                    "source": path.name,
                    "title": meta["title"],
                    "label": meta["label"],
                    "about": meta["about"],
                    "topic": meta["topic"],
                    "lang": detect_language(text, default_lang),
                    "page": first or 0,
                    "pageEnd": last or 0,
                    "text": text,
                }
            )
        languages = Counter(c["lang"] for c in chunks[-len(passages) :])
        print(
            f"  {path.name[:52]:55} {len(passages):4} passages  "
            f"{dict(languages)}"
        )

    load_env_file(ROOT / "engine" / ".env")
    model = os.getenv("EMBED_MODEL", "").strip()
    provider = ""
    if model:
        provider = os.getenv("EMBED_PROVIDER", "").strip().lower() or (
            "openai" if model.startswith("text-embedding-") else "ollama"
        )
    requested = int(os.getenv("EMBED_DIMENSIONS", "0") or 0)
    dims = 0
    if model:
        size = f" @ {requested} dims" if requested else ""
        print(f"[ingest] embedding {len(chunks)} passages with {provider}:{model}{size}")
        # A multilingual model bridges French and English on its own, so only
        # the short document title rides along. The long English descriptor is
        # identical across a whole document: embedding it would pull every
        # passage of that document toward one point and blur which one answers.
        texts = [f"{c['title']}\n\n{c['text']}" for c in chunks]
        embedder = embed_openai if provider == "openai" else embed_ollama
        try:
            vectors = embedder(texts, model, requested)
        except urllib.error.HTTPError as error:
            print(
                f"[ingest] embedding request refused: HTTP {error.code} "
                f"{error_code(error)}"
            )
            model, vectors = "", []
        except (urllib.error.URLError, OSError, KeyError, RuntimeError) as error:
            print(f"[ingest] embeddings unavailable ({error}); writing lexical index")
            model, vectors = "", []
        if vectors:
            dims = len(vectors[0])
            packed = bytearray()
            for vector in vectors:
                norm = sum(v * v for v in vector) ** 0.5 or 1.0
                packed += struct.pack(f"<{dims}f", *[v / norm for v in vector])
            OUT_VECTORS.write_bytes(packed)
            print(f"[ingest] wrote {OUT_VECTORS.name} ({dims} dims, {len(packed)} bytes)")
    if not model and OUT_VECTORS.exists():
        OUT_VECTORS.unlink()
        print(f"[ingest] removed stale {OUT_VECTORS.name}")

    OUT_INDEX.write_text(
        json.dumps(
            {
                "version": 1,
                "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "embedProvider": provider if model else None,
                "embedModel": model or None,
                "embedDimensions": requested if model and requested else None,
                "dims": dims,
                "chunks": chunks,
            },
            ensure_ascii=False,
        ),
        encoding="utf8",
    )
    languages = Counter(c["lang"] for c in chunks)
    print(
        f"[ingest] wrote {OUT_INDEX.relative_to(ROOT)} -- "
        f"{len(chunks)} passages from {len(sources)} documents, {dict(languages)}"
    )
    if not model:
        print(
            "[ingest] lexical index only. For hybrid retrieval, add embeddings:\n"
            "         EMBED_MODEL=text-embedding-3-large EMBED_DIMENSIONS=1024 "
            "python3 tools/knowledge/build-index.py\n"
            "         (OpenAI; OPENAI_API_KEY from the environment or engine/.env)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
