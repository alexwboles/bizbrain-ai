#!/usr/bin/env bash
# BizBrain AI end-to-end tests — 7 flows exercised in Node against js/logic.js.
set -u
cd "$(dirname "$0")/.."

node << 'EOF'
const Z = require('/home/hatch/workspace/bizbrain-ai/js/logic.js');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  PASS: ' + m); };
const bad = (m) => { fail++; console.log('  FAIL: ' + m); };
console.log('== bizbrain-ai e2e ==');

// Flow 1: full journey — add docs -> ask -> correct doc wins
let docs = [];
Z.addDoc(docs, { title: 'Pet grooming prices', body: 'A full groom for small dogs costs $45 and takes about 90 minutes. Large dogs cost $75. Nail trims are $12 walk-in.', tags: 'pricing' });
Z.addDoc(docs, { title: 'Cancellation policy', body: 'Cancel at least 24 hours ahead for a full refund of your deposit. Same-day cancellations forfeit the $20 deposit. No-shows are charged the full service price.', tags: 'policy' });
const r1 = Z.ask(docs, 'how much for a small dog groom', 2);
(r1.answers.length >= 1 && r1.answers[0].title === 'Pet grooming prices' && /45/.test(r1.answers[0].excerpt))
  ? ok('flow1: pricing question -> pricing doc, $45 in excerpt') : bad('flow1 ' + JSON.stringify(r1.answers.map(a => a.title)));

// Flow 2: title boost — query matching a title outranks body-only mention
const r2 = Z.ask(docs, 'cancellation policy deposit', 2);
(r2.answers[0].title === 'Cancellation policy')
  ? ok('flow2: title-weighted ranking puts policy doc first') : bad('flow2');

// Flow 3: unanswerable question -> noMatch -> gap logged -> summary counts
const r3 = Z.ask(docs, 'do you sell aquariums', 2);
let gaps = [];
if (r3.noMatch) Z.logGap(gaps, 'do you sell aquariums');
Z.logGap(gaps, 'Do You Sell Aquariums?');
const sum = Z.gapSummary(gaps);
(r3.noMatch && sum.length === 1 && sum[0].count === 2)
  ? ok('flow3: no-match -> gap logged, case-insensitive collapse (2x)') : bad('flow3');

// Flow 4: gap resolved after writing it up — add doc, question now answered
Z.addDoc(docs, { title: 'Aquarium sales', body: 'Yes, we sell aquariums in 10, 20, and 50 gallon sizes. Starter kits begin at $99 and include filter, light, and water conditioner.', tags: 'products' });
const r4 = Z.ask(docs, 'do you sell aquariums', 2);
Z.resolveGap(gaps, sum[0].ids[0]); Z.resolveGap(gaps, sum[0].ids[1]);
(!r4.noMatch && r4.answers[0].title === 'Aquarium sales' && Z.gapSummary(gaps).length === 0)
  ? ok('flow4: new doc answers old gap; gaps resolved') : bad('flow4');

// Flow 5: autoFAQ finds real topics across the vault
const faqs = Z.autoFAQ(docs, 6);
const terms = faqs.map(f => f.term);
(faqs.length >= 4 && terms.some(t => /deposit|cancel/.test(t)) && faqs.every(f => f.source && f.a.endsWith('.')))
  ? ok('flow5: autoFAQ surfaces real terms (' + terms.slice(0, 3).join(', ') + ')') : bad('flow5');

// Flow 6: export -> import round-trip preserves docs; junk rejected
const exp = Z.exportJSON(docs);
const imp = Z.importJSON(exp);
const junk1 = Z.importJSON('{"nope":true}');
const junk2 = Z.importJSON('hello');
(imp.ok && imp.docs.length === docs.length && !junk1.ok && !junk2.ok)
  ? ok('flow6: backup round-trip ok (' + imp.docs.length + ' docs); junk rejected') : bad('flow6');

// Flow 7: delete + validation edges
const before = docs.length;
Z.deleteDoc(docs, docs[0].id);
const v = Z.validateDoc({ title: 'x', body: 'tiny' });
const dup = Z.deleteDoc(docs, 'no-such-id');
(docs.length === before - 1 && v.length === 1 && dup === false)
  ? ok('flow7: delete removes 1; short body -> 1 error; bad id -> false') : bad('flow7');

// Flow 8: tag-filtered ask narrows the search pool
let tdocs = Z.sampleDocs();
const t1 = Z.ask(tdocs, 'money back', 3, 'support');
const t2 = Z.ask(tdocs, 'money back', 3, 'pricing');
const t3 = Z.ask(tdocs, 'opening hours saturday', 3, 'hours');
(t1.answers.length === 1 && t1.answers[0].title === 'Refund policy' &&
  t2.noMatch && t3.answers.length === 1 && t3.answers[0].title === 'Opening hours')
  ? ok('flow8: tag filter keeps only matching-tag docs') : bad('flow8');

// Flow 9: duplicate + search a doc, then ask the copy
const cp = Z.duplicateDoc(tdocs, 'doc-sample-2');
const found = Z.searchDocs(tdocs, 'Pricing 2026 (copy)');
(cp && found.length === 1 && found[0].id === cp.id)
  ? ok('flow9: duplicate findable via search by its (copy) title') : bad('flow9');

// Flow 10: question history trims to the newest 20
let hist = [];
for (let i = 0; i < 25; i++) hist.push({ query: 'q' + i });
hist = Z.trimHistory(hist, 20);
(hist.length === 20 && hist[0].query === 'q5' && hist[19].query === 'q24')
  ? ok('flow10: history trimmed to newest 20') : bad('flow10');

// Flow 11: document search is case-insensitive across title/tags/body
// (tdocs includes the "Pricing 2026 (copy)" duplicate from flow 9)
const s1 = Z.searchDocs(tdocs, 'REFUND');
const s2 = Z.searchDocs(tdocs, 'credit cards');
const s3 = Z.searchDocs(tdocs, 'policy');
(s1.length === 1 && s1[0].title === 'Refund policy' &&
  s2.length === 2 && s2.every(d => d.title.indexOf('Pricing 2026') === 0) &&
  s3.length === 1 && s3[0].title === 'Refund policy')
  ? ok('flow11: search hits title, body, and tag case-insensitively') : bad('flow11');

// Flow 12: autocomplete + related questions + gap terms work end to end
const hist12 = [
  { query: 'What is our refund policy?', answered: true, topDoc: 'Refund policy' },
  { query: 'What is our return window?', answered: true, topDoc: 'Refund policy' },
  { query: 'Do you offer delivery?', answered: true, topDoc: 'Delivery info' },
  { query: 'Do you offer gift wrapping?', answered: false, topDoc: null }
];
const s12 = Z.suggestQuestions(hist12, 'do you', 5);
const r12 = Z.relatedQuestions(hist12, 'Refund policy', 'What is our refund policy?', 3);
const gaps12 = [];
Z.logGap(gaps12, 'Do you fix iPhone screens?');
Z.logGap(gaps12, 'do you fix iphone screens?');
const t12 = Z.gapTermStats(gaps12, 3);
const t12i = t12.filter(t => t.term === 'iphone')[0];
(s12.length === 2 && s12[0] === 'Do you offer gift wrapping?' &&
  r12.length === 1 && r12[0] === 'What is our return window?' &&
  t12i && t12i.count === 2)
  ? ok('flow12: suggest newest-first; related excludes current; gap terms count repeats') : bad('flow12');

// Flow 13: answer confidence levels
const confDocs = [];
Z.addDoc(confDocs, { title: 'Refund policy', body: 'We offer a 30-day money-back guarantee on all services. Email support with your receipt number. Refunds process within 5 business days. Custom orders non-refundable once started.' });
Z.addDoc(confDocs, { title: 'Opening hours', body: 'Open Monday to Friday 9am to 5pm. Saturdays 10am to 2pm. Closed Sundays and public holidays. Bookings online anytime.' });
const rc13s = Z.ask(confDocs, 'what is the refund policy and how do refunds process', 3);
const c13s = Z.answerConfidence(rc13s, 'what is the refund policy and how do refunds process');
const rc13t = Z.ask(confDocs, 'sundays holiday bookings', 3);
const c13t = Z.answerConfidence(rc13t, 'sundays holiday bookings');
const c13n = Z.answerConfidence({ answers: [], noMatch: true, reason: 'nomatch' }, 'zzz');
(c13s.level === 'strong' && c13t.level !== 'strong' && c13n.level === 'none')
  ? ok('flow13: strong/partial/none confidence from score spread') : bad('flow13 ' + JSON.stringify([c13s.level, c13t.level, c13n.level]));

// Flow 14: stale docs + near-duplicate detection
const d14a = { id: 'old-1', title: 'Winter hours 2025', body: 'Winter hours were Monday to Friday 10am to 4pm.', createdAt: '2025-01-05T12:00:00.000Z' };
const d14b = { id: 'new-1', title: 'Opening hours', body: 'Open Monday to Friday 9am to 5pm. Saturdays 10am to 2pm.', createdAt: '2026-10-01T12:00:00.000Z' };
const d14c = { id: 'new-2', title: 'Opening hours copy', body: 'Open Monday to Friday 9am to 5pm. Saturdays 10am to 2pm. Closed Sundays.', createdAt: '2026-10-02T12:00:00.000Z' };
const stale14 = Z.staleDocs([d14a, d14b, d14c], 180, '2026-10-13T12:00:00.000Z');
const sim14 = Z.findSimilar([d14a, d14b, d14c], 0.4);
(stale14.length === 1 && stale14[0].id === 'old-1' &&
  sim14.length === 1 && sim14[0].a.id === 'new-1' && sim14[0].b.id === 'new-2' && sim14[0].sim >= 0.5)
  ? ok('flow14: 180-day stale detection; near-duplicate pair flagged with sim score') : bad('flow14 ' + JSON.stringify({ stale: stale14.length, sim: sim14.length }));

console.log('');
console.log('e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
EOF
echo "e2e exit: $?"
