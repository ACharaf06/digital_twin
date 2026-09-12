# Digital Twin Engine

The studio's chat backend is a Python service built with FastAPI and LangGraph.
It answers with OpenAI `gpt-4o-mini`, grounded in Charaf's own documents, and
streams the reply to the frontend as server-sent events. Each turn runs a small
agentic RAG graph. It decides whether the question needs the documents,
rewrites it for a mostly French corpus, retrieves and grades passages, and
answers only from what survives. It says so when nothing does.

## Start

Python 3.11+ (LangGraph needs 3.11's async context propagation):

```sh
cd engine
python3.11 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env            # then set OPENAI_API_KEY
.venv/bin/python -m app.main    # http://127.0.0.1:8000
```

`web/vite.config.ts` proxies the studio's `/api/*` to this port. Point it at
another engine with `TWIN_ENGINE_URL`. Without a key the engine still starts:
`/health` reports `offline`, `/chat` answers 503, and the studio disables chat
without producing a local answer.

| Variable | Default |
| --- | --- |
| `OPENAI_API_KEY` | unset: answers, routing, grading, and question embeddings all need it |
| `MODEL` | `gpt-4o-mini` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_MAX_RETRIES` | `2` (per model call, with the SDK's backoff) |
| `TWIN_PORT` | `8000` |
| `ALLOWED_ORIGIN` | `http://localhost:5173` (CORS; comma-separated) |
| `CHAT_BURST` / `CHAT_PER_MINUTE` | `4` / `4` (per visitor; see [Limits](#the-ceiling-on-chat)) |
| `CHAT_DAILY_MAX` | `200` turns across every address; `0` removes it |
| `TRUSTED_PROXY_HOPS` | `1` (proxies appending to `X-Forwarded-For`) |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | unset: tracing off |
| `LANGFUSE_BASE_URL` / `LANGFUSE_HOST` | Langfuse Cloud |
| `LANGFUSE_TRACING_ENVIRONMENT` | `development` |
| `TWIN_ENGINE_URL` (vite dev proxy) | `http://localhost:8000` |

Variables already in the environment win over `engine/.env`. Keep the key out of
any `VITE_*` variable: Vite inlines those into the public bundle. Restart the
engine after editing `content/profile.json` or the committed knowledge index.

## How a turn works

```
route ──┬─ small_talk / profile ─────────────────────────────► generate
        └─ documents ─► retrieve ─► grade ─┬─ something kept ─► evidence ─► generate
                                      ▲    └─ nothing kept ─┐
                                      └──── next window ◄───┘   (once)
```

- **route** classifies the message as `small_talk`, `profile` (CV-level facts
  the always-present profile answers) or `documents`, with one structured
  `gpt-4o-mini` call. The same call rewrites the message as a standalone English
  question, resolving follow-ups such as "tell me more" against the history, and
  again in French. Most of the corpus is French, and the French phrasing is what
  reaches it. A message with nothing to search and no history ("hello",
  "thanks!") skips the call entirely.
- **retrieve** ranks the index for both phrasings, by keywords and by
  embeddings, and fuses the four rankings (see [Retrieval](#retrieval)).
- **grade** shows the model the top 10 candidates and keeps the ones that help
  answer, most useful first. That one call is both a relevance filter and a
  reranker. When it keeps nothing, it grades ranks 11–24 once, then stops.
- **evidence** fits the kept passages to the prompt: up to four, within 4,400
  characters. It adds the passages on either side of the best two (up to 2,400
  more), because an answer can straddle a chunk boundary.
- **generate** sends the `sources` frame, then streams the answer. The system
  prompt holds the twin's identity and grounding rules, the profile and the
  excerpts. When the documents were searched and nothing was kept, the excerpts
  are replaced by a note saying so, and the model must answer from the profile
  or admit it does not know.

A malformed routing or grading reply degrades instead of failing. Routing falls
back to searching the message itself, and grading falls back to the fused
ranking. An API failure (a rate limit after retries, an outage) propagates, and
before the first token that still produces a clean 503.

| File | Role |
| --- | --- |
| `app/main.py` | HTTP contract: validation, `/health`, SSE framing, disconnects |
| `agent/graph.py` | the LangGraph state machine above |
| `agent/prompts.py` | identity and grounding rules, router and grader instructions |
| `agent/orchestrator.py` | runs the graph per turn; LangGraph stream to SSE events |
| `rag/retriever.py` | the committed index: BM25F, dense similarity, fusion |
| `observability.py` | Langfuse callback and trace attributes |

## Measured

`tools/knowledge/probe.py` measures the shipped index. Routing means the
expected document comes first. Answer recall uses eight English questions whose
answer exists only in French. English share is the share of English passages
that open questions retrieve, against 20% of the corpus:

| Pipeline | Routing | Answer recall | English share |
| --- | --- | --- | --- |
| Keywords only | 8/8 | 1/8 | 88% |
| Dense only | 7/8 | 6/8 | 42% |
| Hybrid 1:2 (top 4, no model) | 8/8 | 5/8 | 58% |
| **Graph (shipped)** | **8/8** | **8/8** | not yet measured |

The grader's own picks contain the answer for 6 of the 8 recall questions. The
passages adjacent to the best two pick up the other two: both are SaaSOffice
answers that sit in a passage next to one the grader kept. Every probe question
was routed to `documents` and settled in one grading pass. The run stopped
before the English-share, off-topic and starter sections because the key hit its
daily request cap (see [Cost and limits](#cost-and-limits)). Those sections are
still unmeasured.

Eight questions make a small eval: one question is 12.5 points. Read these as
direction, not precision.

## Contract

`GET /health` reports `ready`, `model-missing` or `offline` (503). It confirms
the model exists at most every ten minutes, since the studio calls it on every
page load:

```json
{"status":"ready","provider":"openai","model":"gpt-4o-mini","engine":"langgraph",
 "tracing":{"enabled":true,"provider":"langfuse","environment":"development"},
 "retrieval":{"ready":true,"passages":793,"embedProvider":"openai","embedModel":"text-embedding-3-large"}}
```

`POST /chat` accepts:

```json
{"message":"What do you build?","history":[{"role":"user","content":"Hi"}],
 "sessionId":"16fd2706-8baf-433b-82eb-8c7fada847da"}
```

The response is `text/event-stream`, with frames separated by a blank line.
When the answer draws on the documents, a `sources` frame arrives first:

```text
data: {"sources":["my thesis"]}

data: {"delta":"I build applied AI systems."}

data: {"done":true}
```

The `sources` frame is omitted when nothing was kept, so clients must treat it
as optional.

Requests are limited to 40 KB and messages to 2,000 characters. Only `user`
and `assistant` history turns are kept, the last 6 at 800 characters each.
`sessionId` is optional; the browser sends one opaque UUID per conversation so
Langfuse can group its turns, and creates a new one when the visitor resets.
Malformed requests return 400 or 413. The response is held until the first token
exists, so a failure anywhere before it returns 503, not a broken stream.
Disconnecting cancels the graph, including an in-flight model request. There is
no contact-forwarding action, database, or saved chat history: the twin tells
visitors it cannot contact anyone, and no tool would make that untrue.

## Retrieval

Source documents live in `assets-source/knowledge/` (PDFs and Markdown). The index is
built offline and **committed**:

```sh
python3.11 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt
EMBED_MODEL=text-embedding-3-large EMBED_DIMENSIONS=1024 tools/.venv/bin/python tools/knowledge/build-index.py
```

That writes `engine/knowledge/index.json`: about 790 passages of roughly 900
characters, each carrying its source, page, detected language, and an English
title and description. It also writes one `text-embedding-3-large` vector per
passage, truncated to 1,024 dimensions, to `index-vectors.bin` (~3 MB). **Commit
both files.** The engine loads them at start-up, so there is no build step and
no vector database. Truncation is the model's own (Matryoshka), not slicing, so
1,024 dimensions keep most of the quality at a third of the size. A build is
paced by the key's tokens-per-minute budget: 429s are waited out, and
`insufficient_quota` stops the build.

`rag/retriever.py` scores keywords with BM25F over two fields: the passage body
and its English descriptor. It ranks by cosine similarity to the question's
embedding, and fuses the rankings by weighted reciprocal rank fusion, with dense
counting double. The retrieval probe measures the Python implementation directly;
there is no second runtime or adapter layer.

**Cross-lingual.** The thesis, the apprenticeship report and the SaaSOffice
report are in French, while most visitors ask in English. The English descriptor
lets keywords route a question to the right document, but not to the right
passage in it. Dense retrieval reaches the French prose, and the graph's French
rewrite gives both rankings a phrasing that matches the text.

**Embeddings.** Provider, model and dimensions are recorded in `index.json`, and
the engine embeds questions with exactly those. A question embedded by a
different model returns confident nonsense, not an error. Recent question
embeddings are cached, since the conversation starters are the same few strings
for every visitor. If the embedding call fails, that turn uses keywords only.

**Similarity floor.** A dense index always has a nearest neighbour, even for
"hello". Hits below `DENSE_MIN_SIMILARITY` (0.31) are dropped. The floor is
specific to the embedding model: re-run `probe.py --calibrate` after changing
it.

**Small talk.** Greetings and thanks are stopwords. In this corpus they occur
only as pleasantries in interview transcripts, so matching them would cite the
thesis under a "thanks!". `searchable()` decides whether a message has anything
to look up. Text in a script the tokenizer cannot read, such as Arabic or
Chinese, always counts, since the embeddings handle it.

**Provenance.** Only the short document label ("my thesis") crosses the wire.
File names, page numbers and passage text stay server-side, and the engine logs
which pages each answer drew on. The prompt names documents the way Charaf
would, never by file or page, and presents excerpts as source material rather
than instructions.

## Cost and limits

A documents turn makes three `gpt-4o-mini` calls (route, grade and answer;
four when the grader retries) and up to two embedding calls. A message with
nothing to search and no history makes one call. The routing and grading prompts
stay small: the grader sees 10 passages of about 900 characters.

The quota, not the price, is the limit. When this was written, the key allowed
**50 `gpt-4o-mini` requests per day** and 60K tokens per minute. OpenAI's error
message offers a higher tier once a payment method is added. That is about 15
grounded answers a day across all visitors. `probe.py --graph` alone needs about
70 requests. Past the cap, OpenAI answers 429 and `/chat` returns 503 within
half a second. The studio marks Live AI unavailable and produces no reply; the
rest of the portfolio remains usable. Add billing before any public deploy.

## The ceiling on /chat

Every call spends quota, so a public endpoint needs a limit that holds before
any model request is made. `app/limits.py` gives each visitor a token bucket —
`CHAT_BURST` messages at once, refilling at `CHAT_PER_MINUTE` — behind a
`CHAT_DAILY_MAX` backstop for traffic spread across many addresses. A refusal
is a 429 decided ahead of reading the body, so it costs nothing, and
the studio treats it like any non-OK response: no canned answer appears.

The visitor is read from the **right** of `X-Forwarded-For`, where proxies
append; whatever a client sent itself stays at the front and is ignored.
`TRUSTED_PROXY_HOPS` says how deep to count: `1` behind Cloud Run or a local
reverse proxy, `2` with a load balancer in front of that. Getting it wrong
files every visitor under one bucket and locks out the whole site at once, so
check it against a real request after any change of host.

Both counters live in memory. One process, no store to coordinate with — and a
host that scales to zero forgets them when it restarts. This stops a visitor
hammering the endpoint while an instance is warm; **the spend cap on the OpenAI
key is what holds when it cannot.** Set both.

## Observability

With `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` set, each chat turn becomes
one Langfuse trace named `twin-chat`, tagged `digital-twin`, `langgraph` and
`rag`. Its `answer-portfolio-question` root is an `AGENT` observation with the
visitor's message, final answer, source labels, status, and conversation
session. Beneath it, the LangChain callback records LangGraph steps and model
generations with prompts, outputs, model names, tokens, costs, and latency. The
hybrid lookup is a `RETRIEVER` observation containing the exact ranked passages
available to the grader. `LANGFUSE_TRACING_ENVIRONMENT` keeps development,
staging, and production data separate.

Tracing is best-effort: a Langfuse initialization or export problem is logged
but never prevents the chat from answering. The SDK queue is drained during
clean engine shutdown.

Traces contain what visitors type, so enabling Langfuse sends their messages to
a third party. Say so in the site's privacy notice, or redact inputs by passing
a `mask` function to the Langfuse client in `observability.py`.

## Tests and probe

```sh
cd engine && .venv/bin/python -m pytest
```

`tests/test_server.py` starts the real engine (`python -m app.main`) against
`tests/mock_openai.py`, a local stand-in for the OpenAI API. It covers health,
Unicode streaming, validation and history clamping, 503s for an outage, a rate
limit and a failure at the answering step, and cancellation reaching the
upstream request. It also checks prompt assembly, the sources frame, small talk,
follow-ups, and the grader's retry and reranking. `tests/test_retriever.py`
covers the dense path: an English question reaching a French passage with no
shared words, fusion, the floor, the keyless fallback and greetings.
`tests/test_graph.py` covers evidence assembly. The tests set `TWIN_NO_DOTENV`,
so they never read `engine/.env`, call the real API, or trace to Langfuse.

```sh
engine/.venv/bin/python tools/knowledge/probe.py              # keywords, dense, hybrid
engine/.venv/bin/python tools/knowledge/probe.py --graph      # the full graph, up to the answer
engine/.venv/bin/python tools/knowledge/probe.py --calibrate  # the similarity floor
engine/.venv/bin/python tools/knowledge/probe.py "any question"
```

The retriever modes are free apart from embeddings. `--graph` runs route,
retrieve and grade for about 30 questions on the real model, roughly 150K
tokens, and stops before writing answers. It exits non-zero below 8/8 routing
or 5/8 recall. Run it after rebuilding the index or changing a prompt.

## Hosting

`python -m app.main` binds `127.0.0.1`, for development. The repository's root
`Dockerfile` builds the image a container host runs, binding `0.0.0.0` on
`$PORT` — the working directory is part of the contract, since imports are
top-level, and the build context is the repository root rather than this
directory, because `agent/prompts.py` reads `content/profile.json` from above
it. Boot to a
served `/health` is **0.9 s** and the process holds **~110 MB**, both measured
in the container, which is what makes scaling to zero reasonable here: the
committed index ships inside the image, so a cold start reads it from local
disk rather than fetching it.

Two shapes work. Same-origin — one box, a reverse proxy serving `web/dist` and
forwarding `/api` — keeps `VITE_ENGINE_URL` at its default and CORS out of the
picture. Split origins cost no code either: set `VITE_ENGINE_URL` at build time
and `ALLOWED_ORIGIN` here, which the CORS middleware is already configured for.

Before going public, in both shapes: a spend cap on the OpenAI key (the limiter
above is best-effort; this is not), `TRUSTED_PROXY_HOPS` checked against a real
request, monitoring, and a privacy notice covering OpenAI and, if enabled,
Langfuse. On a host that throttles CPU between requests, tracing also needs the
per-turn flush in `main.py` — the SDK's background exporter never runs there, so
traces are lost without it.
