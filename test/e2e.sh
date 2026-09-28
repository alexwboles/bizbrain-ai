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

console.log('');
console.log('e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
EOF
echo "e2e exit: $?"
