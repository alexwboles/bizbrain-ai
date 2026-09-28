#!/usr/bin/env bash
# BizBrain AI smoke tests — 12 checks. Fails fast on first failure.
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

echo "== bizbrain-ai smoke =="

# 1-5: files exist
for f in index.html css/style.css js/logic.js js/app.js README.md; do
  if [ -f "$f" ]; then ok "file exists: $f"; else bad "missing file: $f"; fi
done

# 6-7: JS syntax
if node --check js/logic.js 2>/dev/null; then ok "logic.js syntax"; else bad "logic.js syntax"; fi
if node --check js/app.js 2>/dev/null; then ok "app.js syntax"; else bad "app.js syntax"; fi

# 8-12: logic checks in Node
node << 'EOF'
const Z = require('/home/hatch/workspace/bizbrain-ai/js/logic.js');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  PASS: ' + m); };
const bad = (m) => { fail++; console.log('  FAIL: ' + m); };

// 8: tokenize strips stopwords + punctuation
const toks = Z.tokenize('What is the refund policy?');
(toks.indexOf('refund') !== -1 && toks.indexOf('policy') !== -1 && toks.indexOf('what') === -1 && toks.indexOf('the') === -1 && toks.indexOf('is') === -1)
  ? ok('tokenize: keeps content words, drops stopwords') : bad('tokens=' + JSON.stringify(toks));

// 9: ask ranks the right doc first with an excerpt
const docs = Z.sampleDocs();
const r = Z.ask(docs, 'how do I get a refund', 3);
(r.answers.length > 0 && r.answers[0].title === 'Refund policy' && r.answers[0].excerpt.length > 20)
  ? ok('ask: refund question -> Refund policy first, excerpt present') : bad('ask=' + JSON.stringify(r.answers.map(a => a.title)));

// 10: no-match question flagged; empty query handled
const r2 = Z.ask(docs, 'quantum tunneling warranty', 3);
const r3 = Z.ask(docs, '   ', 3);
(r2.noMatch && r3.noMatch && r3.reason === 'empty') ? ok('ask: nonsense -> noMatch; blank -> empty') : bad('nomatch handling');

// 11: gaps collapse repeats; autoFAQ produces sourced entries
const gaps = [];
Z.logGap(gaps, 'Do you fix iPhones?');
Z.logGap(gaps, 'do you fix iphones?');
Z.logGap(gaps, 'What are hours?');
const sum = Z.gapSummary(gaps);
const faqs = Z.autoFAQ(docs, 5);
(sum.length === 2 && sum[0].count === 2 && faqs.length === 5 && faqs.every(f => f.source && f.a.length > 10))
  ? ok('gapSummary collapses dupes (2 groups, top=2x); autoFAQ 5 sourced entries') : bad('gaps/faqs');

// 12: validation + import/export round-trip
const bad1 = Z.validateDoc({ title: '', body: 'short' });
const good = Z.addDoc([], { title: 'T', body: 'This body is definitely long enough to pass validation checks.' });
const exp = Z.exportJSON([{ id: 'x', title: 'T', body: 'Body text here is long enough.', tags: [] }]);
const imp = Z.importJSON(exp);
const impBad = Z.importJSON('not json{{{');
(bad1.length === 2 && good.ok && imp.ok && imp.docs.length === 1 && !impBad.ok)
  ? ok('validateDoc/addDoc/export/import all behave') : bad('doc lifecycle');

console.log('node checks: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
EOF
[ $? -eq 0 ] && ok "node logic checks" || bad "node logic checks"

echo ""
echo "smoke: $PASS passed, $FAIL failed"
exit $FAIL
