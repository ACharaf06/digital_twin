# Member Insight AI Agent

_Functional & technical report · Amadeus Loyalty_

An assistant that reads a loyalty member's record the moment a call-centre agent opens it, predicts why that member is calling, proposes what to do about it, and then answers follow-up questions about the member's point history in plain language.

| | |
|---|---|
| **Delivers** | Member snapshot, predicted call reason, next best action, chat |
| **Consumed by** | The Loyalty back-office UI used by airline call centres |
| **Reads from** | LCP, the Amadeus loyalty platform, over its REST API |
| **Runs on** | Two Azure Web Apps, built on the A3TK agent toolkit |
| **Maturity** | Deployed to test environments; behind a feature flag |

---

# What it does

## A call-centre agent has thirty seconds and eleven tabs

_The value of this system is entirely about the first half-minute of a phone call._

When a member of an airline's frequent-flyer programme phones the call centre, the human agent who picks up opens that member's record in a back-office application. What they get is accurate and complete: profile, balances, tier, transaction history, notes, claims, orders, vouchers, promotions — each in its own screen, each a separate lookup.

What they do *not* get is a read on the situation. Is this member about to lose their status? Did a flight from last week never credit? Has someone already complained twice about the same thing? Answering any of those means clicking through several screens while the member waits. In practice the agent asks "how can I help you today?" and works it out from the conversation, which is slower and loses the chance to open with something useful.

**Member Insight closes that gap.** The moment the record is opened, it fetches everything relevant in parallel, looks for the patterns a seasoned agent would look for, and presents three things above the fold: a condensed snapshot, the most probable reason for the call with a confidence level and a written justification, and a concrete recommended next step. A chat assistant sits alongside it for everything the panel does not cover — principally deep questions about the member's point transactions.

- **Anticipate, don't ask.** The predicted call reason lets the agent open with "I can see a flight from last Tuesday hasn't credited yet" instead of an open question.
- **One read instead of eleven.** Seventeen separate platform lookups are collapsed into a single panel that renders once, in parallel, on page open.
- **Ask in words, not filters.** "Show earn versus redeem over the last twelve months by partner type" replaces a manual query against the activity screen.

---

## Eleven words you need before anything else makes sense

The domain has its own vocabulary, and most of this report depends on it. Nothing here is specific to the AI agent — this is the loyalty world it lives in.

| Term | What it means |
|---|---|
| `LCP` | The Amadeus loyalty platform itself — the system of record holding members, points, tiers, and every transaction. Everything the agent knows, it reads from LCP over a REST API. |
| `LUI` | The web application airline back-office and call-centre staff use to work with LCP. This is where Member Insight appears. Built in Angular. |
| `Member` | A person enrolled in a loyalty programme. Identified by a membership number. |
| `Programme owner / programme code` | Which airline's loyalty programme this is. One deployment serves many airlines, so every single request must say which programme it is about; there is no default. |
| `Points / miles` | The programme currency. A programme can run several currencies at once — a spendable one, a separate one that counts toward status, bonus buckets — which is why the code never assumes a single balance. |
| `Tier` | Status level (Silver, Gold, Platinum…). Tiers expire and must be re-qualified for, which makes "how close am I to keeping my status" one of the most common call reasons in the industry. |
| `Accrual` | Points being credited to a member — typically after a flight. |
| `Redemption` | Points being spent. |
| `Retroclaim` | A member's formal request to have a past flight credited that never came through. An open retroclaim is a strong signal that the member is chasing missing miles. |
| `Activity` | One line in the member's transaction history — an accrual, a redemption, an expiry, a cancellation. |
| `Phase` | Amadeus's word for an environment: `DEV` `PDT` `UAT` `PRD`. Each has its own LCP gateway. The UI tells the agent which phase the logged-in user is working in, and the agent routes accordingly. |

---

## What the user actually sees

Two surfaces inside the existing application. Both are gated behind a feature flag and a user permission, so an airline that has not bought the capability never sees them.

### The AI Insights panel

A collapsible panel at the top of the member dashboard, marked with an `AI GENERATED` badge and an information button carrying the disclaimer that AI content may be inaccurate and should be verified before acting. It has a refresh control. It contains:

- **A three-part summary** — tier (with what is still needed to qualify for the next one), balance (current, pending, and anything expiring within ninety days), and activity (when the member last did anything).
- **Intent Detection** — one sentence naming the most likely call reason, a confidence badge (`Very High` down to `Very Low`), and one or two sentences of plain-English justification.
- **Next Best Action** — a titled recommendation, a short explanation, and where relevant a note that the recommendation is policy-controlled and the agent should check the airline's current procedure before executing it.

### The AI Assistant chat

A floating, draggable, resizable chat window available across the application. It offers quick-query chips — on a member page these are things like *"Show earn vs redeem last 12 months broken down by partner type"* or *"Show the member's recent retroclaim history"* — and a free-text box. It carries the same AI-generated badge and disclaimer, and resets its conversation when the user navigates to a different member.

> **Design position**
>
> The system is explicitly framed as an assistant to a human decision-maker, never as an automatic actor. It reads; it never changes a member's data on its own initiative. The one write capability it has — creating a note on the account to document the interaction — is exposed to a chat agent that is not currently reachable in production traffic (see *Current state, and what is honestly not finished*).

---

## Everything is one of two interactions

The whole public surface is a single HTTP endpoint that behaves in two different ways depending on what the caller asks for.

### Bootstrap — once, when the record is opened

The UI sends one request carrying the membership number and a flag saying `intent: bootstrap`. The agent gathers everything, reasons about it, and returns a single envelope with three objects:

```json
{
  "snapshot":   { ...balances, tier, expiring points, signals... },
  "intent":     { intent, category, reasoning, confidenceLevel, aiBadge },
  "nextAction": { id, title, description, reasoning,
                  policyControlled, fallbackOptions }
}
```

The UI actually issues this call slightly before the user reaches the dashboard — it is triggered from an earlier page in the navigation and cached per member — so the panel is often already populated by the time the page renders.

### Chat — once per message the agent types

Every subsequent message goes to the same endpoint without the bootstrap flag, and comes back as plain text ready to render. Critically, the bootstrap result is not re-sent by the UI: the agent stored it and silently re-injects the snapshot, the detected intent, and the recommended action into the prompt for every chat turn, so the assistant is always talking about the member currently on screen.

### The request envelope

Both patterns use the same message format: **A2A**, an agent-to-agent protocol carried as JSON-RPC over HTTPS. A message is a list of parts — a text part with what the user said, and a data part carrying the metadata that identifies the context.

| Metadata field | Required | Purpose |
|---|---|---|
| `member_id` | **yes** | Which member. Used for every platform lookup. |
| `session_id` | **yes** | Scopes the conversation and the cache. Must equal the message's `contextId` — the token that authorises platform calls is filed under that key. |
| `programOwner` | **yes** | Which airline. No default; a request without it is rejected. |
| `programCode` | **yes** | Which programme within that airline. |
| `phase` | optional | Which environment's platform gateway to read from. |
| `correlation_id` | optional | Tracing identifier stamped on every log line. Generated if absent. |
| `response_language` | optional | Language the answer must be written in, regardless of the language of the underlying data. |
| `intent` | optional | Set to `bootstrap` to trigger the first pattern. |

Missing metadata does not produce an HTTP error. The agent returns a successful response whose body is a structured error object with a suggestion — for example `{"error": "Missing required metadata: programOwner", "suggestion": "Send programOwner in member_insight_metadata."}` — which keeps the transport contract uniform and gives the UI something displayable.

---

## How the call reason is predicted

This is the functional heart of the system, and it is deliberately not "ask a model what it thinks". It is a two-stage design: *evidence is computed in code, judgement is delegated to a model.*

### Stage one — signals, computed deterministically

Raw platform data is reduced to a small vocabulary of named **signals**, each with a type, a human-readable value, and a severity. This is ordinary Python with explicit thresholds — no model is involved, so the same member data always produces the same signals, and every threshold is reviewable.

| Signal | Raised when | Severity |
|---|---|---|
| `LIFE_CYCLE` | The member is recorded as deceased. | critical |
| `MAIN_STATUS` / `ACTIVITY_STATUS` | Membership suspended or banned (critical); under investigation or inactive (warning). | critical / warning |
| `FRAUD_STATUS` | Fraud flag set to anything other than a clear value. | critical / warning |
| `LOW_BALANCE` | Spendable balance above zero but below 500 points. | warning |
| `POINTS_EXPIRING` | Member-facing points expiring within ninety days. | warning |
| `COMPLEX_BALANCE` | More than one usable point bucket — a common source of "why can't I spend all my points?" calls. | info |
| `TIER_VALIDITY_ENDING` | Current tier expires within 75 days. | warning |
| `STALE_CONTACT_INFO` | Any email, phone, or address marked invalid. | warning |
| `RETURNED_MAIL` / `BOUNCED_EMAIL` | Address or note text mentions returned post or a bounced email. | warning |
| `RECENT_COMPLAINT_NOTES` | Two or more account notes containing complaint or escalation language. | warning |
| `NEGATIVE_NOTE` | Exactly one such note — noted, but not treated as a pattern. | info |

Alongside these, a second deterministic pass collects **supplementary evidence** within tightly bounded time windows, so that stale records cannot masquerade as a live situation: retroclaims, orders and shopping orders, vouchers, promotions, point expiries and redemptions from the last seven days, cancellations from the last fourteen, and — the key one for missing miles — flights that took place between three and fourteen days ago. That window is chosen because a flight younger than three days has not had time to credit, and one older than fourteen has usually already generated a claim.

### Stage two — classification, delegated to a model

The signals and supplementary evidence go to a language model with a strictly specified job: pick exactly one of sixteen categories, justify it in one or two sentences of call-centre English, assign a confidence level, and return nothing but JSON. The prompt forbids it from using the member's name as evidence (test data is full of names like "DUMMY COMPLAINT"), forbids it from leaking internal field names into the justification, and gives it a strict priority ladder to resolve members who show several signals at once:

1. **COMPLAINT** — Repeated complaint notes, two or more rejected claims, or a pattern of cancelled and failed orders. Always dominates everything else.
2. **ACCOUNT_ACCESS** — Account locked or suspended, or a fraud flag set.
3. **TRANSACTION_DISPUTE** — A cancellation or negative manual adjustment in the last fourteen days.
4. **REDEMPTION_FAILURE** — An order carrying an error code, or a recently cancelled or held shopping order.
5. **MISSING_MILES** — An open claim, or a flight in the three-to-fourteen-day window with no matching credit.
6. **UPDATE_INFO** — Invalid contact details, returned mail, or a bounced email.
7. **BOOKING_MODIFICATION** — An order confirmed in the last forty-eight hours, still inside the modification window.
8. **DOWNGRADE** — Tier expiring within sixty days with qualifying points short of the threshold.
9. **TIER_QUESTION** — Tier expiring within ninety days, or a recent tier change.
10. **BALANCE_INQUIRY** — Points expiring, or a large expiry debit in the last seven days.
11. **PROMOTIONS** — A promotion achieved but not yet paid out, or one ending within thirty days.
12. **POINTS_REDEMPTION** — A pending order or an active shopping cart.
13. **VOUCHER** — A voucher expiring within thirty days or left suspended.
14. **EARNING_RULES** — Newly enrolled, recent tier change, or no earning activity in six months.
15. **ACCOUNT_MAINTENANCE** — Long-dormant membership, or a suspected duplicate record.
16. **GENERAL** — Nothing above meets its threshold.

Why a ladder rather than a score? Because in this domain the categories are not equally urgent. A member who is both close to a tier downgrade and has complained twice this month is calling about the complaint, and a system that averaged the two would get it wrong in a way that damages the call.

### Stage three — the recommendation

A second model call turns the category into an action. The mapping is fixed and stated in the prompt as business rules — `MISSING_MILES` → "Verify and Credit Missing Miles", `DOWNGRADE` → "Offer Tier Retention Action", `COMPLAINT` → "Create Complaint Note and Offer Compensation" — so the model's remaining job is wording, not deciding. It receives a small slice of evidence filtered to the detected category, and it must supply exactly one fallback option (escalate, transfer, and so on).

It also sets a `policyControlled` flag whenever the recommendation depends on the airline's own rules — compensation limits, escalation paths, tier exceptions. The UI turns that flag into a visible caution: *"Policy-controlled recommendation. Verify current customer policy before execution."* This is the system explicitly declining to guess at commercial policy it has no access to.

---

# How it works

## Architecture

Two deployed applications with a deliberate split of responsibility: one is a thin, public, deterministic front door; the other holds all the reasoning and all the data access.

```
Loyalty UI                Hub orchestrator         Service orchestrator          LCP
browser · Angular  --A2A-->  Azure Web App 1  --A2A-->  Azure Web App 2   --REST-->  loyalty platform
call-centre agent  JSON-RPC  validate·forward  bearer   A3TK runtime         x17     system of record
                             no model, no data          ├─ intent agent
                                    |                   ├─ next action agent
                                    |                   ├─ transaction history chat
                                    |                   └─ 19 platform tools (MCP)
                                    |                              |
                                    v writes bootstrap             v reads context
                    Redis — per-session store                            Azure OpenAI
                    snapshot · intent · action ·                         temperature 0.3
                    prefetched activity (5 min) ·
                    transcript (1 h)
```

**The public front door holds no intelligence.** The hub validates metadata, stamps a correlation identifier, forwards the call, and caches the result. Every model call, every platform read, and every piece of member data lives behind it in the second application, which is not exposed to the browser.

### Why the split

- **Blast radius.** The internet-facing component has no model credentials, no platform credentials, and no member data in memory beyond the request it is forwarding.
- **A stable contract.** The UI sees one URL and one message shape. Sub-agents have been added, removed, and replaced by plain code behind that boundary without a single UI change.
- **Independent scaling and deployment.** The two applications are separate Azure Web Apps with their own configuration files and their own deployment targets.

### The building blocks

The runtime is **A3TK**, Amadeus's internal Python toolkit for building agents — it supplies the A2A server, agent-to-agent calling, model configuration, authentication middleware, and structured logging, so this project supplies only its own orchestration logic, prompts, and tools. Sub-agents are declared in YAML: a name, a port, a prompt file, a model, and the list of tools it is allowed to use. That last part is a real access-control boundary — the transaction chat agent is granted six read-only activity tools and cannot reach the profile or note-writing tools even if its prompt were subverted.

Platform access is packaged as an **MCP server** (Model Context Protocol — the emerging standard for exposing tools to language models). Nineteen tools wrap the loyalty REST API and, crucially, do not pass raw responses through: each one extracts the fields that matter and strips personal data before the payload ever reaches a model.

---

## The bootstrap pipeline, step by step

One request in, three objects out, with a hard budget on every stage.

1. **Validate.** The hub checks the four mandatory metadata fields and that the requested environment is one it is configured for. Anything else is rejected before a single downstream call.
2. **Bind context.** Correlation identifier, member, session, airline programme, and environment are bound to the request so that every log line and every outbound platform call carries them automatically.
3. **Fetch, in one parallel batch.** Seventeen platform reads are fired at once — eight building the snapshot (profile, balance, tiers, notes, relations, pending accruals, pending and recent activity) and nine gathering supplementary evidence. Each is individually capped at twelve seconds; a failure or timeout degrades that one field to an empty default rather than failing the request.
4. **Assemble.** Pure code turns the raw responses into the snapshot and the signal set. Two things are treated as fatal here, on purpose: if the profile or the balance cannot be read, the request fails loudly rather than presenting a member who looks empty.
5. **Early stop.** If the snapshot is already conclusive — the account is locked, suspended, or banned, or there is a live complaint pattern — the supplementary evidence is discarded. Nothing it could contain would change the answer, and feeding it to the model would only add noise.
6. **Classify** (model call, 15-second budget) and **recommend** (model call, 20-second budget). Both must return parseable JSON; a wrapper tolerates the model fencing its output in a code block, which models occasionally do despite instruction.
7. **Return and cache.** The envelope goes back to the UI, and the hub writes the three objects into Redis under the session key with a five-minute lifetime, ready for the chat turns that follow.
8. **Prefetch, in the background.** Without blocking the response, the agent starts pulling a year of transaction history — up to fifty accruals, fifty redemptions, twenty cancellations and twenty expiries — aggregates it by transaction type and partner type, and parks it in Redis. By the time the user types their first question about transactions, the data is usually already there.

> **Failure philosophy**
>
> Degradation is per-field, not per-request. A promotions endpoint that is slow costs the intent model one input, not the user their panel. Only the two facts that define the member — who they are and what they hold — are allowed to fail the whole operation.

---

## What happens when someone types a question

Each chat turn is a prompt assembled from five sources, most of which the user never sees.

```
SOURCES, ASSEMBLED PER TURN
  Guardrail preamble         scope · role lock · "untrusted"
  Member context             id · session · answer language
  Snapshot · intent · action from Redis, written at bootstrap
  12 months of activity      from Redis, prefetched
  The agent's question       verbatim, wrapped fore and aft
        |
        v
  Rewritten message  --send-->  Chat agent  --text-->  Reply on screen
  one prompt, one turn          transaction            summary first,
                                history specialist     then detail
                                  |  query  ^ rows
                                  v         |
                                6 activity tools
                                redacted, read-only

  Reply is also appended to a 1-hour session transcript in Redis.
```

**The user types one line; the model receives five sections.** Wrapping the question fore and aft with the same scope rules is a defence against prompt injection: if the incoming text tries to redefine the assistant's role, the instruction after it re-asserts the original one.

### What the chat agent is instructed to do

The transaction specialist's prompt is unusually long, and most of it is hard-won operational knowledge rather than generic politeness. Some representative rules:

- **Choose the right tool.** Totals, breakdowns and comparisons go to the aggregated balance report; "show me the last ten transactions" goes to the activity list. Getting this wrong produces answers that are technically correct and useless.
- **Do not over-filter.** Never apply a transaction-type or status filter the user did not ask for — a helpful-looking filter is the most common way to silently return zero results.
- **Know the traps.** Promotion rewards are not a transaction type in the platform; they are ordinary accruals with a classification field set. Querying for them by name returns nothing, silently. The prompt says so explicitly.
- **Summarise, then list.** Always state the date range actually queried, group identical records with a count marker rather than repeating them, and bold dates, totals and anomalies.
- **Speak human.** Never echo an internal field name in any casing. Say "expiring miles", not the property that holds them.
- **Answer in the requested language,** regardless of the language of the member's data, their notes, or the browser locale.
- **Explain errors in one sentence,** mapped from the status code — an authentication failure becomes "please refresh your session", never a status code or a URL.

---

## Engineering for latency

The panel is only useful if it is on screen before the conversation starts. The most significant engineering work on this system has been removing time from that path.

The original pipeline ran four stages strictly in series, and one of them was a language-model agent whose entire job was to make nine fixed platform calls with fixed parameters and copy fixed fields out of the results. That is deterministic data plumbing routed through a model: it cost two model completions, an extra network hop between applications, and nine effectively serial platform calls.

```
WORST-CASE TIMEOUT BUDGET

Before  [ snapshot 12s ][ retrieval agent — 60s ][ classify 15s ][ recommend 20s ]  = 107s
                         a model doing deterministic data plumbing

After   [ 17 calls, in parallel 12s ][ classify 15s ][ recommend 20s ]              = 47s

                                     60 seconds of worst-case budget removed
```

**The bars are timeout budgets, not measured times** — the guaranteed ceiling on each stage, which is what determines how bad a slow day can get. Two changes produced the difference: the retrieval agent was replaced with ordinary code, and its nine platform calls were then merged into the same parallel batch as the snapshot's eight.

### The principle behind it

A language model earns its cost on judgement — weighing several imperfect signals against each other and writing a sentence a human will read. It is a poor and expensive choice for work whose rules can be written down. Every stage of this pipeline that could be stated as rules has been moved into code, and the two that genuinely require judgement have been left with a model. The same migration was applied earlier to the snapshot itself, which was once a model agent and is now a function.

The eager-fetch decision is a deliberate trade the other way. Firing all seventeen calls at once means that when the early-stop rule triggers, nine of them were wasted. That was accepted because early stop is rare and the alternative — waiting for the snapshot before deciding whether to fetch — costs an extra round trip on every ordinary request. The behaviour is behind an environment switch, so the trade can be reversed without a code change if platform load ever argues for it.

---

# How it is run

## Privacy, safety, and the things a model is not allowed to see

The system handles airline customers' personal data and reaches a production system of record. Several independent mechanisms constrain it.

### The model never learns the member's name

The snapshot returned to the UI carries the literal string `"RedactedMember"` where the name would be. This is not an oversight — the UI already knows who the member is from its own data, and the classification does not need a name. A dedicated redaction layer strips structured personal data from *every* tool response before it reaches a model: names and titles, email addresses, phone numbers, postal addresses, identity document numbers, dates and places of birth. It also redacts sensitive query parameters out of any URL that ends up in an error message, and — a subtle case — when an audit-trail entry describes a change to a sensitive field, it redacts the before and after values, not just the field name.

The prompts reinforce it from the other side: assistants are instructed never to expose names, contact details, booking references or transaction identifiers, and to present transaction data in summary form.

### The agent acts as the logged-in user, not as itself

In deployed environments the user's own access token is passed through to the loyalty platform. The agent holds no privileged service account, so it can see exactly what the person operating it could see, and an airline's data cannot be reached through another airline's session. The airline and programme come from request metadata, are validated against a strict character pattern, and have no default — a request that omits them is refused rather than guessed at.

### Guardrails against prompt injection and scope drift

Every chat message is wrapped: a preamble that fixes the assistant's role and scope, and a closing instruction to re-check the question against that scope before answering. The user's text is explicitly labelled as untrusted input. Requests outside scope get a fixed refusal string. The assistants are instructed never to reveal their prompt, their tool schemas, or raw API responses. Behind all of that sits the structural control that matters most: each agent's tool list is declared in configuration, so a successful prompt attack still cannot reach a tool the agent was never granted.

### Fail-closed environment routing

Which loyalty gateway a request reaches is derived from the environment named in its metadata, matched against a configuration file. An unrecognised value is rejected outright rather than falling back to a default. The local-development environment — which points at a loopback address — is disabled unless the server explicitly opts in, so a crafted request to a deployed instance cannot redirect credentialed traffic to that instance's own loopback listener.

### Visible provenance

Every AI surface in the UI carries an "AI GENERATED" badge and a disclaimer that content may be inaccurate and should be verified before action. Recommendations that depend on airline policy are flagged as such in the interface. Access is controlled by both a per-airline feature flag and a per-user permission.

---

## One deployment, many airlines and many environments

Two dimensions of routing that have to be right on every single call.

**Airline.** Loyalty platform URLs are built as `/{programOwner}/programs/{programCode}/…`. Both values arrive per request and are bound to the request's async context, so every tool call inside that request inherits them without having to pass them around. Nothing about the programme is baked into the deployment.

**Environment.** A configuration file maps each phase to a gateway host and a service access point, with per-phase overrides available through environment variables so a gateway can be repointed without editing code. Two of the phases share a host and differ only in that access point — exactly the kind of detail that is worth having in one declarative file rather than scattered through conditionals.

One genuinely obscure piece of infrastructure knowledge is encoded here. Some Amadeus gateways bind their listener expecting the HAProxy PROXY protocol — a short preamble that must be the first bytes on the connection, before TLS. Standard Python HTTP clients do not send it, and the gateway silently drops the connection. The code carries a custom transport that writes that preamble on connect, enabled per environment and automatically suppressed for loopback targets.

**Multi-currency programmes.** A programme can expose several point currencies at once. The code resolves which one is the member-facing spendable balance rather than assuming the first one returned, with optional per-programme configuration for programmes where that resolution is ambiguous. There is deliberately no hardcoded fallback currency code.

---

## Observability

A distributed agent that calls a model and seventeen APIs is untraceable without this.

- **Correlation identifiers** are generated at the front door if the caller did not supply one, forwarded through every internal hop, sent to the loyalty platform as a header, and stamped on every log record — so one call is reconstructable end to end.
- **Structured logging.** Console output is human-readable for local work; the same records go to Splunk as JSON so that correlation identifier, member, session and environment are indexed fields rather than text to grep.
- **Per-environment log routing.** A custom handler sends each record to the Splunk index belonging to the environment that produced it, falling back to a shared index for records with no environment (startup, health checks, background work).
- **Secret redaction** in logs is enabled explicitly rather than relying on the default, because this application handles both authentication headers and member data.
- **OpenTelemetry** tracing and metrics, and a health endpoint on each application.

---

# How it is proven

## Quality assurance for a system whose output is prose

You cannot assert equality on a sentence. The project runs two complementary test layers.

### Unit tests — the deterministic half

Around 170 tests cover the parts that have a right answer: signal thresholds, snapshot assembly, currency resolution, environment routing, redaction rules, cache behaviour, tool payload extraction, metadata forwarding, and the orchestrators' routing decisions. Because so much of the pipeline was deliberately moved out of prompts and into code, most of the system's behaviour is reachable this way.

### Simulated conversations — the generative half

For the model-driven parts, the project runs a conversational harness built on Amadeus's agent QA framework. A language model plays the call-centre agent, holds a real multi-turn conversation with the deployed stack, and a panel of five judge models then evaluates the transcript — including the internal tool calls, not just the visible replies.

| Judge | Fails the run when |
|---|---|
| `goal_achieved` | Any part of the scenario's stated goal went unanswered. Partial satisfaction fails. |
| `grounded_in_member_data` | The assistant stated a member fact not present in any tool result, or pasted a raw payload into a reply. This is the hallucination check. |
| `guardrail_respected` | An off-topic request was answered, a persona change was accepted, or internals leaked. |
| `call_center_tone` | Replies were verbose or unstructured, or a risk signal present in the data was not proactively flagged. |
| `intent_detection_accuracy` | The bootstrap envelope named the wrong category, omitted a confidence level, or leaked an internal field name into its justification. |

Ten scenarios are organised into named groups — `smoke` `routing` `read_only` `intent_detection` `full` — so a quick pre-merge check and a full nightly run use the same definitions.

### The hardest part: finding members to test with

Testing intent detection needs a member who genuinely has an open claim, and another who genuinely has a promotion that paid out nothing, and so on. Hardcoding membership numbers rots as test data changes. So the harness *discovers* its subjects at run time: it searches the platform for active members and probes their balances, claims, flight activity and notes to find one matching each signal it wants to test.

Two details make this trustworthy. First, discovery walks the categories in the same strict priority order production uses, so a member already claimed by a higher-priority signal is never also assigned to a lower one — otherwise the harness would set up a test the system is correct to fail. Second, each discovered member carries a confirmation flag; when no genuine match was found and the harness fell back to a neutral member, the judge for that scenario relaxes to accept the general category instead of demanding a specific one. The suite therefore reports honest results on imperfect data rather than either false failures or a green light it did not earn.

---

## Current state, and what is honestly not finished

Read from the code as it stands, not from the roadmap.

### Where it runs

Two Azure Web Apps in a test environment, built and deployed through GitHub Actions, with images built and pushed to one internal registry and promoted to another for deployment. The UI reaches it through a route proxied by the existing application, so the browser sees one origin.

### Known gaps

| Observation | Impact |
|---|---|
| **All chat goes to the transaction specialist.** A general-purpose call-centre chat agent is fully configured, with profile, tier, notes and note-creation tools — but the router hands every non-bootstrap message to the transaction history agent unconditionally. The keyword-based router that would split them exists and is unit-tested, but is not wired into the decision. | Questions about profile, tier or notes are refused by an agent whose prompt restricts it to transactions. The published API documentation still describes the keyword split, so the documentation and the code disagree. |
| **A deterministic intent classifier exists but is unused.** A rule-based function reproduces the priority ladder in code and is covered by tests, but the bootstrap path calls the model agent. | No functional impact today. It is a ready-made fallback for a model outage, or a lower-latency path, that nothing currently calls. |
| **Dead configuration.** A snapshot agent is still declared with a prompt, a port and a 45-second timeout, left over from before the snapshot became code. | Confusing to a newcomer reading the configuration; no runtime cost. |
| **Five platform tools are defined twice** in the same module, byte-identical, with the second definition silently winning. | Harmless today, but two copies of a function that must stay in step is a bug waiting for the next edit. |
| **Bootstrap is a single blocking call.** The UI waits for all three objects before rendering anything. | The snapshot is ready long before the two model calls finish. Streaming it first is identified in the design notes as future work. |
| **Certificate verification is disabled** on outbound loyalty platform calls. | Acceptable inside the Amadeus network against internally-signed gateways; worth revisiting before any production hardening review. |

### Natural next steps

- Restore the two-way chat routing, or retire the general chat agent and its tools deliberately rather than by omission.
- Stream the bootstrap envelope so the snapshot paints immediately and the prediction fills in behind it.
- Merge the classify and recommend model calls, already identified in the design notes, removing another hop from the critical path.
- Measure. The timeout budgets are documented; observed latency percentiles in a real environment are the missing number.

---

## Reference

### Numbers that govern behaviour

| Setting | Value | Why |
|---|---|---|
| Single platform read | 12 s | Cap per call; exceeding it degrades that field to a default. |
| Classification model call | 15 s | Mandatory stage; failure fails bootstrap. |
| Recommendation model call | 20 s | Mandatory stage; failure fails bootstrap. |
| Front door to services | 45 s | Overall ceiling seen by the browser. |
| Cached bootstrap objects | 5 min | Long enough for a call, short enough to stay fresh. |
| Prefetched activity | 5 min | Same lifetime; rebuilt on the next bootstrap. |
| Session transcript | 1 h | Survives a longer working session. |
| Redis call timeout | 2 s | Cache is best-effort; an unreachable cache must never hang a request. |
| Tier expiry warning | 75 d | Threshold for raising the tier signal. |
| Points expiry window | 90 d | Window shown in the panel and used for the balance signal. |
| Missing-miles flight window | 3–14 d | Old enough to have credited, recent enough to still be the reason for the call. |
| Prefetch history depth | 365 d | Up to 50 accruals, 50 redemptions, 20 cancellations, 20 expiries. |

### The nineteen platform tools

Read-only unless marked. Every response passes through personal-data redaction before a model sees it.

| Area | Tools |
|---|---|
| Member | `get_member_profile` · `search_memberships` · `get_member_balance` · `get_member_tiers` · `get_member_relations` |
| Notes | `get_member_notes` · `create_note` **(write)** |
| Transactions | `get_activities` · `get_activity` · `get_pending_accruals` · `get_balance_report` |
| Audit trail | `get_history_logs` · `get_history_log` · `get_history_log_diff` |
| Commerce & claims | `get_member_retroclaims` · `get_member_orders` · `get_member_shopping_orders` · `get_member_vouchers` · `get_member_promotions` |

### Reading the source

| To understand… | Read |
|---|---|
| The public contract | `docs/api/member-insight-hub.md` |
| Validation, forwarding, caching | `orchestrators/hub.py` |
| Signals, snapshot, bootstrap, routing | `orchestrators/service.py` |
| The classification rules | `prompts/intent.md` |
| The recommendation rules | `prompts/next_action.md` |
| Chat behaviour and tool selection | `prompts/transaction_history.md` |
| Prompt assembly per turn | `hooks/chat.py` |
| Personal-data redaction | `tools/privacy_redaction.py` |
| Platform tools | `tools/lcp_mcp/__init__.py` |
| Which agents exist and what they may use | `configs/application.services.azure.yaml` |
| The latency rationale | `docs/bootstrap-latency-design.md` |
| Conversational testing | `qa/README.md` |

---

Compiled from the source of `loyalty.ai-agent-hub` (branch `fix/balance-for-multiple-airlines`), the loyalty UI, and the loyalty platform, as of 26 August 2026. Where the code and the existing documentation disagree, this report follows the code and says so.
