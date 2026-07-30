# Monitoring & Observability for LLM / Agent Systems — Field Notes

The doc I wish I'd had when the interviewer asked *"how do you monitor this in production?"* Same spirit as `STATE-OF-AI-AGENTS.md`: lead with the framing that makes you sound senior, definitions second.

> **The one line to open with:** "Monitoring an LLM system is monitoring a normal service *plus* one hard extra question — *is the output actually any good?* A confidently wrong answer still returns 200 OK. So I monitor three layers: operational, quality, and the agent trace. And the whole thing is a loop — production traces become my next eval set."

---

## 0. Why this is different from monitoring any other service

A normal API has three failure questions: is it **up**, is it **fast**, is it **erroring**. You can answer all three from status codes and latency.

An LLM system has a fourth that the other three can't see: **is the answer good?** The model hallucinates a policy number, cites a reg that doesn't exist, or quietly gets worse after the provider ships a new model version — and every one of those returns HTTP 200. There is no stack trace for "wrong."

That's the whole reason observability matters more here, not less. The senior signal is knowing that quality is a *first-class monitored metric*, not something you check by eyeballing outputs.

---

## 1. The three layers (this is the mental model — memorize the shape)

| Layer | Question it answers | What you watch |
|---|---|---|
| **Operational** | Is it up, fast, affordable? | latency p50/p95/p99, throughput, error/timeout rate, **token usage + $ cost**, rate-limit hits, provider errors, time-to-first-token (streaming) |
| **Quality** | Is the output any good? | sampled LLM-as-judge scores, user feedback (👍/👎, edits, regenerate, abandonment), task-success proxies, guardrail/validation failures, refusal rate, **drift** |
| **Trace** | *Why* did the agent do that? | full per-run trace: every prompt, tool call (args + result), retrieval, token cost and latency **at each step**, and where it failed or looped |

If you can name these three layers in an interview and give one metric from each, you've already answered better than most.

---

## 2. Operational layer — the "it's still a service" part

Everything you'd watch for any backend, plus the LLM-specific ones:

- **Latency** — p50/p95/p99, not average. LLM latency is spiky; the average hides the user who waited 30s. For streaming, **time-to-first-token** matters more than total.
- **Cost** — token usage and dollars **per request, per user, per feature**. This is the metric that's unique-ish to LLMs and the one that surprises teams. A runaway agent loop is a *cost* incident before it's anything else.
- **Throughput / rate limits** — provider 429s, your own queue depth.
- **Errors** — provider 5xx, timeouts, malformed responses, JSON-parse failures on structured output.

**Alert on:** cost spike (runaway loop), p95 latency breach, error-rate spike, rate-limit saturation.

---

## 3. Quality layer — the hard, LLM-specific part

You cannot read every response. So you instrument quality with signals that scale:

- **Sampled LLM-as-judge** — score a sample of production outputs with a judge model against a rubric. Cheap continuous quality read. (Risks: judge bias, prompt sensitivity — validate the judge against human ratings first. Same caveats as offline LLM-as-judge.)
- **User feedback, explicit and implicit** — 👍/👎 are explicit. The gold is *implicit*: did they edit your answer, hit regenerate, copy it, abandon the session, or convert? A high regenerate rate is a quality alarm no judge needed to tell you.
- **Task-success proxies** — the business outcome as a metric. Did the form get filed? Did the agent complete the flow? Did the tour stay on schedule? Did the buyer get an answer that ended the thread? This is the truest quality signal because it's the actual point.
- **Guardrail / validation failures** — schema-validation failures on structured output, hallucination/grounding checks, PII or safety filter trips, **refusal rate** (model refusing things it shouldn't).
- **Drift** — input distribution shifting (users asking new kinds of things) and output quality declining over time. The sneaky one: the **provider silently updates the model** and your outputs change with no code change on your side. Version-pin where you can and watch quality across the change.

**Alert on:** judge-score drop, 👎/regenerate-rate spike, guardrail-failure-rate spike, refusal-rate spike, task-success-rate drop.

---

## 4. Trace layer — the part interviewers actually probe

This is the one that separates "I've read about it" from "I've run one."

**A single agent request is a tree, not a call.** One user message fans out into: an LLM reasoning step → a tool call → a retrieval → another LLM step → maybe a loop → a final answer. If you only log the input and the final output, you are blind to everything that happened in between — and "why did the agent do that?" is the #1 production-agent question.

So you capture a **distributed trace per run**: every prompt, every tool invocation with its arguments and result, every retrieval, the token cost and latency at *each step*, and exactly where it errored, looped, or hallucinated a tool argument.

What the trace buys you:
- **Debuggability** — you can see the exact step where it went wrong instead of guessing.
- **Loop / runaway detection** — catch the agent calling the same tool 40 times before the bill does.
- **Replay** — re-run a failed trace against a prompt fix to confirm it's fixed.
- **The eval feedback loop** — a bad trace becomes a golden test case (see §6).

**This is what LangSmith / Langfuse / Phoenix are *for*.** LangGraph's explicit state model is what makes these traces clean — every node transition is a loggable event. When you say "why LangGraph," *this* is a real answer: it makes agents observable, not just runnable.

---

## 5. Tools — name a few, know what each is for

| Tool | What it is | Reach for it when |
|---|---|---|
| **LangSmith** | LangChain's tracing/eval platform | You're on LangChain/LangGraph and want the tightest integration. Default for that stack. |
| **Langfuse** | Open-source, self-hostable observability + evals | You want OSS / data stays in your infra (regulated, healthcare). |
| **Arize Phoenix** | OSS, eval- and drift-focused | Heavier on eval/drift analysis, notebook-friendly. |
| **Braintrust** | Eval + logging platform | Eval-centric workflows, prompt experimentation. |
| **Helicone** | Proxy-layer logging | Cheap drop-in for cost/latency logging without code changes. |
| **OpenTelemetry + Grafana/Datadog** | Classic infra observability | The operational layer (§2). LLM traces increasingly export to OTel too. |

You don't need all of them. The honest interview answer: "LangSmith or Langfuse for the traces and quality layer, and I still want the operational layer in whatever the team already runs — Datadog, Grafana. I don't rebuild ops observability just because it's an LLM."

---

## 6. The part that makes you sound senior: it's a *loop*, not a dashboard

Monitoring isn't passive dashboards you glance at. **Online monitoring feeds offline evals feeds your next change, gated by regression tests:**

```
production traces + user feedback
        │  (flag the bad ones)
        ▼
   golden eval set  ──►  regression tests on every prompt/agent change
        ▲                        │
        └──────── prevents ◄─────┘
                the same failure recurring
```

A flagged bad trace in prod becomes a test case in your golden set. Now that failure can never silently come back, because every future change runs against it. This closes the two halves — **evals = offline "does it meet the bar", monitoring = online "is it still meeting the bar"** — into one discipline.

Your `LangGraph Eval Harness` is the offline half. Monitoring is the online half. Same loop.

---

## 7. Mapping it to my projects (so I can answer with a story, not theory)

- **LangGraph Eval Harness** — the offline half of the loop above. Monitoring is the online counterpart; I can talk about them as one system.
- **Octagon (AI red team)** — adversarial testing *is* proactive monitoring: probe for the failure before prod finds it. Red-teaming and observability are the same instinct pointed in two directions.
- **Prior Auth Agent / AutoFill Claims** — regulated healthcare → auditability is non-negotiable. Every decision traced and cited ("with receipts"). Self-hosted observability (Langfuse) so patient data never leaves the boundary.
- **TM Go** — stateful SMS agent → I'd monitor conversation success rate, dropped threads, and cost per active tour, not just uptime.
- **Earnings Inspector** — sampled judge-scoring on tone/flag accuracy, because there's no single ground-truth "right" analysis.

---

## Quick-reference one-liners (memorize)

- "A wrong LLM answer returns 200 OK — so quality is a monitored metric, not a spot-check."
- "Three layers: operational, quality, trace. One metric each: p95 latency, task-success rate, and the full per-run trace."
- "A single agent request is a tree of LLM + tool + retrieval calls — without per-run tracing you can't answer 'why did it do that.'"
- "Cost per request is the metric teams forget; a runaway loop is a cost incident first."
- "The scary drift is the provider silently updating the model under you — version-pin and watch quality across the change."
- "Monitoring feeds evals feeds the next change — a bad prod trace becomes a golden test so it can't recur."
- "LangSmith/Langfuse for traces and quality; I still put the operational layer in whatever ops stack the team already runs."
