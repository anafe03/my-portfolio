# Learning Backlog

Personal study + build queue. Prep context: Prompt — Senior Full Stack AI Engineer (Rapid Prototyping & Analytics). Interview prep, ~2 weeks out.

Companion reference: **`STATE-OF-AI-AGENTS.md`** — decision frameworks for prompting vs RAG vs fine-tuning, RAG variants, LoRA/QLoRA, agent architectures, and interview one-liners.

Status key: `todo` · `learning` · `built` · `parked`

---

## 1. Production AI Evals  `learning`  ⭐ top priority

> This is Prompt's centerpiece — the JD repeats "evaluation / monitoring / outcome metrics" 8+ times. Also the basis for surfacing the **LangGraph Eval Harness** project as a hero card on the site.

**Goal:** be fluent enough to (a) talk through an eval strategy cold in an interview, and (b) ship a real eval harness project.

What to learn / be able to explain:
- **Offline metrics** — golden datasets, semantic similarity, exact match, ROUGE/BLEU (generation), accuracy/F1 (classification), human eval
- **Online monitoring** — latency p50/p95/p99, cost per request, token usage, error rates, drift detection
- **LLM-as-judge** — when to use it (qualitative tasks), risks (judge bias, prompt sensitivity), how to validate (correlate with human ratings)
- **Regression testing** — golden test set + assertions, run on every prompt change, catch when "improving" a prompt breaks edge cases
- **Tools** — LangSmith, Langfuse (OSS), Phoenix/Arize, Braintrust, OpenAI Evals
- **Hard parts** — non-determinism (run N, take mode), no ground truth for open-ended tasks, golden sets are expensive to build, drift as models change
- **The "is it working?" framing** — adoption (used without being told) + quality (output is good) + business impact (time/money saved). All three.
- **Kill criteria** — when to stop iterating on a POC and move on

Refresh resources:
- Eugene Yan — "Building LLM Apps for Production" series (esp. the eval post)
- Anthropic evaluations cookbook
- Langfuse / LangSmith docs

**Build deliverable:** finish the LangGraph Eval Harness (auto-gen test suites, run vs golden outputs, regression tracking, token-cost logging, results viz). Then promote it from WIP stub to hero project on the site.

---

## 2. LoRA / QLoRA Fine-Tuning  `todo`

> Parameter-efficient fine-tuning. Good depth signal; "domain adaptation for medical/legal/financial jargon" maps cleanly to the healthcare angle.

**How it works**
- **Frozen base model** — the billions of pre-trained params are locked and never modified, which prevents *catastrophic forgetting* (losing original knowledge).
- **Low-rank adapters** — smaller secondary weight matrices (LoRA adapters) are added to specific layers. These adapters learn the new task/info.
- **Merging** — the adapter's output is scaled and added to the base model's output. If merged, no extra inference latency.

**Key benefits**
- **Resource efficiency** — fine-tune massive models (Llama 3, Mistral) on consumer-grade hardware (single GPU).
- **Lightweight storage** — adapters are a few MB instead of a whole new ~50GB model.
- **Modular switching** — load multiple adapters on one base model (e.g. legal vs medical-coding) and swap on the fly.

**QLoRA (Quantization + LoRA)**
- Compresses the base model to 4-bit / 8-bit precision *before* applying LoRA. Saves huge VRAM — makes fine-tuning giant LLMs possible on a standard laptop with a consumer GPU.

**Common use cases**
- **Domain adaptation** — teach a general LLM specialized legal / medical / financial jargon.
- **Format & task tuning** — consistent JSON output, function calling, expert-agent behavior.
- **Personality / style** — respond in a specific tone or persona.

To learn next:
- Hugging Face PEFT library (hands-on LoRA/QLoRA)
- `bitsandbytes` for 4-bit quantization
- Rank (`r`) and `alpha` hyperparameters — what they control, how to pick them
- When fine-tuning beats RAG / prompting (and when it doesn't) → see `STATE-OF-AI-AGENTS.md` §4

---

## Site improvements (Prompt prep)  `todo`

Tied to the portfolio at `src/pages/index.astro`. Discussed but not yet built:

- [ ] **Promote LangGraph Eval Harness** from WIP stub → hero project (real description, drop "In Progress", add link)
- [ ] **Write eval-philosophy case study** in the Notebook section: "How I know an AI tool is actually working" (adoption + quality + business impact + kill criteria), 600–900 words
- [ ] **Reframe PwC card** around "internal AI tools across business functions" + concrete metrics on the RFP generator
- [ ] **Add one outcome metric** to Prior Auth Agent + AutoFill Claims so they don't read as demos

> Blocked on: real numbers (time saved, teams adopting, eval accuracy) so nothing gets fabricated.
