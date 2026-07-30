# How I Build with AI — the narrative

Two things in one file:

1. **The site copy** (§ "The Ladder") — public-facing prose, semi-technical, written for a business audience. This is what becomes the new site section once you approve the wording. No interview scaffolding in it.
2. **The interview walk-through** (§ at the bottom) — how to *talk* through the same arc, and which project to reach for at each rung. Strip this before porting to the site.

The whole point: it's the spine that makes the scattered projects read as one story. Someone lands on the site, reads this, and *then* the fifteen project cards make sense — each one is a rung on the same ladder.

---

## The Ladder  *(site copy — this is the section)*

**Heading idea:** "How I Build" · **Subhead:** "From a raw model to something a business can rely on."

---

**A model is just an engine.**

A large language model predicts text. That's it — and it's enormous, but on its own it has no memory, no access to your data, and no ability to *do* anything. It's an engine, not a car. Everything interesting is in what you build around it. The way I work is a ladder: start on the cheapest rung that solves the problem, and only climb when the problem actually demands it.

**Rung 1 — Prompting.** Most "we need AI for this" asks are solved here: clear instructions and a few good examples. It's instant to change and costs nothing to iterate. I don't reach for anything heavier until I've proven a prompt can't hold the bar. Reaching for a bigger tool first is the most common way AI projects get slow and expensive.

**Rung 2 — Give it your knowledge.** A model only knows what it was trained on — not your contracts, your policies, or what changed this morning. So when the gap is *facts*, I retrieve the right documents at the moment of the question and let the model answer grounded in them, citing its sources. That's what lets my **Prior Auth Agent** quote the exact CMS regulation instead of guessing, and what lets **Earnings Inspector** read a filing and tell you what the press release left out.

**Rung 3 — Give it actions.** A model that can only talk is a chatbot. Wire it to tools — send a text, query a database, file a form, pull comps — and it can actually *do* the work. **TM Go** coordinates a tour over group SMS because texting is a tool it can use. **AutoFill Claims** fills the insurance forms because filling is an action, not a conversation.

**Rung 4 — Let it run the loop: agents.** When a task takes several steps, a few decisions, and some memory of what just happened, you have an agent: it reasons, picks a tool, looks at the result, decides what to do next, and remembers. That's the difference between "answer this question" and "keep this tour on schedule all week" or "read the denial, find the grounds, and file the appeal."

**Why LangGraph (the "why LangChain" answer).** Running that loop by hand becomes a tangle of state, retries, branching, and things that fail halfway. LangGraph gives the agent an explicit map of its own process — persistent state, checkpoints it can resume from, and, most importantly, a clear record of every step it took. It's not framework-for-its-own-sake; it's what turns an agent from a demo that works once into a system you can debug, trust, and put in front of real users.

**The hard part isn't the demo — it's the 1,000th run.** Anyone can show an agent working once. The value is one that works on the input nobody predicted, without burning money or going off the rails. That's two disciplines I treat as core, not optional: **evaluation** — measuring whether it meets the bar instead of hoping — and **monitoring** — watching whether it *still* meets the bar in production, with a full trace of every decision so I can answer "why did it do that." My **LangGraph Eval Harness** is the measuring half; **Octagon**, which red-teams agents for the ways they break, is the same instinct pointed at finding failures before users do.

**What it's all for.** Every rung ends in the same place: time and money back. Answer buyers around the clock. Do the first thirty-eight of the forty hours someone would spend fighting their insurer. Keep the bus on schedule and the band fed. The point was never "AI is impressive" — it's a reliable system that saves real hours, with receipts you can audit.

*That's the ladder I climb on every build: the cheapest rung that works, measured at every step. Point at any project and I'll show you which rungs it uses, and why it stops where it does.*

---

## Interview walk-through  *(strip this before it goes on the site)*

**How to open (10 seconds):** "The way I think about building with AI is a ladder — cheapest rung that works, climb only when the problem forces you to. Let me walk it, and I'll hang a real project on each rung."

**The rungs, and the project to reach for:**

| Rung | The idea in one line | Project to name |
|---|---|---|
| Prompting | Most asks are solved with instructions + examples; don't over-build | (general — your PwC plugins started here) |
| Knowledge / RAG | When it needs *your* facts, retrieve and cite | **Prior Auth Agent** (cites the CMS reg), **Earnings Inspector** |
| Tools / actions | A model that can't act is a chatbot; wire it to tools | **TM Go** (SMS), **AutoFill Claims** (forms) |
| Agents | Multi-step + decisions + memory = an agent | **TM Go**, **Prior Auth Agent** (files the appeal end-to-end) |
| Orchestration (why LangGraph) | Explicit state + checkpoints + a trace of every step | any LangGraph project — this is your "why LangChain" answer |
| Reliability (evals + monitoring) | The 1,000th run, not the demo — measured + traced | **LangGraph Eval Harness** (offline), **Octagon** (adversarial) |
| Value | Every rung ends in time/money saved, auditable | pick the project matching the room |

**The two power moves in this arc:**
1. **"Cheapest rung that works"** — signals you don't reach for agents/fine-tuning to look sophisticated. Senior restraint.
2. **"The hard part is the 1,000th run"** — pivots straight into evals + monitoring, which is exactly where the last interview caught you flat. Now it's *your* pivot, on your terms. (Back it with `MONITORING-OBSERVABILITY.md`.)

**If they push on "why LangChain/LangGraph specifically":** don't defend the brand — answer with the trace. "Because orchestrating the agent loop by hand means rebuilding state, retries, and — the real reason — observability into every step. LangGraph's explicit state model is what makes each step loggable, which is what makes the agent debuggable in production." Then you're back on monitoring, your strong ground.

---

## Open questions for you before I wire it into the site

- **Numbers.** Your backlog says nothing gets fabricated. The value paragraph is strongest with one real figure — hours saved, a team that adopted a PwC plugin, an eval accuracy. Got any I can drop in? If not, it stays qualitative.
- **Voice.** I wrote this fairly confident and plain. Too polished? Too plain? Say the word and I'll match your register.
- **Placement.** I'd put this section high — right after the hero, before Projects — on the professional themes (midnight, agents, cyber, finance, healthcare, founder), so it frames everything below it. Sound right?
