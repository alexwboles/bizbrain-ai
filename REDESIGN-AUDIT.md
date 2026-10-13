# BizBrain AI — Redesign Audit (2026-10-13)

## Competitors researched (3–5)
1. **Slite** (dynamicbusiness.com 2026 review; slite.com learn pages) — Ask AI with cited sources, staleness detection flagging pages not reviewed recently, document verification, duplicate-content detection, Channels/Collections by team & topic. Minimal black-on-white doc aesthetic.
2. **Guru** (docmost.com comparison) — cited, permission-aware answers with lineage/audit logs; governed answer cards; verification workflows.
3. **Notion AI** (fahimai.com review 2026) — answers drawn from workspace pages with source blocks; block-first editor; Enterprise Search across tools.
4. **Document360 / Docmost** (nextbigwhat.com; docmost.com) — mixed public/private portals, AI answers, self-hosted option (Docmost via Ollama).
5. **Google Gemini side panel** (dev.to 2026) — conversational Q&A panel pinned next to the working doc.

## Visual gaps vs competitors
- Current look is a pleasant but generic "card stack with tabs" — every section is a full-width rounded card, no hierarchy between Ask (the core job) and Documents. Slite/Guru lead with a **command-bar ask surface** and keep the vault secondary.
- Answers are rendered as plain text blocks; competitors show **answer cards with source citations** (doc title chip + excerpt with highlighted match + confidence badge + "open doc" action).
- Vault health (staleness, duplicates) exists in logic but is buried in the Documents tab as a thin strip; Slite makes verification a first-class sidebar/panel.
- No visual distinction between tabs — a knowledge product should feel like a reference desk/library, not a settings page.
- Rounded corners + violet accent (current) → must go square per Alex's rule; pick a distinctive "library" identity.

## Functional gaps (prioritized)
1. **No command-bar ask** — the Ask tab is a form; Slite/Guru's pattern is an always-visible ask box ("/" keyboard shortcut) with instant suggestions. HIGH — matches existing autocomplete logic.
2. **Answer cards lack citations UX** — logic returns title+excerpt+score; render as cards with source chips, highlighted match terms, confidence badge, copy button, and "related questions" already computed. MEDIUM-HIGH.
3. **No verification workflow** — staleDocs/findSimilar exist; add a "Vault health" panel with per-doc "Mark verified" (updates reviewed date) + duplicate pairs with merge/delete actions. MEDIUM.
4. **No doc reading view** — clicking a doc shows only an edit form? (check app.js) — Slite shows a clean reading pane; add read/edit toggle. MEDIUM — scope permitting.
5. **No answer feedback** — thumbs up/down on answers feeds gap analytics (which docs get asked-but-weak answers). LOW.

## Concept (1 paragraph)
**"The reference desk."** A Slite-flavored library console: dark-ink slim sidebar (Ask / Documents / Auto FAQ / Knowledge gaps + tag collections), top **command bar** ("Ask the vault…", "/" to focus) with live suggestions; center column renders **answer cards** — source doc chip, highlighted excerpt, confidence badge, copy + "write this gap" actions; right rail is the **vault health desk** (stale docs, duplicates, gap leaderboard). Warm paper (#faf8f2), ink black, and a single **terracotta/ochre** accent; serif display for the desk masthead, Inter body; squared corners; card-catalog details (thin rules, index-tab labels). Ask stays the hero — everything else is shelving.

## Bug fixes found during audit
- TBD from app.js read (check doc read/edit flow, print CSS intactness).

## What to preserve (test contract)
IDs: qTag, qHist, qHistClear, dSearch, faqPrint, qSuggest (+ qInput, qAsk, qOut, tryq, dTitle, dTags, dBody, dAdd, dSample, dExport, dImportBtn, dImport, docCount, docList, faqN, faqGen, faqCopy, faqOut, gapList, gapClear); app.js fns: duplicateDoc(state.docs…), renderQHistory(), suggestQuestions(state.questions…, relatedQuestions(state.questions…, gapTermStats(state.gaps…, answerConfidence(, staleDocs(state.docs…, findSimilar(state.docs…; CSS: .conf-strong, .vault-strip, @media print.
