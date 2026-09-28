# BizBrain AI

**Your company's brain, in your pocket.** Every small business repeats the same answers — refund policy, pricing, hours, "do you do X?" — and that knowledge lives in the owner's head or scattered notes. The self-hosted RAG trend proves the demand, but it needs servers, embeddings, and API keys. BizBrain AI rebuilds it as a zero-infrastructure static app: paste your documents in, ask questions, get answers with sources. 100% local, works offline.

## Problem
New hires, cover staff, and even owners waste time hunting for answers buried in old emails, PDFs, and memory. Paid knowledge-base tools ($10–50/user/mo) are overkill for a 5-person shop.

## Solution
A document vault with instant keyword Q&A: paste SOPs, price lists, policies, FAQs → ask in plain English → get ranked answers showing the source document and the exact excerpt. Questions with no good match are logged as **knowledge gaps** — a to-do list of pages your handbook is missing.

## Features
1. **Document vault** — add/paste/tag documents, word counts, delete; sample docs included.
2. **Ask** — plain-English questions → ranked answers (title-weighted keyword scoring) with source document + excerpt and a match score.
3. **Honest no-match** — when nothing matches, it says so and offers to log the question as a knowledge gap instead of hallucinating.
4. **Knowledge gaps** — repeat questions collapse and float to the top; "mark written up" clears them once documented.
5. **Auto FAQ** — scans the vault for the most-mentioned topics and drafts FAQ entries from the best-matching sentences, with sources; one-click copy.
6. **Backup** — export/import the whole vault as JSON.

## Pricing vision
Free for unlimited local docs · **$15/mo Pro** (shareable team link, multi-user vault sync) · $49/mo Agency (client vaults).

## Run it
No build step. Open `index.html` in a browser, or:

```bash
python3 -m http.server 8080   # then http://localhost:8080
```

## Tests
```bash
bash test/smoke.sh   # 12 checks: files, syntax, tokenize, ask ranking, gaps, FAQ, import/export
bash test/e2e.sh     # 7 end-to-end flows in Node against js/logic.js
```

## Architecture
```
index.html        Ask / Documents / Auto FAQ / Knowledge gaps tabs
css/style.css     theme (violet accent), answer cards, FAQ styling
js/logic.js       pure retrieval logic (UMD: Node + browser): tokenize, scoreDoc,
                  ask, autoFAQ, gapSummary, import/export
js/app.js         DOM wiring + localStorage persistence (key: bizbrain-ai-v1)
test/smoke.sh     file/syntax/logic checks
test/e2e.sh       7 user-journey flows in Node
```
All logic is dependency-free and offline-capable. Data never leaves the browser.
