# Campminder — Senior AI Platform Engineer

Two parts: what to fix in the TM GO case study before you send the link, then the
interview material. Everything below is anchored to a file, a commit or a measured
number, because paraphrasing your own work is how you get caught out in a follow-up.

---

# Part 1 — Case-study review

`my-portfolio/src/pages/tmgo.astro`, read against `toursync-deploy` as of `e15e022`.

The page is strong. Four things are wrong or stale, ordered by how much damage they do.

### 1. The multi-tenancy claim is false as written — fix first

Line 1009:

> **Multi-tenant isolation** — Row-level security is enabled on all five Postgres tables.

RLS is enabled, and that sentence is still misleading, for the reason your own commit
`4cc0532` spells out: the API holds the **service-role key, which bypasses RLS**. RLS-on
with no policies means a *browser* key reads nothing — real, and worth saying — but it is
not what stops user A from reading user B's tour. The thing that does that is `guard_tour`,
shipped today in `bd07c9f`, and the page doesn't mention it.

This is the exact failure mode the rest of the writeup is careful about: a control that
reads as assurance and isn't the one doing the work. Someone at Campminder reads that line,
asks "so what stops one camp reading another camp's data?", and the answer doesn't match
the page.

### 2. There's no tenancy section, and it's your best material for this role

`bd07c9f` is the most Campminder-relevant thing in the repo and it isn't on the page.
It deserves **Decision 08 — the access boundary**, with the three points that make it a
design story rather than a bugfix: claim-on-first-use instead of a backfill; applied by
wrapping 64 routes at registration rather than a helper you have to remember; and
`test_every_registered_route_is_wrapped` walking the real route table so it's an invariant
and not a convention.

### 3. You undersell the eval harness

Depth · 05 says:

> The fix is multi-trial pass^k with paraphrase perturbations, **which I've built on another
> system but not here yet.**

Not true anymore. `scripts/reply_prompt_eval.py` and `scripts/prompt_lab.py` both report
pass^k, `docs/perturbations.json` holds three paraphrases per venue, and
`docs/extraction-tradeoffs.md:72` reports the ablation in exactly those terms
(97.5% → 97.1% mean, 97% → 95% pass^k). The page is a version behind itself.

### 4. Two stale facts in the stack row

Line 410 calls Google Sheets "each band's system of record." Since `4eee333` onboarding no
longer offers sheet linking at all, and `e15e022` moved the contract/triage write path to
Postgres. Sheets survives only for tours already built on one. Small, but it's the first
row a technical reader hits.

**Not broken, worth knowing:** Depth · 03 quotes Anthropic-tier prices and the OpenAI
17.3× finding in two places with different case counts (32 chains vs 42). Reconcile the
number before someone asks which set you actually ran.

---

# Part 2 — Interview material

## The frame

> I built an agentic tour-management app, but the part worth talking about is that most of
> my time went into the harness around the model, not the model. Where the guardrails are
> structural instead of instructional, how I knew when it was working, and the times my own
> evaluation told me it was fine when it wasn't.

That reframes a solo project as platform work, which is the job.

## Coverage against their bullets

| Their requirement | What you point at |
|---|---|
| RAG, prompt engineering, context engineering, LLM evals | 42-chain golden set, 10 negative controls, CI gate at 80%, weekly scheduled rerun |
| Production AI observability — prompt/IO logging, token spend, regression evals | `traced_llm` — one seam, per-endpoint cost attribution, failover flag |
| Judgment about where AI belongs vs deterministic code | The 89 → 88 → 98 saturation finding. Measured, not an opinion |
| Extending agentic coding tools / harness engineering | The three harness failures below (lint blind spot, hanging pytest, stale deploy) |
| Tools used by teams of varying skill | PwC enablement — lead here, TM GO is solo |
| Executive communication | The "CEO wants AI for X and I disagree" answer below |

---

## Story 1 — the boundary that wasn't there

**Lead with this.** It's specific, it's about *their* data class, and it failed before it worked.

> Every table in the app was keyed by a tour id, and nothing anywhere recorded who owned it.
> With auth off, anyone could read any tour by passing its id. With auth *on*, any signed-in
> user still could — authentication only answers "who are you," not "is this yours." And for
> sheet-backed tours that id travels inside a spreadsheet URL, so it was never secret to
> begin with.

Three design points, in this order:

**Claim-on-first-use.** No backfill script, no downtime, no migration window. A tour with no
owner row is unclaimed; the first authenticated caller to touch it becomes the owner, and a
unique index on `tour_key` makes the race safe. Existing tours keep working and acquire an
owner the moment their owner next opens the app. Same strangler shape as the store cutover.

**Applied by wrapping routes, not by calling a helper.** All 64 routes are wrapped at
registration. A check you have to remember to call inside a handler will be missed on the
next endpoint added, and this codebase adds endpoints weekly. So
`test_every_registered_route_is_wrapped` walks the real `Route(...)` list and fails if one
slips through. **That's the difference between a convention and an invariant** — and it's the
line that lands hardest for a platform role.

**A wrapper and deliberately not middleware.** The guard reads the POST body to find the tour
key, and `request.json()` caches on the Request *instance*. A wrapper hands the same instance
to the handler so the handler's own read hits the cache; `BaseHTTPMiddleware` builds a fresh
Request downstream and the cache is lost with it — every POST handler would have seen an
empty body. There's a test for exactly that.

21 tests, including the bypass attempts: key in the body, the full sheet URL, the `tour_key`
alias, anonymous callers.

*If they push on why not RLS:* the API holds the service-role key, which bypasses RLS by
design. RLS-with-no-policies is the second gate that stops a browser key reading anything
directly. Two gates, easy to confuse, opposite failure signatures — RLS denial returns zero
rows, a missing GRANT returns 42501. I burned a session debugging the key when the actual
cause was a missing table grant, so health-check now branches on the key's own role claim
and names the gate that's actually shut.

---

## Story 2 — the gate that read green while the data underneath it was wrong

This is your best evaluation story, and it's about a near miss you caught, not a hypothetical.

> We were migrating venue data from Sheets to Postgres, gated on a parity check that had to
> read 100% before cutover. The column matcher resolved `advancing_status` to the **Booking
> Status** column — the cue "status" is a substring of "booking status," which appears first
> in the standard column list. So on every standard sheet, the advancing field read the
> booking column.

The bug isn't the point. This is:

> `_read_sheet_venue_records` feeds the backfill, the parity check **and** the import. The
> backfill would have written booking values into the advancing field, and parity would have
> compared sheet-to-DB through the same broken mapping and reported a green 100%. A cutover
> gate that passes while the data underneath it is wrong is worse than no gate, because it
> manufactures confidence.

The generalization, and it goes straight at evals:

> A metric computed through the same assumption as the system it measures tells you nothing.
> Your eval harness has to be able to fail independently of the thing it's grading.

The fix, if asked: cues are tried in priority *rounds* so every field gets its most specific
cue before any field falls back to a loose one, and a column can only be claimed once. One
matching rule shared by the sheet reader and the CSV parser, so the two can't drift.
`test_csv_import.py`, 18 cases — the mapping regression plus the boring ones that silently
drop shows (Excel BOM, quoted commas, short rows, CRLF, duplicate names).

---

## Story 3 — prompt controls vs. guardrails, with an ablation that disproved you

Their bullet is "excellent product judgment about where AI belongs and where deterministic
code is the better answer." You have a measurement, not a philosophy.

```
12 rules → 89%
13 rules → 88%     (and previously-passing cases regressed)
guards moved into code → 98%
```

> Adding the thirteenth rule made it worse. The prompt was saturated — attention is finite,
> and each sentence dilutes the others. There's no amount of prose that makes rule 4 and rule
> 9 both fire reliably on an ambiguous email.

The framing:

> A prompt rule is a **request** to a probabilistic system. A guardrail is a **constraint** —
> the bad outcome is unavailable. Two properties matter more than hit rate: controls fail
> *quietly* while validators log every drop, and controls degrade as you add more while
> validators don't.

Three tiers, weakest to strongest: **prompt rules → code validators → structural gates.**

The dividing line you settled on: if it can be checked from the *shape* of the value
(`XX:XX` is a placeholder, "either 7 or 8" is unresolved, this value shares no token with the
source) it's code. If it needs *meaning* (is this the opener's soundcheck or ours?) it's the
prompt.

**And then you disproved your own claim.** You'd written that rules 11–13 were now doing
nothing since the validator enforces the same invariants. Measured it: 97.5% → 97.1% mean,
97% → 95% pass^k without them. Small but real, and mostly stability rather than accuracy.

> "Move it to code and delete the prompt rule" was one step too far. The prompt got the model
> closer; the code made it certain. I replaced the assertion with the numbers.

That last beat is the one that separates you from a candidate reciting best practices.

**The structural tier**, for a company holding camp health and financial records:

> `send` has exactly one inbound edge, from human approval. Draft = LLM · Approve = human ·
> Send = code. No router decision, no classification, no prompt injection can reach send. It
> isn't that the model is instructed not to — there's no path.

---

## Story 4 — the spend that bought nothing, and the case money can't fix

Same 42 golden chains, same production prompt lifted out of running code, same scorer:

| | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
|---|---|---|---|
| Accuracy | 98.4% | 98.4% | 98.4% |
| $/1,000 extractions | $1.04 | $2.96 | $5.13 |
| p50 latency | 1.02s | 1.87s | 3.24s |

And on the provider actually paid for: **gpt-4o costs 17.3× gpt-4o-mini, scores the same
100%, and isn't faster** (0.86s vs 0.97s, inside the noise).

The more interesting half is *which case they all miss* — and it's the same one at every
tier. An out-of-office auto-reply, where every model helpfully pulls the vacation forwarding
address out as the venue contact. It's a negative control; the correct answer is nothing.

> Every tier fails it identically, because being helpful with a stray address is what these
> models are trained to do. Opus fails it at 5× the cost. In production that email never
> reaches a model at all — `_deterministic_reply_kind()` matches the machine signature and
> short-circuits first. A dozen lines of code bought the only point on the table.

**The buying rule:** spend on the model only where the model is the constraint. Here it
isn't — accuracy is flat across a 5× price range.

*Honest caveat to volunteer:* the cross-provider graphic has an unavailable row, because the
Anthropic account hit its credit limit mid-run. It renders blank rather than zero, and that's
deliberate — an earlier version of that harness scored unreachable models as 0.0 and produced
a confident, entirely false finding. **An outage is not a quality result.** Volunteering this
is worth more than the finding itself.

---

## Story 5 — observability, which is a bullet they wrote verbatim

> "production AI observability, including prompt/input/output logging, token spend tracking,
> and regression evaluations"

`traced_llm` is the single point every model call passes through. Per call it records
endpoint, model, latency, tokens, estimated cost, and whether failover fired. Per-endpoint
cost attribution is the part most people don't build — it's what lets you answer "which
feature is expensive," not just "the bill went up."

Levers, in the order you'd pull them, each verified against that meter:

- **Metering first** — everything below is a measured number, not an assumption
- **Model tiering (shipped)** — then measured, and the assumption didn't survive (Story 4)
- **Deterministic-call caching (shipped)** — temperature-0 routing, parsing and extraction only. Drafting runs warm and is never cached. Caching pure functions of input can't add a failure mode
- **Context budget (next)** — recency window plus hard caps; the quiet leak in every chat product
- **Per-tenant daily budgets (shipped)** — enforced before the call, recorded after. A blown budget deliberately does *not* trigger failover, because both providers cost tokens. The answer is "not today," not "try the other model"

> **Pull the live numbers off the dashboard the morning of the interview.** Quote what it
> says then, not a figure from a screenshot two weeks old.

**The privacy follow-up — "what would you deliberately NOT log?"** Venue email is
third-party personal data that the band never consented on behalf of. Structurally identical
to camp family communications. You log the trace envelope — token counts, latency, model,
endpoint, cost, pass/fail — and you don't log message bodies by default; the golden set is
curated, consented and synthetic, which is what makes it safe to keep forever and rerun
weekly.

---

## Story 6 — enablement (PwC leads; TM GO is thin, say so)

This is your weakest TM GO angle because it's a solo project. Lead with PwC, and emphasize
behavior change over presentations:

> The challenge was never explaining what an LLM is. It was getting people to recognize which
> parts of their workflow are actually appropriate for it, giving them repeatable patterns,
> and setting expectations about verification and failure modes.

The one TM GO thread that *does* count: your users are tour managers, thoroughly
non-technical, and the product decision that came out of that was **removing AI surface**.
The upload flow went from a five-way override to leading with a recommendation, because too
many options was the actual problem (`836db93`).

---

## Harness engineering — their agentic-coding bullet, which you have more of than you think

The failure mode is never the agent writing bad code. It's the checks around it being weaker
than they look. Three from building TM GO with agentic tools:

1. **A lint gate with a blind spot.** ESLint was there to catch undefined references, and it
   missed a missing JSX import — `no-undef` doesn't see JSX element names. White-screened the
   app. The fix wasn't just adding the rule; it was **deleting the import again to prove the
   gate now fires**. Verify your guardrail actually catches the thing.
2. **`pytest` hung instead of failing.** A live-network script sat in the test directory
   sleep-polling for a human reply. A test command that hangs is worse than one that fails,
   because silence reads as "still running" and nobody ever learns the suite's state.
3. **Deploys silently ran commits behind**, so I was debugging features against builds that
   didn't contain the fix. Answer: `/api/version` plus `is_it_live.sh` — "did my push ship?"
   answered in one command.

---

## The system-design question they will probably ask

> "How would you let a Campminder customer customize the product with an AI coding agent
> without letting them break things?"

Don't start with the model. Start with the blast radius.

```
customer / developer
   → coding agent (company instructions + skills)
   → MCP / tool layer  ─── constrained APIs, never raw DB
   → sandbox           ─── scoped credentials, tenant-pinned
   → tests + lint + security checks
   → preview environment
   → diff review → human approval
   → CI/CD → deploy (versioned, rollback-able)
   → audit log
```

The points to make, in your own vocabulary:

- **Constrained APIs, not raw DB access.** Same reason `send` has one inbound edge — you
  remove the path rather than instruct against it.
- **Credentials are scoped and tenant-pinned at the boundary, not passed to the agent.** The
  agent never holds a key that can reach another camp's data, so a prompt injection has
  nothing to spend.
- **The boundary is applied structurally.** Wrap at registration, and a test that walks the
  real surface and fails when something is added unwrapped. Exactly the 64-route invariant.
- **Every generated change is a diff a human approves.** Draft = agent · Approve = human ·
  Deploy = code.
- **Preview environments over trust.** Reversibility beats prediction.
- **Audit log, because the question after an incident is always "what did it actually do."**
  That's the `traced_llm` argument at a different altitude.

## The eval-design question

> "We're building an assistant that answers questions about a camp's data. How would you
> evaluate it?"

Don't answer with a library name. Answer in four layers, then close with the loop.

- **Retrieval** — recall@k, precision@k, and whether the *right* passage was in the window
- **Generation** — groundedness, correctness, completeness, citation correctness
- **System** — latency, token cost, tool-call success, error rate, task completion
- **Business** — self-service rate, escalation rate, correction rate, adoption

Then the parts most candidates skip:

- **Negative controls.** Cases where the correct answer is *nothing*. Ten of my 42 carry
  forbid-fields, so a hallucination costs score exactly like a miss and abstaining beats
  guessing. Without these, a confident wrong answer scores the same as a right one.
- **pass^k, not pass@1.** One run per case measures luck. Report how many cases passed
  *every* run — the model is stochastic even at temperature 0.
- **Paraphrase perturbations.** Three rewordings per case, because a set that only holds
  under the phrasing you happened to write is measuring your prose.
- **A held-out split.** My own optimizer tunes against the same set that grades it, which is
  the standard trap. Say this before they find it.
- **Alert on delta, not threshold.** A set sliding 100% → 94% → 88% never trips an 80% gate,
  and that gradual shape is exactly what drift looks like.
- **The loop closes.** Every human correction in the review step is a labeled failure at zero
  labeling cost. Live misses get promoted into the golden set, so the harness grows from real
  traffic rather than my imagination. And it reruns **weekly on a schedule**, because model
  drift doesn't wait for a commit.

**And the trap answer:** I once looked at a 100% pass rate and didn't believe it. That
instinct is the whole story — it's what produced the adversarial cases, and every real bug
found afterward came from them. Related: two of my harnesses disagreed by 14 points. About 7
was a harness bug, about 5 was framing (one ran with structural guards on, one off). **An
eval number without its harness version and configuration is not a number.**

---

## The executive question

> "The CEO wants to use AI for X. You think it's a bad use case. What do you do?"

> I wouldn't frame it as AI versus no AI. I'd clarify the underlying goal and the current
> baseline, then separate the part that genuinely needs judgment on unstructured input from
> the part that's deterministic. Then prototype the smallest thing that tests the assumption.
> If deterministic software gets the outcome more reliably and more cheaply, that's what I'd
> recommend — and I'd bring the measurement rather than the argument.

Back it with Story 4 (the 17.3× that bought nothing) and Story 3 (the 13th rule that made it
worse). You've twice argued *against* the more-AI answer with data. That's the credibility.

---

## People & Culture round — don't over-prepare the technical

**Why Campminder:** AI isn't a bolt-on feature there — it's shared capability, internal and
in the product, and the role pairs building the system with working directly with the people
using it. That's the part of my previous work I've enjoyed most.

**What are you looking for:** owning problems end-to-end rather than one slice of an AI
project. Build it, work with the users, measure whether it's actually useful, iterate.

**Why summer camps:** don't perform passion. "The domain's interesting because it isn't
technology for its own sake. Camps carry real operational load — registration, staffing,
health, transport, communications, finance — and software that removes administrative work
gives that time back to the actual camp."

---

## Cram order, if there are only a few hours

1. Story 1 — the access boundary (specific, theirs, failed first)
2. Story 3 — controls vs. guardrails, including the ablation that disproved you
3. Story 2 — the green gate over broken data
4. Eval-design answer, out loud, four layers plus the loop
5. The coding-agent harness system design, sketched on paper
6. Story 4 — the 17.3×
7. PwC enablement, one concrete workflow
8. 90-second "tell me about yourself"
9. Five questions for them

**Five questions worth asking:**
- What does the AI platform team own today that product teams *don't* rebuild — and what's
  still being rebuilt?
- How do you currently know a change to the RAG system didn't break something? Is there a
  gate, or a rollback?
- Where's the line between what a customer can customize and what they can't?
- Which team has adopted AI tooling fastest, and what did they have that the others didn't?
- What would you want measurably different six months after this hire?
