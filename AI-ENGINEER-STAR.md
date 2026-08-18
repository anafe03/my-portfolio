# AI Engineer — STAR interview bank

Nine stories. Everything on the TM GO / RAG side is anchored to a commit, a file or a measured
number, because a follow-up question is where paraphrase falls apart. **The PwC stories are
scaffolds with blanks** — I only have your resume bullets for those, and I'd rather hand you a
frame with holes than invent a number you then have to defend.

**Timing discipline.** Situation + Task in ~20 seconds. Action for 60–90. Result in 20. Then stop
and let them ask. The most common failure in an AI-engineering loop is spending three minutes on
Situation and never reaching the decision you actually want them to hear.

**One habit worth adopting across all nine:** end each story with the thing you'd do differently.
It reads as calibration rather than modesty, and it usually earns the follow-up you wanted anyway.

---

## Quick index

| # | Story | Use it for |
|---|---|---|
| 1 | Constraining the agent | 0→1 architecture, "why not an agent framework" |
| 2 | Migrating off the spreadsheet live | Scaling, data modeling, migrations |
| 3 | The green gate over broken data | **Where it broke** — lead with this |
| 4 | Building the eval harness | Evals, quality, CI |
| 5 | Prompt saturation, and the ablation that disproved me | AI vs. deterministic judgment |
| 6 | The 17.3× that bought nothing | Cost, model selection, measurement |
| 7 | The boundary that wasn't there | Security, multi-tenancy, data isolation |
| 8 | Hybrid retrieval with an entitlement filter | **RAG** |
| 9 | PwC — plugins, guardrails, enablement | Scale, stakeholders, teaching |

---

# 1 · Constraining the agent (0→1 architecture)

**S** — I built TM Go, a tour-management platform for independent bands. Advancing a show means
chasing venues over email for load-in times, soundcheck, catering, merch splits and parking, then
keeping every answer in sync across a tour. It's coordination work, it's high-volume, and it's
exactly the shape people reach for an agent to solve.

**T** — Get a working system to production solo, without the failure mode I could already see:
an open ReAct loop that plans its own way through tool calls, works beautifully in a demo, and
becomes impossible to debug the first time it does something strange in front of a user.

**A** — The load-bearing decision was to **give the model the smallest amount of agency the
problem actually requires.** A hand-authored LangGraph StateGraph: a router node classifies
intent once, then dispatches to explicit deterministic pipelines. The model appears at exactly
two seams, both genuine language problems — parsing a venue's free-form reply into typed fields,
and drafting the outbound message. Routing, scheduling, state transitions, validation, retries
and every write are ordinary Python.

The safety property falls out of the graph rather than the prompt: **`send` has exactly one
inbound edge, from human approval.** Draft = LLM · Approve = human · Send = code. No router
decision, no classification and no prompt injection can reach it, because there's no path.

**R** — Two model calls per advance cycle, so cost scales with shows advanced rather than with
chat length or agent wandering. Production reliability from provider failover, tolerant JSON
parsing, validated inputs and human review before anything reaches a band's records.

**What I'd change** — I'd be honest that this costs flexibility. A new capability means writing
a pipeline, not prompting the agent to improvise one; the system can't handle a workflow nobody
designed. For this product that's the right trade — the workflows are known and the downside is
someone's tour — but I wouldn't pretend it's free.

> **If they ask "why not CrewAI / AutoGPT / an agent framework?"** — Because I couldn't answer
> "what will this do when it's wrong?" for an open loop, and the blast radius was a real band's
> schedule. I'd reach for more agency when the path genuinely isn't knowable in advance. Here it
> was.

---

# 2 · Migrating off the spreadsheet while it was running

**S** — Each band's tour lived in a Google Sheet, which was the right call at zero: bands see and
edit their own data with no accounts, no import and no training. But Sheets has API quotas, no
transactions and no concurrency guarantees — two writers collide and the last one silently wins.

**T** — Move to Postgres without a maintenance window. A band on tour can't have downtime, and a
migration that corrupts anyone's data is unrecoverable trust.

**A** — A **strangler fig gated by a measurement**, in five reversible steps. Shadow dual-write
first — every venue write goes to both stores, Sheets stays authoritative, Postgres just watches,
so a broken new path breaks nothing. Then backfill. Then the step that makes it safe: a **parity
endpoint** that reads *both* stores and reports a match percentage plus the exact diffs — rows
only in the sheet, rows only in the DB, and field-level mismatches. Cutover required 100% during
the shadow window. Then reads flip on one environment variable, reversible with no redeploy and
no data movement. Finally Sheets demotes to an export, so bands keep the tool they like and it
stops being what correctness depends on.

The same staging shows up in the queue. Jobs are Postgres rows; the concurrency core is an atomic
conditional update that re-checks status inside the write, so exactly one worker claims a job no
matter how freely the pool polls. Exponential backoff, and dead-letter rows that are inspectable
rather than silently dropped. It runs in-process today behind a worker count and promotes to a
dedicated worker process **by calling the same function from a different entrypoint** — zero code
change.

**R** — Shipped for venues, email state and the contract path. The pattern is proven and the
coverage isn't complete, which I'd say plainly.

**The line to land** — *A migration you can't measure isn't a migration, it's a hope with a
deadline.*

---

# 3 · The green gate over broken data ⭐ *lead with this one*

**S** — Same migration. The cutover was gated on that parity check reading 100%.

**T** — Verify the mapping was right before running the backfill against real tours.

**A** — I found that the column matcher resolved `advancing_status` to the **Booking Status**
column. The cue "status" is a substring of "booking status", which appears first in the standard
column list — so on every standard sheet, the advancing field read the booking column.

The bug isn't the story. This is: **the same reader function fed the backfill, the parity check
*and* the import.** The backfill would have written booking values into the advancing field, and
parity would have compared sheet-to-DB *through the same broken mapping* and reported a clean
100%.

The fix was two rules — cues tried in priority rounds so every field gets its most specific cue
before any field falls back to a loose one, and a column can only be claimed once — with one
matching rule shared by the sheet reader and the CSV parser so the two can't drift. 18 regression
cases, including the boring ones that silently drop shows: Excel BOM, quoted commas, short rows,
CRLF, duplicate names.

**R** — Caught before the backfill ran. No data written.

**The generalization, and this is the part they'll remember:**

> A cutover gate that passes while the data underneath it is wrong is **worse than no gate**,
> because it manufactures confidence. A metric computed through the same assumption as the system
> it measures tells you nothing. Your eval harness has to be able to fail independently of the
> thing it's grading.

**Why it's the best "where it broke" story** — it's a near miss I caught myself, the lesson
transfers directly to evals and monitoring, and it shows you distrust your own green dashboards.

---

# 4 · Building the eval harness

**S** — Reading a venue's email is the one place the system *must* use a model, because free-form
human text has no parser. So "is the model accurate?" was never the useful question. **Which
specific way does it fail, and what catches that one?**

**T** — Make correctness a number that gates deploys, not a vibe.

**A** — Four things, and the last two are the ones most people skip.

- **A golden set that gates the build.** 61 adversarial email-chain cases, CI fails below 80%.
  Multi-show bleed, deal-term soup (*"$500 against 80% of the door, settled by midnight"*),
  mid-thread personnel handoffs, negation traps.
- **Negative controls.** 27 of the 61 carry `forbid` fields that must come back empty, so a
  hallucination costs score exactly like a miss and **abstaining beats guessing.** Without these,
  a confident wrong answer scores the same as a right one.
- **pass^k, not pass@1.** One run per case measures luck. I report the share of cases that passed
  *every* run alongside the mean — models are stochastic even at temperature 0.
- **Paraphrase perturbations**, because a set that only holds under the phrasing I happened to
  write is measuring my prose.
- **A closed loop.** The human review step logs every accept, edit and reject — each correction
  is a labeled failure at zero labeling cost, and live misses get promoted into the golden set.
  It reruns **weekly on a schedule**, because model drift doesn't wait for a commit.

**R** — Regressions block merges. The set grew from real traffic rather than my imagination.

**The two beats that separate you from someone reciting best practices:**

1. **I didn't believe my own 100%.** I looked at a full pass rate and found it implausible. That
   instinct produced the adversarial cases, and every real bug found afterward came from them.
2. **Two harnesses disagreed by 14 points.** The same 42 cases graded 100% offline and 85.7%
   against the live endpoint. The offline one had drifted — it dropped production's want-line and
   two structural guards. **An eval number without its harness version and configuration is not a
   number.** I wrote a parity script that runs both and exits non-zero on any disagreement.

**What I'd change** — generation has 2 judge-scored cases against extraction's 61. That's the
weakest part of the harness and the next thing I'd grow. Say it before they find it.

---

# 5 · Prompt saturation, and the ablation that disproved me

**S** — The extractor was inventing values: a time pulled from a truncated sentence, a fabricated
`"None — not provided"`, another venue's parking lot.

**T** — Stop the fabrication.

**A** — The instinct was more prompt rules. I added rules 11–13 carefully, and **the score went
down.**

```
12 rules → 89%
13 rules → 88%   (and previously-passing cases regressed)
guards moved into code → 98%
```

The prompt was saturated. Attention is finite and each sentence dilutes the others; there's no
amount of prose that makes rule 4 and rule 9 both fire on an ambiguous email. So I drew a line:
if the rule can be checked from the **shape** of the value — `XX:XX` is a placeholder, "either 7
or 8" is unresolved, this value shares no token with the source — it's code. If it needs
**meaning** — is this the opener's soundcheck or ours? — it stays in the prompt.

The framing I use: **a prompt rule is a request to a probabilistic system; a guardrail is a
constraint.** Two properties matter more than hit rate — controls fail *quietly* while validators
log every drop, and controls degrade as you add more while validators don't.

**Then I disproved my own claim.** I'd written that rules 11–13 were now dead weight since the
validator enforced the same invariants. I measured it: **97.5% → 97.1% mean, 97% → 95% pass^k**
without them. Small, real, and mostly stability rather than accuracy.

**R** — 88% → 98%, and I replaced my assertion with the numbers. *"Move it to code and delete the
prompt rule" was one step too far — the prompt got the model closer, the code made it certain.*

> This is your best answer to **"where does AI belong and where is deterministic code better?"**
> You have a measurement, not an opinion, and you have a case of changing your mind on evidence.

---

# 6 · The 17.3× that bought nothing

**S** — Production ran extraction on the expensive tier because extraction touches real tour data
and the big model felt like the safe choice.

**T** — Find out whether that was true instead of assuming it.

**A** — A bench that scores the same golden chains with the **production prompt lifted straight
out of running code**, one model at a time, recording accuracy, cost and latency in one pass.

| | small | mid | large |
|---|---|---|---|
| Accuracy | 98.4% | 98.4% | 98.4% |
| $/1,000 extractions | $1.04 | $2.96 | $5.13 |
| p50 latency | 1.02s | 1.87s | 3.24s |

And on the provider actually paid for: **gpt-4o costs 17.3× gpt-4o-mini, scores the same 100%,
and isn't faster** (0.86s vs 0.97s — inside the noise).

The better half is *which case they all miss*, and it's the same one at every tier: an
out-of-office auto-reply, where every model helpfully pulls the vacation forwarding address out
as the venue contact. It's a negative control; the right answer is nothing.

**R** — 5× the price and 3× the latency bought **zero** accuracy. And the one real failure was
fixed by a dozen lines of code — `_deterministic_reply_kind()` matches the machine signature and
short-circuits before any model call.

**The rule** — spend on the model only where the model is the constraint. Here it wasn't. *The
money that would have gone to the big model buys nothing; an afternoon on a triage function
bought the only point on the table.*

**Volunteer this** — one row of the cross-provider comparison reads *unavailable*, because that
account hit its credit limit mid-run. It renders blank rather than zero **on purpose**: an
earlier version of that harness scored unreachable models as 0.0 and produced a confident,
entirely false finding. **An outage is not a quality result.** Saying this unprompted is worth
more than the finding.

---

# 7 · The boundary that wasn't there

**S** — Every table in the app was keyed by a tour id, and nothing anywhere recorded who owned it.

**T** — Close it before real users, because after the first paying customer every migration is a
migration of somebody's live data.

**A** — The framing first: **authentication answered "who are you," and that was all it answered.**
With enforcement off, anyone could read any tour by passing its id. With enforcement *on*, any
signed-in user still could. And for sheet-backed tours the id *is* the spreadsheet id, which
travels in a URL — it was never a secret.

Three decisions worth more than the schema:

- **Claim-on-first-use.** No backfill, no downtime, no migration window. An unclaimed tour goes
  to the first authenticated caller; a unique index makes the race safe; existing tours acquire
  an owner the moment their owner next opens the app.
- **Wrapped at registration, not a helper each handler calls.** A check you have to *remember*
  will be missed on the next endpoint, and this codebase adds endpoints weekly. So it's applied
  in one place to all 64 routes, and a test walks the real route table and fails the build if one
  slips through. **A boundary you have to remember is a convention; a boundary that fails the
  build when it's missing is an invariant.**
- **A wrapper and deliberately not middleware** — the guard reads the POST body to find the tour
  key, and `request.json()` caches on the Request *instance*. A wrapper passes that instance down
  so the handler's own read hits the cache; `BaseHTTPMiddleware` builds a fresh Request and every
  POST handler would have seen an empty body. There's a test for exactly that.

21 tests including the bypass attempts: key in the body, the full spreadsheet URL, the alias,
anonymous callers.

**R** — Closed before launch, enforced structurally rather than by discipline.

**Pair it with the injection finding** if they push on untrusted input: venue email is untrusted
text read by an LLM whose output writes to a band's records. Three attacks — imperative override
resisted, social engineering resisted, **a venue pasting JSON-shaped data wrote two forged values
to the sheet.** The interesting part is *why the third worked*: the model is trained to resist
imperative override, and it is not trained to distinguish data the venue is *quoting* from data
it is *asserting*. Mitigated by stripping JSON-shaped spans before the model sees them — and I'd
say plainly that this raises an attacker's cost rather than eliminating the class. The real
backstop stays structural: extraction only ever proposes; a human approves.

---

# 8 · RAG — hybrid retrieval with an entitlement filter ⭐ *your RAG story*

> **Superseded.** TM Go now has retrieval — pgvector over uploaded documents — and it is the
> better RAG story of the two: you argued against vectors, the cost numbers flipped it (20x per
> question, widening with every upload), and you then audited your own new code and found three
> bugs in it. Keep the triage app below for the **permissions** question, where the entitlement
> filter on the fused ranking is the differentiated answer.

**S** — A member-services triage assistant over health-plan documents. Members ask things like
*"is an MRI covered"* or *"what's my deductible"*, and the answer differs by plan.

**T** — Answer from the plan documents, with citations, without ever showing one member another
member's plan terms or any PHI.

**A** — Three decisions.

**Hybrid retrieval, fused.** BM25 for keyword plus embeddings for semantics, combined with
**reciprocal-rank fusion**. Keyword catches exact codes and plan IDs that embeddings blur;
semantics catches paraphrases keyword misses — *"can I see a specialist without a referral"*
never lexically matches a document about prior authorization. Retrieval degrades to BM25-only
when there's no embeddings key, so the thing still runs rather than going dark.

**Authorization applied at retrieval, before generation.** Every document carries a plan tag. A
guest can reach only the general/company documents; a verified member additionally reaches *their*
plan's documents. The filter runs on the fused ranking, so a guest is never quoted another plan's
numbers — and it isn't a prompt instruction the model could talk itself out of.

**PHI is not in the index at all.** Claims, balances and member records never enter the shared
corpus; they come from tools behind the verification gate. The index holds non-PHI plan documents
only. That's the distinction I'd want to be asked about: *filter what's retrievable, and keep the
sensitive class out of the retrievable set entirely.*

Top-k=3 passages rather than whole documents — a token-cost call, arguably over-engineering at
this corpus size, and the right shape at scale.

**R** — Grounded, cited answers with a hard tenancy boundary that lives in retrieval rather than
in a prompt.

**Say the scale before they ask** — 16 documents and 15 golden cases. That's demonstration scale,
and I'd name it rather than let them discover it.

**What I'd build next, and this is the honest gap** — grounding is currently scored as a single
boolean per case: did retrieval surface the expected citation. That's a smoke test, not retrieval
evaluation. It can't distinguish *retrieval failed* from *retrieval worked and generation ignored
it*, which is the first question anyone asks when a RAG answer is wrong. I'd split it into
context precision and context recall for retrieval, and faithfulness plus citation-correctness
for generation — RAGAS gives you those off the shelf and the corpus needs to grow first for the
numbers to mean anything.

**Have ready — how you'd debug "the answer is wrong":**

```
query → query understanding → retrieval → entitlement filter →
rerank → context assembly → generation → citation validation
```

Name a failure mode at each layer, and say that you'd measure retrieval and generation separately
before touching either — because a chunking change and a prompt change get credited to the same
end-to-end number otherwise.

---

# 9 · PwC — the three stories, with blanks to fill

I only have your resume bullets here, so these are frames, not finished answers. **Fill the
bracketed parts before you use them.** Rough numbers are fine; invented precision is not.

## 9a · Shipping AI plugins end-to-end

**S** — PwC Innovation Hub, Senior Associate/AI Engineer. Shipped 5+ production AI plugins —
an RFP generation tool, an internal knowledge-base connector, and EDGAR search — owning each
from architecture through deployment and monitoring.

**T** — `[For ONE of them: what was the manual baseline? Who did it, how long did it take,
and what went wrong when it went wrong?]`

**A** — Pick **one** and go deep rather than listing three.

- The knowledge-base connector and EDGAR search are your **real-world RAG** experience — more
  persuasive than the triage app because the corpus was real and enterprise-scale. Be ready with:
  `[corpus size]`, `[how you chunked and why]`, `[how documents were permissioned — this is the
  question they'll ask]`, `[what retrieval failure looked like in practice]`.
- The RFP generator is your **grounded-generation** story: `[how did you stop it citing things
  that weren't in the source material?]`
- Then the architecture-through-monitoring arc, which is the part most candidates can't claim:
  `[what did you actually monitor, and what did an alert look like?]`

**R** — `[adoption, time saved, or usage — whatever you can actually defend]`

**What I'd change** — `[one thing]`

> **Numbers you should nail down tonight:** how many users, what the before/after was on one
> workflow, and one specific failure you found in production and fixed. That trio carries the
> whole story.

## 9b · Guardrails on generated infrastructure code ⭐ *the one they'll dig into*

Your resume has *"researched and prototyped AI-driven code generation"* (GPT-2 era, program
synthesis) and *"built and maintained scalable cloud infrastructure on Azure for external banking
clients — high availability, security compliance, reliable uptime."* Terraform sits between those
two and isn't written down. **Fill in what you actually did** — but here's the frame, because the
structure is the answer and it's the same three-tier model as Story 5.

**S** — Generated infrastructure code is a different risk class from generated application code.
A hallucinated function throws at runtime and you see it. A hallucinated **security group, IAM
policy or public storage container** applies cleanly, looks correct in the diff, and is a finding
in someone's audit — for banking clients, a regulated one.

**T** — `[Let engineers generate infra code / accelerate provisioning — say what the actual goal
and audience was]` without letting a plausible-looking plan reach an apply.

**A** — The three tiers, weakest to strongest, and the point is that **the model only occupies
the weakest one**:

1. **Prompt-level** — module conventions, required tags, approved provider versions. Cheapest,
   and it degrades exactly as you add rules — the ceiling I measured later on TM Go.
2. **Deterministic validators in CI** — `terraform validate` and `fmt` for syntax, `tflint` for
   provider correctness, `tfsec`/`checkov` for security posture, and **policy-as-code (OPA/
   Sentinel)** for the rules that are non-negotiable: no `0.0.0.0/0` ingress, no public buckets,
   encryption at rest required, mandatory tagging for cost allocation. These fail loudly and log
   every drop, where a prompt rule fails silently.
3. **Structural** — `terraform plan` is a mandatory artifact, the plan is reviewed as a diff by a
   human, credentials are scoped so the pipeline *cannot* apply outside its blast radius, and
   apply is gated on approval. **The model drafts, a human approves, code applies.**

`[Which of these did you actually build? Which existed already? What did you find that the
existing gates missed?]`

**R** — `[What shipped, what it caught, and what the before/after was]`

**The line that makes it a senior answer:**

> Generated code isn't trusted code. The interesting engineering isn't the generation — it's
> making the checks around it strong enough that a wrong answer is cheap. And you have to verify
> the guardrail actually fires: I've had a lint gate that was there to catch undefined references
> miss a missing import and white-screen an app, because the rule didn't see JSX element names.
> The fix wasn't adding the rule — it was deleting the import again to prove the gate now caught
> it.

That last bit is a real TM Go story and it transfers perfectly. Use it here.

## 9c · Enablement — the AI Factory

**S** — You spearheaded an upskilling program: engineering best practices, technical workshops,
mentoring the data science team on production-quality software.

**T** — `[What was breaking? Notebooks that couldn't ship? No tests? Models with no monitoring?]`

**A** — Emphasize **behavior change, not sessions delivered**:

> The challenge was never explaining what an LLM is. It was getting people to recognize which
> parts of their workflow are actually appropriate for one, giving them repeatable patterns, and
> setting expectations about verification and failure modes.

`[One concrete workflow you changed, and one thing you taught that stuck]`

**R** — `[How many people, and what they could do afterward that they couldn't before]`

**The transferable judgment** — you also have the opposite instinct on record: on TM Go, the
product decision that came from watching non-technical users was **removing AI surface.** The
upload flow went from a five-way override to leading with a recommendation, because too many
options was the actual problem. Enablement isn't always "more AI."

---

## Questions worth asking them

- What does the platform team own that product teams don't rebuild — and what's still getting
  rebuilt?
- How do you know today that a change to a prompt or a retrieval config didn't break something?
  Is there a gate, or a rollback?
- Where's the line between what a model decides and what code decides in your system now?
- What would you want measurably different six months after this hire?

## Before the loop

- [ ] Fill every bracket in §9. Rough is fine, invented is not.
- [ ] Pull live numbers off the observability dashboard the morning of — quote what it says then.
- [ ] TM Go HAS retrieval now (pgvector). Lead RAG with it, not the triage app.
- [ ] Practice §3 and §5 out loud. They're the two that win the room, and both are under 2 minutes.
