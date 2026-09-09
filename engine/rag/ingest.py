"""Build the vector index from engine/knowledge/*.md.

STUB. Run:  python -m rag.ingest

TODO:
    1. load + chunk every markdown file in knowledge/
    2. embed chunks (e.g. text-embedding-3-small)
    3. persist to a vector store (Chroma / FAISS / pgvector)
"""
from __future__ import annotations

from rag.retriever import KNOWLEDGE_DIR


def main() -> None:
    files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    print(f"[ingest] found {len(files)} knowledge file(s) in {KNOWLEDGE_DIR}")
    for f in files:
        print(f"  - {f.name}")
    print("[ingest] TODO: chunk, embed and persist. (stub)")


if __name__ == "__main__":
    main()
