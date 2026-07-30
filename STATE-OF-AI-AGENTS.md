# State of AI Agents — Field Notes

A personal reference + study doc. Goal: be able to talk through *when to use what* cold, in an interview, without hand-waving. Knowledge as of early 2026.

> **How to use this:** the interview rarely asks "what is X?" It asks "how would you build Y?" — and the senior signal is the **decision**, not the definition. So this doc leads with decision frameworks. Definitions are support.

---

## 0. The one mental model that ties it all together

When you want an LLM to do something it doesn't do well out of the box, you have **three levers**, in order of cost/effort. Reach for the cheapest one that works:

| Lever | What it changes | Cost | Reach for it when… |
|---|---|---|---|
| **Prompting** (+ in-context examples, tools) | The instructions, not the model | Lowest | Default. Always start here. |
| **RAG** (retrieval) | The *knowledge* available at inference | Medium | The model lacks **facts** — private, fresh, or too-large-to-fit data |
| **Fine-tuning** (LoRA/QLoRA) | The model's **behavior/weights** | Highest | The model lacks a **skill, format, or style** that prompting can't reliably produce |

**The single most-tested distinction:** *RAG gives the model knowledge it doesn't have; fine-tuning teaches it a behavior it can't reliably do.* If you remember one line, remember that one.

Most real systems are **prompting + RAG**. Fine-tuning is the exception, not the rule — and you should be able to say *why you didn't fine-tune* as confidently as why you would.

---

## 1. Prompting (start here, always)

Before RAG or fine-tuning, exhaust:
- **Clear instructions + role** — surprisingly far on its own
- **Few-shot examples** — in-context examples beat fine-tuning for many format/style tasks, at zero training cost
- **Structured output** — Pydantic schemas / JSON mode / tool-call schemas to force shape
- **Tool use / function calling** — give the model actions instead of trying to bake knowledge in
- **Prompt caching** — cache the stable prefix (system prompt, few-shots, retrieved context) to cut cost/latency. Cheap win, always do it.

**Interview line:** "I treat prompting + good context engineering as the baseline. Most 'we need to fine-tune' instincts are solved by better prompts, few-shot examples, or retrieval — and those are faster to ship and easier to eval."

---

## 2. RAG — and the variants that actually matter

RAG = retrieve relevant context at inference time, stuff it into the prompt, let the model answer grounded in it. Use it when the model needs **facts it doesn't have**: private docs, fresh data, or a corpus too big to fit in context.

### The base pipeline
`ingest → chunk → embed → store (vector DB) → retrieve → (re-rank) → generate`

### RAG variants — when to use each

| Variant | What it adds | Use when |
|---|---|---|
| **Naive / dense RAG** | Embed query, cosine-similarity top-k | Baseline. Clean docs, semantic questions. Start here. |
| **Hybrid search** | Dense (embeddings) **+** sparse (BM25/keyword), fused | Queries have exact terms, codes, names, acronyms — clinical/legal/financial. **Almost always worth it.** |
| **Re-ranking** | A cross-encoder (e.g. Cohere Rerank) re-scores the top-k | Retrieval is "in the ballpark" but the *best* chunk isn't ranked first. Cheap accuracy boost. |
| **Contextual retrieval** (Anthropic) | Prepend a short LLM-generated context blurb to each chunk before embedding | Chunks lose meaning out of context ("the company" → which company?). Big recall win on fragmented docs. |
| **Parent–child / small-to-big** | Retrieve on small chunks, return the larger parent for generation | You need precise retrieval but the model needs surrounding context to answer. |
| **GraphRAG** | Build a knowledge graph, retrieve over entities + relationships | Questions span many docs / require multi-hop reasoning ("how does X connect to Y across the corpus"). Heavier to build. |
| **Agentic RAG** | An agent decides *whether/what/how often* to retrieve, can issue multiple queries, reflect, re-search | Complex questions where a single retrieval isn't enough; the agent iterates. This is where RAG and agents converge. |

### Choosing the pieces
- **Chunking:** start with recursive/sentence-aware ~256–512 tokens with overlap. Tune empirically — wrong chunk size is the #1 silent RAG killer.
- **Embeddings:** OpenAI `text-embedding-3`, Cohere `embed-v3`, or OSS (BGE, E5). Trade cost vs dimension vs domain fit.
- **Vector store:** **pgvector** if you already run Postgres (default — one less system), **Pinecone** for managed scale, **Weaviate** for built-in hybrid.

### RAG failure modes to name
- Retrieved chunks lack context (→ contextual retrieval)
- top-k too small (misses) or too large (noise dilutes the answer)
- Embedding model mismatched to content type (code, clinical, multilingual)
- No source citations → can't trust or debug it
- Stale index (ingestion not re-run)

**Interview line (clinical RAG):** "I'd start dense + hybrid, because clinical text is full of exact tokens — drug names, ICD codes, abbreviations — that pure embeddings miss. Then re-rank, add source citations for trust, and contextual retrieval if chunks are fragmented. The hard part isn't the retrieval, it's evaluating it: I'd build a golden set of question→correct-chunk pairs and measure retrieval recall separately from answer quality."

---

## 3. Fine-tuning — LoRA / QLoRA

Use when the model lacks a **skill, format, or style** that prompting + RAG can't reliably produce — *not* to add facts (that's RAG's job).

### LoRA (Low-Rank Adaptation)
- **Frozen base model** — billions of pre-trained params locked, never modified → prevents *catastrophic forgetting*.
- **Low-rank adapters** — small secondary weight matrices added to specific layers; only these train.
- **Merging** — adapter output is scaled (`alpha`) and added to base output. If merged, **no extra inference latency**.
- **Hyperparameters:** `r` (rank — adapter capacity) and `alpha` (scaling). Higher `r` = more capacity, more overfit risk.

### QLoRA (Quantization + LoRA)
- Quantize the base model to **4-bit/8-bit** *before* applying LoRA → massive VRAM savings → fine-tune giant models (Llama 3, Mistral) on a **single consumer GPU**.

### Why teams like it
- **Resource-efficient** — consumer hardware instead of a cluster
- **Lightweight** — adapters are a few MB vs a fresh ~50GB checkpoint
- **Modular** — load multiple adapters on one base model (legal vs medical-coding) and **hot-swap**

### Good use cases
- **Domain adaptation** — specialized legal / medical / financial jargon
- **Format / task tuning** — reliably output JSON, function-call, behave as a fixed expert agent
- **Personality / style** — consistent tone or persona

### Tooling
Hugging Face **PEFT** + **bitsandbytes** (4-bit) + TRL. Eval the tuned model against the *same* golden set you'd use for the prompted version — otherwise you can't prove it helped.

---

## 4. The decision note: Prompting vs RAG vs Fine-tuning

> This is the exact shape of question the Rapid Prototyping role asks. Internalize the flow.

**Decision flow:**
1. **Is the gap knowledge or behavior?**
   - *Knowledge* (facts it doesn't have, or that change) → **RAG**
   - *Behavior* (a skill, format, or style it can't reliably do) → keep going
2. **Can prompting + few-shot get the behavior there?** → **yes: stop, ship it.** Cheapest, fastest, easiest to eval.
3. **Still inconsistent at scale, and you have good training data?** → **fine-tune (LoRA/QLoRA).**
4. **Both?** Many production systems are **fine-tuned *and* RAG** — tune the behavior, retrieve the facts.

**Honest trade-offs to say out loud:**
- RAG keeps knowledge **fresh and auditable** (you can cite sources); fine-tuning bakes it in **opaquely** and goes stale.
- Prompting is **instant to change**; fine-tuning is a **train/eval/deploy cycle** every time.
- Fine-tuning can **cut tokens/latency** (behavior baked in, shorter prompts) — sometimes the real reason to do it at scale.
- You can only justify *any* of these if you **measured** — which is why eval underpins all three. (See `LEARNING_BACKLOG.md` → Production AI Evals.)

**Interview line:** "I decide by asking whether the gap is knowledge or behavior. Knowledge → RAG, because I want it fresh and citable. Behavior → I try prompting and few-shot first because they're instant to iterate; I only fine-tune when I've measured that prompting can't hold the bar at scale, or when baking the behavior in meaningfully cuts tokens and latency. And I won't claim any of it works without an eval to back it."

---

## 5. Agent architectures (the layer on top)

When a single prompt isn't enough — tasks need multiple steps, tools, state, or branching.

- **When agentic vs single-prompt:** multi-step work, tool use, persistent state, conditional logic. Otherwise don't — agents add cost, latency, and failure surface.
- **Patterns:** ReAct (reason+act), Reflection (critique own output), Plan-and-execute, Multi-agent (supervisor + workers), Tool-calling.
- **State (LangGraph):** explicit State object, reducers, checkpoints for persistence/resume.
- **Tools:** typed schemas, structured outputs, and error handling for when a tool fails or the model hallucinates args.
- **Failure modes to name:** infinite loops, hallucinated tool arguments, runaway token cost, slow latency, no observability into *why* it did what it did.

**Tie-in:** this is where **agentic RAG** lives — the agent decides when/what to retrieve. Your TM Go and the healthcare agents are the concrete stories here.

---

## 6. The thread through all of it: evaluation

Every lever above is unjustifiable without measurement. The whole stack rests on: *can you prove it's working?* — adoption + quality + business impact, plus regression tests so "improvements" don't silently break edge cases. Full treatment in `LEARNING_BACKLOG.md` → **Production AI Evals**.

---

## Quick-reference one-liners (memorize these)
- "RAG adds knowledge; fine-tuning changes behavior."
- "Start with prompting, add retrieval for facts, fine-tune only when you've measured prompting can't hold the bar."
- "Hybrid search almost always beats pure embeddings when the text has exact tokens."
- "QLoRA = 4-bit base + LoRA adapters → fine-tune a big model on one consumer GPU."
- "Don't go agentic unless the task needs steps, tools, or state — agents are cost and failure surface."
- "I won't claim it works without an eval behind it."
