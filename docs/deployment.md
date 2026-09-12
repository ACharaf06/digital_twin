# Deployment

The studio is a static bundle on Cloudflare's edge. The engine is a container on
Cloud Run that sleeps when nobody is asking it anything. They are two origins
that have to agree about each other, and almost everything below follows from
that one fact.

```text
charafachir.com              Cloudflare Workers   web/dist, static assets
  │  www.charafachir.com     (same Worker)
  │
  └── POST ──► twin-engine-918447994863.us-central1.run.app
                             Cloud Run            FastAPI + LangGraph + index
                               │
                               ├─► OpenAI      answers, routing, grading, embeddings
                               └─► Langfuse    one trace per turn (EU region)
```

| | |
| --- | --- |
| Cloudflare Worker | `digital-twin`, built from `main` |
| GCP project | `charafachir-twin` (918447994863) |
| Cloud Run service | `twin-engine`, region `us-central1` |
| Instance | 512 MiB, 1 vCPU, concurrency 20, min 0, max 3, startup CPU boost |

## Why the engine is in Iowa

Cloud Run's always-free tier covers only `us-central1`, `us-east1` and
`us-west1`. Deploying to Europe works but costs full price. The portfolio itself
is served from Cloudflare's edge and is fast everywhere regardless; only the
chat pays a transatlantic hop, and that is noise next to the seconds an OpenAI
call takes. Langfuse is separate and stays in the EU.

## The split-origin contract

The browser talks to the engine cross-origin, so two settings must name each
other. Change a domain and you change both, or the chat silently stops working.

| Setting | Lives in | Value |
| --- | --- | --- |
| `VITE_ENGINE_URL` | Cloudflare build variable | the Cloud Run URL |
| `ALLOWED_ORIGIN` | Cloud Run env var | `https://charafachir.com,https://www.charafachir.com` |

`VITE_ENGINE_URL` is compiled into the bundle at build time, not read at
runtime: changing it requires a **frontend rebuild**, not just a Cloudflare
setting change. If it is missing, `twinClient.ts` falls back to `/api`, which
does not exist on Cloudflare, and every visitor sees *AI unavailable*.
`ALLOWED_ORIGIN` is comma-separated, so both hostnames are listed — either one
alone would make the other refuse every chat request.

## Deploying a change

### The studio

Push to `main`. Cloudflare Workers Builds clones the repo and runs:

```sh
cd web && npm ci && npm run build     # build command
npx wrangler deploy                    # deploy command
```

The build command installs its own dependencies because the lockfile is in
`web/`, not at the repo root, and Cloudflare looks at the root to decide whether
to install anything.

`wrangler.jsonc` is the source of truth for the domain. It declares
`charafachir.com` and `www` as custom-domain routes, so a deploy from a clean
checkout lands on the real site and Cloudflare writes the DNS record and issues
the certificate itself. **A deploy overwrites routes changed in the dashboard**,
so change them here.

### The engine

Merging to `main` deploys it. `.github/workflows/deploy-engine.yml` runs the
engine suite, deploys, then polls `/health` and fails the run unless the new
revision reports `ready` with a loaded index — a green deploy means a revision
that actually serves, not one that merely started.

It only fires for paths that can change the engine: `engine/**`, the
`Dockerfile`, the ignore files, and `content/profile.json`. That last one is
shared — the browser imports it and the engine reads it — so a profile change
deploys both halves, Cloudflare handling the studio on its own. Deploying after
a config-only change is `workflow_dispatch`.

GitHub authenticates through Workload Identity Federation: it proves its
identity to Google per run and only this repository may impersonate
`github-deployer@charafachir-twin.iam.gserviceaccount.com`. There is no
service-account key stored anywhere, so there is none to leak or rotate.

To deploy by hand — a rollback, or a broken Actions run — from the repository
root:

```sh
gcloud run deploy twin-engine --source . --region us-central1
```

The build context is the **repository root**, not `engine/`. `agent/prompts.py`
resolves `content/profile.json` from two directories above itself, so an image
built from `engine/` alone starts, serves `/health`, and then fails the first
chat turn with `FileNotFoundError`. The root `Dockerfile` mirrors the repository
layout instead of flattening it.

`.gcloudignore` matters as much as `.dockerignore`: `--source` uploads the
directory to Cloud Build, so without it `engine/.env` would leave the machine
even though it never reaches the image. Check what would be sent with
`gcloud meta list-files-for-upload .` — it should be around 29 files and must
not include `.env`.

Changing only an environment variable needs no rebuild:

```sh
gcloud run services update twin-engine --region us-central1 \
  --update-env-vars "^@^ALLOWED_ORIGIN=https://a.com,https://b.com"
```

The `^@^` prefix changes the separator between pairs so the *value* may contain
commas. Without it the command fails confusingly.

## Configuration

| Variable | Where | Note |
| --- | --- | --- |
| `MODEL` | Cloud Run env | `gpt-4.1-mini` |
| `ALLOWED_ORIGIN` | Cloud Run env | both hostnames |
| `TRUSTED_PROXY_HOPS` | Cloud Run env | `1` on Cloud Run — see below |
| `LANGFUSE_BASE_URL` | Cloud Run env | `https://cloud.langfuse.com` is the **EU** region; `us.` is the US one |
| `LANGFUSE_TRACING_ENVIRONMENT` | Cloud Run env | `production`, so dev traces stay separate |
| `OPENAI_API_KEY` | Secret Manager | `openai-api-key` |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Secret Manager | `langfuse-public-key`, `langfuse-secret-key` |
| `VITE_ENGINE_URL` | Cloudflare build variable | compiled into the bundle |

Rotating a secret is a new version plus a redeploy:

```sh
printf '%s' "NEW_VALUE" | gcloud secrets versions add openai-api-key --data-file=-
gcloud run services update twin-engine --region us-central1 \
  --update-secrets OPENAI_API_KEY=openai-api-key:latest
```

`TRUSTED_PROXY_HOPS` deserves a sentence. Proxies append to `X-Forwarded-For`,
so the trustworthy entries are on the right and anything a client sent itself
stays at the front, where it is ignored. `1` is correct behind Cloud Run; a load
balancer in front of it would make it `2`. Set it too high and every visitor
lands in one bucket, which rate-limits the whole site at once — verified correct
here by confirming Cloud Run logs a real per-client address, and that prepending
a forged header does not win a fresh bucket.

## Verifying a deploy

Cheap checks first.

```sh
URL=https://twin-engine-918447994863.us-central1.run.app
curl -s $URL/health | jq                      # ready, passages 793, tracing production
curl -sN -X POST $URL/chat -H 'Content-Type: application/json' \
     -H 'Origin: https://charafachir.com' -d '{"message":"hello"}'
```

Small talk skips routing and retrieval entirely, so it is one cheap call and
still proves streaming survives the proxy: the `delta` frames must arrive
progressively rather than in one burst at the end. Then one grounded question to
confirm the `sources` frame, and the site itself in a browser.

Two traps when testing the UI with automation: the entrance animation marks the
composer `inert` for the first ~2.6 s, so interacting sooner does nothing; and
the send button stays disabled until React sees input, so typing must go through
a real fill. Wait for the entrance before driving the page.

## When it says "AI unavailable"

That message has three different causes and the UI cannot tell them apart —
`useTwinChat.ts` sets it on any failed chat request. Work down this list.

**1. OpenAI limits.** The most likely cause, and invisible from the dashboard,
which has been wrong about this before. Ask the API what it is actually
enforcing:

```sh
curl -s -D - -o /dev/null https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"hi"}],"max_tokens":1}' \
  | grep -i x-ratelimit
```

A `reset-requests` measured in **hours** means a daily cap and a free-tier key.
In **milliseconds** means a per-minute window, which is what a paid tier looks
like. Two things that cost real time here: adding a payment method does not
raise the tier — credits must actually be **paid** — and an `sk-proj-…` key is
scoped to a **project**, which carries its own limits that can sit below the
org's tier. The org page and the enforcement layer can disagree.

**2. The engine's own rate limit.** Look for `[chat] refused` and a 429:

```sh
gcloud run services logs read twin-engine --region us-central1 --limit 30
```

Defaults are in `engine/.env.example`. They are deliberately conservative; the
counters live in memory and reset with the process, so this is abuse protection,
not a budget. The spend cap on the OpenAI key is the limit that actually holds.

**3. The engine itself.** `curl $URL/health`. `offline` means the key is missing
or OpenAI is unreachable; a connection failure means the service is down.

Not a cause, though it looks like one: a freshly pointed domain can fail to
resolve locally while `dig` sees it, because the resolver cached the negative
answer. `curl --resolve host:443:IP` bypasses it.

## Cost and limits

Roughly **$0.004 per grounded answer** — three `gpt-4.1-mini` calls of about 8k
input and 500 output tokens, at $0.40/M and $1.60/M. Cloud Run and Cloudflare
sit inside their free tiers at portfolio traffic; Langfuse's free tier is 50k
units a month with 30-day retention and a hard cap rather than overage billing.
The domain is the only guaranteed cost, about $10 a year.

**Set a monthly budget cap on the OpenAI key.** The engine's limiter cannot
enforce a budget across cold starts, and the free-tier request ceiling that
once did this by accident disappears the moment the account is paid.

## Measured

| | |
| --- | --- |
| Container boot to served `/health` | 0.90 s, locally |
| Resident memory after boot | 107 MiB |
| Warm `/health`, deployed | 0.20 s |
| First token, warm, small talk | ~1.2 s |
| Grounded answer, end to end | 3–5 s |
| **Cold start, in production** | **not measured** |

The last row is honest rather than empty. Every attempt to measure it found the
container already warm: the studio polls `/health` every 15 seconds, so a single
open tab keeps the instance alive indefinitely. The practical consequence is
that cold starts mostly matter for the *first* visitor after a quiet spell.
`checkEngine` allows 10 s for that request — raised from 5 s precisely because a
sleeping engine wakes on it, and a timeout there is what a visitor reads as *AI
unavailable*. Startup CPU boost is on for the same reason.
