# Campminder — Senior AI Platform Engineer

Your notes, corrected against the repos and quantified. This supersedes `AI-ENGINEER-STAR.md`
— everything from it that survived is folded in here.

Four things were wrong or risky and are fixed below: the "Claude runs it on every push" phrasing,
"don't overprompt" stated as a vibe rather than a measurement, the model comparison with no
number attached, and tenancy missing entirely from TM GO despite being the most Campminder-
relevant thing you've built.

---

## Numbers you can quote

Learn these five. They're the difference between sounding like someone who ran evals and someone
who reads them.

| | |
|---|---|
| **Golden set** | 61 adversarial email chains, **27 negative controls**, CI gate at 80%, rerun **weekly on a schedule** |
| **Prompt saturation** | 12 rules → 89% · 13 rules → **88%** · guards moved into code → **98%** |
| **The ablation that disproved me** | removing rules 11–13: 97.5% → 97.1% mean, **97% → 95% pass^k** |
| **Harness disagreement** | same 42 cases: **100% offline vs 85.7% live** — the offline one had drifted |
| **Model spend** | gpt-4o costs **17.3×** gpt-4o-mini and scores the **same 100%** |

Secondary, if the conversation goes there: three Claude tiers all scored **98.4%** across a 5×
price range ($1.04 / $2.96 / $5.13 per 1,000 extractions, p50 1.02s / 1.87s / 3.24s). The access
boundary is **64 routes, 21 tests**. Retrieval in the triage app is **BM25 + embeddings fused
with reciprocal-rank fusion, k=3**.

---

## Elevator pitch — 90 seconds

> I graduated from IU about five years ago. I came in as a business student with some programming
> background, realised quickly I wanted to be much more technical, moved into computer science and
> stayed for my master's.
>
> Then about three and a half years at PwC. I started in emerging technology — traditional ML,
> optimisation, simulation, AI research — and as generative AI took off I moved into our AI
> Factory. There I rotated across business units building AI systems for financial research,
> RFPs, document workflows, accounting, capital markets and forensics, and worked with cloud
> partners on generating compliant infrastructure.
>
> More recently I've been building products myself. TM Go is a tour-management platform for
> independent bands — it advances shows over email, and the engineering interest is that the
> agent is deliberately constrained: the model drafts and parses, code does everything else.
>
> I'm looking for a role that combines those — hands-on AI engineering, working directly with
> users and leadership, and building capability other teams reuse.

**Say "deliberately constrained," not "agentic."** Your best architecture story is that you
*didn't* build an open-ended agent; leading with "agentic" sets up a contradiction you then have
to walk back.

---

# STAR stories

## 1 · TM GO — agent architecture

**S** — TM Go is a tour-management platform for independent bands. Advancing a show means
chasing venues over email for load-in, soundcheck, catering, parking, merch splits and contacts,
then keeping every answer in sync across a tour.

**T** — Automate that coordination without an open-ended agent that could wander, make
unpredictable tool calls, or write wrong information into a band's records.

**A** — A hand-authored **LangGraph StateGraph** rather than a ReAct loop. A router classifies
intent once, then dispatches to explicit deterministic pipelines. The model appears at exactly
two seams, both genuine language problems: **parsing** a free-form venue reply into typed fields,
and **drafting** the outbound message. Routing, state, validation, retries, scheduling and every
write are ordinary Python.

The safety property comes from the graph, not the prompt: **`send` has exactly one inbound edge,
from human approval.** Draft = LLM · Approve = human · Send = code. No router decision, no
classification and no prompt injection can reach it, because there's no path.

**R** — Predictable behaviour, debuggable failures, two model calls per advance cycle so cost
scales with shows advanced rather than agent wandering, and a small blast radius when the model
is wrong.

**Tradeoff, stated first** — less flexible. A new capability means writing a pipeline, not
prompting the agent to improvise one. The system can't handle a workflow nobody designed. For
this product that's right; I'd reach for more agency when the path genuinely isn't knowable in
advance.

## 2 · TM GO — evals and reliability

**S** — Reading a venue's email is the one place the system *must* use a model, because
free-form human text has no parser. So the useful question was never "is it accurate" but **which
specific way does it fail, and what catches that one.**

**T** — Make correctness a number that gates deploys.

**A** —
- **61-case golden set** of adversarial chains: multi-show bleed, deal-term soup (*"$500 against
  80% of the door, settled by midnight"*), mid-thread personnel handoffs, negation traps.
- **27 negative controls** — cases with `forbid` fields that must come back empty, so a
  hallucination costs score exactly like a miss and **abstaining beats guessing.**
- **pass^k, not pass@1** — one run per case measures luck; I report the share that passed *every*
  run, because models are stochastic even at temperature 0.
- **A closed loop** — the human review step logs every accept, edit and reject. Each correction
  is a labelled failure at zero labelling cost, and live misses get promoted into the golden set.
- **CI and schedule** — GitHub Actions runs the gate on every push and **blocks the merge below
  80%**; it also reruns weekly, because model drift doesn't wait for a commit.

**R** — Regressions can't merge, and the eval set grows from real traffic rather than my
imagination.

**The finding worth leading with.** The extractor was inventing values, so I wrote more prompt
rules — and the score went *down*: 12 rules 89%, 13 rules 88%, with previously-passing cases
regressing. The prompt was **saturated**; attention is finite and each sentence dilutes the
others. Moving the mechanical invariants into code took it to **98%**. The line I drew: if it can
be checked from the *shape* of a value it's code; if it needs *meaning* it stays in the prompt.

**Then I disproved my own follow-up claim.** I'd written that the three moved rules were now dead
weight. Measured it: **97.5% → 97.1% mean, 97% → 95% pass^k** without them. Small, real, and
mostly stability. *"Move it to code and delete the prompt rule" was one step too far — the prompt
got the model closer, the code made it certain.*

**Improve** — generation has 2 judge-scored cases against extraction's 61. Weakest part of the
harness and the next thing I'd grow. Say it before they find it.

## 3 · TM GO — the access boundary ⭐ *new, and the most Campminder-relevant thing you have*

**S** — Every table was keyed by a tour id and **nothing recorded who owned it.**

**T** — Close it before real users, because after the first paying customer every migration is a
migration of somebody's live data.

**A** — The framing first: **authentication answered "who are you," and that was all it
answered.** With enforcement off, anyone could read any tour by passing its id. With enforcement
*on*, any signed-in user still could — and for sheet-backed tours the id travels in a URL, so it
was never secret.

Three decisions worth more than the schema:
- **Claim-on-first-use** — no backfill, no downtime. An unclaimed tour goes to the first
  authenticated caller; a unique index makes the race safe; existing tours acquire an owner the
  moment their owner next opens the app.
- **Wrapped at registration, not a helper each handler calls.** A check you have to *remember*
  will be missed on the next endpoint, and this codebase adds endpoints weekly — so it's applied
  in one place to all **64 routes**, and a test walks the real route table and fails the build if
  one slips through.
- **A wrapper and deliberately not middleware** — the guard reads the POST body to find the tour
  key, and `request.json()` caches on the Request *instance*. A wrapper passes that instance
  down; `BaseHTTPMiddleware` builds a fresh one and every POST handler would have seen an empty
  body. There's a test for exactly that.

**R** — 21 tests including the bypass attempts: key in the body, the full spreadsheet URL, the
alias, anonymous callers.

**The line** — *a boundary you have to remember is a convention; a boundary that fails the build
when it's missing is an invariant.* That distinction is the job they're hiring for.

**Pair it with the injection finding** if untrusted input comes up: venue email is untrusted text
read by an LLM whose output writes to a band's records. Three attacks — imperative override
resisted, social engineering resisted, **a venue pasting JSON-shaped data wrote two forged values
to the sheet.** Why the third worked: the model is trained to resist being *told* what to do, and
is not trained to distinguish data a venue is *quoting* from data it is *asserting*.

## 4 · PwC — AI Factory, cross-functional

**S** — PwC stood up an internal AI Factory to find valuable generative-AI applications across
the business. I rotated across accounting, capital markets, forensics, RFP workflows, financial
research and internal operations.

**T** — Understand unfamiliar workflows quickly and turn them into useful prototypes — not
generic chatbot demos.

**A** — EDGAR and financial-document search, knowledge-base retrieval, RFP generation, internal
analytics, document extraction and transformation. The process each time: understand the workflow
→ find the opportunity → prototype → SME testing → refine. Working directly with the people doing
the job to establish what was actually manual, where judgment was genuinely required, and where
reliability mattered more than speed.

**R** — Tested AI across multiple business functions, built reusable patterns, and got comfortable
entering a domain I didn't know, talking to the people doing the work, and turning that into
something technical quickly.

> **Go deep on one, not wide on six.** Pick the strongest and have ready: what the manual baseline
> was, who did it and how long it took, what production failure you found and fixed, and what
> adoption actually looked like. Breadth is the setup; one specific story is the answer.

## 5 · PwC — compliant Terraform from documentation ⭐ *your strongest RAG story*

**S** — Financial institutions needed Azure environments — SQL Database, Key Vault and the rest —
that complied with internal standards plus financial-services and security controls.

**T** — Turn requirements and compliance documentation into compliant infrastructure code.

**A** — A LangChain workflow that retrieved the standards, controls and internal documentation,
mapped requirements onto infrastructure configuration, generated or modified Terraform, and
verified the output.

```
documentation → retrieval → requirement mapping → Terraform → validation
```

**R** — Removed a large part of the manual requirements-mapping step and made the output
consistent across environments.

**How I'd build it today, and this is the part that shows growth** — separate the stages so each
can fail and be measured independently: retrieval → reasoning → generation → **deterministic
validation** → evals. For Terraform specifically, the validation tier is not optional:

1. **Prompt-level** — module conventions, required tags, approved provider versions. Cheapest,
   and it degrades as you add rules — the ceiling I later measured on TM Go.
2. **Deterministic validators** — `terraform validate` and `fmt`, `tflint`, `tfsec`/`checkov`,
   and **policy-as-code** for the non-negotiables: no `0.0.0.0/0` ingress, no public storage,
   encryption at rest, mandatory tagging. These fail loudly and log every drop; a prompt rule
   fails silently.
3. **Structural** — `terraform plan` as a mandatory artifact, reviewed as a diff, credentials
   scoped so the pipeline *cannot* apply outside its blast radius, apply gated on approval.

> A hallucinated function throws at runtime and you see it. A hallucinated security group applies
> cleanly, looks right in the diff, and becomes a finding in someone's audit. **The model drafts,
> a human approves, code applies.**

**And verify the guardrail actually fires.** I've had a lint gate that existed to catch undefined
references miss a missing import and white-screen an app, because the rule didn't see JSX element
names. The fix wasn't adding the rule — it was deleting the import again to prove the gate now
caught it.

## 6 · PwC — enablement

**S** — Employees had wildly different levels of AI experience.

**T** — Help technical and non-technical people use AI in their actual work.

**A** — The focus was where AI actually fits, repeatable patterns, verification, failure modes,
and where deterministic automation is simply better. Communication changed by audience —
engineers: architecture, APIs, retrieval, evals. Business: workflow, inputs and outputs,
verification. Executives: value, risk, cost, adoption, KPIs.

**R** — Enabled hundreds of employees, and learned to translate the same system across three very
different audiences.

> The goal isn't teaching someone AI. It's helping them use AI appropriately in the job they
> already have.

**The counterweight, which makes it credible** — on TM Go the product decision that came from
watching non-technical users was **removing AI surface**. The upload flow went from a five-way
override to leading with a recommendation, because too many options was the actual problem.
Enablement isn't always "more AI."

---

# Technical quick reference

## RAG

**Debug path** — query understanding → retrieval → **entitlement filter** → reranking → context
assembly → generation → citation validation. Name a failure mode at each layer, and say you'd
measure retrieval and generation **separately** — otherwise a chunking change and a prompt change
get credited to the same end-to-end number.

**Metrics** — retrieval: recall@k, precision@k, was the right passage in the window. Generation:
groundedness, correctness, completeness, citation correctness.

**Failure modes** — document not in the corpus · bad ranking · bad chunking · context pollution ·
wrong permissions · model ignores retrieved evidence.

**Your differentiated answer, for a company holding camp health data.** In the prior-auth triage
app: **BM25 + embeddings fused with reciprocal-rank fusion** — keyword catches exact codes and
plan IDs that embeddings blur, semantics catches paraphrases keyword misses. Retrieval degrades
to BM25-only without an embeddings key rather than going dark. Then the part worth being asked
about:

> **Authorization is applied at retrieval, before generation.** Every document carries a plan tag;
> a guest reaches only general documents, a verified member also reaches their plan's. The filter
> runs on the fused ranking, so it isn't a prompt instruction the model could talk itself out of.
> And **PHI is never in the index at all** — claims, balances and member records come from tools
> behind the verification gate. Filter what's retrievable, and keep the sensitive class out of the
> retrievable set entirely.

Say the scale before they ask: 16 documents, 15 golden cases. Demonstration scale. And the honest
gap: grounding is currently one boolean per case, which is a smoke test rather than retrieval
evaluation — it can't tell *retrieval failed* from *retrieval worked and generation ignored it*.
Context precision and recall is what I'd build next.

## Evals

**Layers** — retrieval · generation · system (latency, cost, tool-call success, error rate) ·
business (time saved, adoption, correction and escalation rate).

**Lifecycle** — golden set → regression gate in CI → production traces → sampled human review →
failures promoted back into the golden set.

**What most candidates skip, and you have all four:**
- **Negative controls.** Cases where the right answer is *nothing*, so a confident wrong answer
  costs what a miss costs.
- **pass^k over pass@1.** One run measures luck.
- **Paraphrase perturbations.** A set that only holds under the phrasing you wrote is measuring
  your prose.
- **A held-out split.** My prompt optimiser currently tunes against the same set that grades it —
  the standard trap. Say it before they find it.

**Alert on delta, not threshold.** A set sliding 100% → 94% → 88% never trips an 80% gate, and
that gradual shape is exactly what drift looks like.

**The two beats that win this section:**
1. **I didn't believe my own 100%.** Found a full pass rate implausible, went looking, and every
   real bug found afterwards came from the adversarial cases that instinct produced.
2. **Two harnesses disagreed by 14 points** — the same 42 cases graded 100% offline and 85.7%
   against the live endpoint, because the offline one had drifted and dropped two structural
   guards. **An eval number without its harness version and configuration is not a number.** I
   wrote a parity script that runs both and exits non-zero on any disagreement.

## Observability

**Log** — model and version · prompt version · retrieved context · tool calls and results ·
latency · tokens and cost · output · error state · eval score and user feedback.

**Don't log** — secrets, credentials, unnecessary PII. Venue email is third-party personal data
the band never consented on behalf of — structurally identical to camp family communications. Log
the trace envelope; keep bodies out by default. The golden set is curated, consented and
synthetic, which is what makes it safe to keep forever and rerun weekly.

**The part most people don't build** — per-endpoint cost attribution. It answers "which feature
is expensive," not just "the bill went up."

## Agent design

Workflow = known sequence, deterministic orchestration. Agent = the model picks the next action
because the path isn't knowable in advance. **Prefer the smallest amount of agency the problem
requires.**

Know cold: tools and structured outputs · state machines and graphs · retries and idempotency ·
checkpoints · human-in-the-loop gates · max iterations and budget · sandboxing · context
management.

---

# FAQs

**Why Campminder?**
> This isn't a feature-level AI role. You're building shared capability across the company and
> putting it into the product, and the role pairs building the system with working directly with
> the people using it. That's the part of my previous work I've enjoyed most.

**How do you decide whether to use AI?**
> Start with the workflow and the business metric, not the model. Separate the part that genuinely
> needs language or judgment from the part that's deterministic, and keep the deterministic part
> deterministic. Then make sure the value justifies the uncertainty. I've argued *against* the
> more-AI answer twice with data — the thirteenth prompt rule that made accuracy worse, and the
> model that cost 17× for zero gain.

**The CEO wants AI for X and you think it's wrong.**
> I wouldn't frame it as AI versus no AI. I'd clarify the goal and the current baseline, separate
> the judgment part from the deterministic part, then prototype the smallest thing that tests the
> assumption. If deterministic software gets the outcome more reliably and more cheaply, that's
> what I'd recommend — and I'd bring the measurement rather than the argument.

**What do you do when an AI system fails?**
> Classify the layer — retrieval, context, reasoning, generation, tool call, or workflow logic.
> Reproduce it, add it to the eval set, fix that layer, and the case becomes a regression test.
> The failure is only expensive if it can happen twice.

**How do you keep up?**
> I use new tools on real projects. I form opinions by building something, seeing where it breaks,
> and comparing it against the simpler alternative — which is how I ended up with numbers on
> prompt rules versus code guards rather than a preference.

**"How would you let a customer customise the product with a coding agent without breaking
things?"** — likely system-design question. Start with blast radius, not the model: constrained
APIs rather than raw DB access · credentials scoped and tenant-pinned at the boundary so an
injection has nothing to spend · every generated change a diff a human approves · preview
environments over trust · audit log, because the question after an incident is always what it
actually did. Then the invariant: the boundary is applied structurally and a test walks the real
surface, so it can't be forgotten on the next endpoint.

---

# When to use the architecture diagram

**Never in the elevator pitch. Never as a screen-share of the full writeup** — it's a fourteen-
section page and it reads as a portfolio tour rather than an answer.

**Draw it, don't show it.** When someone asks *"how did you build it?"*, take thirty seconds and
five boxes:

```
intake → router → [ parse ] → state → [ draft ] → HUMAN APPROVAL → send
                     LLM                  LLM          gate          code
```

Building it live shows how you think; a finished graphic shows you once made a graphic. And that
one drawing answers three questions at once — where the model is, where code is, and why `send`
has exactly one inbound edge.

**Three moments it pays off:** the hiring-manager round when TM GO comes up; the technical round
on any system-design question (draw first, talk second — it also buys thinking time); and the CTO
round, where the version to draw is the *platform* one rather than TM GO's.

**The real page belongs in the follow-up email.** One line: *"the full architecture writeup with
the measured numbers is at austinnafe.com/tmgo."* Strong as something read alone, weak as
something narrated.

If you're remote and they want to see something concrete, the one artifact worth sharing is the
**model comparison graphic** — single screen, makes its point instantly.

---

# Lines to remember

- **Agents** — the smallest amount of agency the problem requires.
- **Product** — start with the workflow and the business metric, not the model.
- **Evals** — make correctness measurable, not a vibe. And distrust your own green dashboard.
- **Guardrails** — a prompt rule is a request to a probabilistic system; a guardrail is a
  constraint. Controls fail quietly, validators log every drop.
- **Boundaries** — a check you have to remember is a convention; one that fails the build is an
  invariant.
- **RAG** — separate retrieval failures from generation failures, and filter by entitlement
  before generation, not in the prompt.
- **Measurement** — a metric computed through the same assumption as the system it measures tells
  you nothing.
- **Platform** — make the safe path the easy path.
- **Executives** — outcome, risk, cost, measurable impact.

---

# The night before

- [ ] The five numbers above, out loud, without notes.
- [ ] Story 2 and Story 3 rehearsed — both under two minutes, both end on the line.
- [ ] One PwC story picked and taken deep: baseline, who did the work, what broke, what changed.
- [ ] **TM Go now HAS retrieval** — pgvector over uploaded documents. It did not when these
      notes were written, and the old instruction here said the opposite. Your RAG stories are
      now, in order: **TM Go** (the strongest — you argued against vectors, the cost numbers
      flipped it, then you audited your own new code and found three bugs), **PwC Terraform**
      (real institution, real compliance corpus), and the triage app (for the permissions
      question).
- [ ] Draw the five-box diagram on paper twice.
- [ ] Five questions for them:
      What does the platform team own that product teams don't rebuild — and what's still getting
      rebuilt? · How do you know today that a retrieval or prompt change didn't break something —
      is there a gate, or a rollback? · Where's the line between what a customer can customise and
      what they can't? · Which team adopted AI tooling fastest, and what did they have that the
      others didn't? · What would you want measurably different six months after this hire?
