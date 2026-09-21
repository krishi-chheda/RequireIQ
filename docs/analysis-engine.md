# The analysis engine

Developer notes on how RequireIQ reads a document. Everything here lives in
`src/lib/ai/engine/` and is pure, synchronous and dependency-free.

The organising constraint: **a statement shown in the register must exist,
word-for-word, in a document, at the offsets recorded against it.** Every design
decision below follows from that.

---

## 1. Chunking (`text.ts`)

Structure-aware, not fixed-width. The locator that comes out of chunking is what
a consultant reads in a citation, so `Section 4.2` beats `chunk 17`.

| Input | Break on | Locator |
|---|---|---|
| Transcript | Speaker turn | `KENJI MORI, turn 4` |
| Specification | Markdown heading | `4.2 Capacity and throughput` |
| Email | Header block, then paragraphs | `Email body` |
| Notes | Blank line | Nearest heading |

**Speaker turns have two forms.** A speaker is introduced once with their role —
`KENJI MORI (Platform Engineering Lead, Meridian Bank):` — and afterwards appears
bare: `KENJI MORI:`. Handling only the first form is a bug with two symptoms:
`AISHA BELL:` stays glued to the front of register entries, and attribution is
lost for most turns in the document. One regex, `SPEAKER_TURN`, handles both and
is shared with the extractor so the two cannot drift apart.

All-caps names are what keeps the bare form off email headers (`From:`,
`Subject:`) and ordinary prose. Whether speaker turns are read at all is a
document-level decision taken before chunking — see *Structure recovery* below.

## 2. Structure recovery (`structure.ts`)

PDF-derived text has no Markdown. Without this step the chunker falls through to
paragraph splitting and every citation in a 34-page RFP collapses to the
document default, which is the same as having no citation at all.

Three things happen, in this order, and all of them happen to the **document**,
never to an extracted statement. `chunkDocument` cleans before it computes
offsets, and `ingest.ts` and `seed.ts` store the *cleaned* text, so the
register's contract — the recorded range quotes the statement back verbatim —
still holds. Cleaning is idempotent, which is what lets both call it.

**Page furniture goes by repetition, not by pattern.** A running header or
footer is whatever line appears three or more times in a document of at least
eight lines and is under 120 characters. Nobody can enumerate the header of an
arbitrary RFP; repetition is the property that actually distinguishes furniture
from prose. Bare page numbers go by pattern as well, and list items are exempt
from the furniture count — running headers are never bulleted, and identical
bulleted text repeats legitimately.

**Headings are read one line at a time, in a fixed order**: numbered clause
(`3.2.1 Capacity and Throughput`), lettered clause (`C. SCOPE OF WORK`), all
caps, then `Title case ending in a colon:`. The order is pinned by test.

All four forms share one discriminator, `isLabel`, in every clause — and that
uniformity is the rule rather than an accident, because a per-form exception is
exactly how a numbered line became a heading while the identical unnumbered line
stayed body. A label has a title-cased first word, at most ten words, no
dangling function word at the end, no internal sentence boundary (asked of
`splitSentences`, the same splitter the rest of the engine reads sentences
with), and no mid-clause modal.

Getting this wrong is not cosmetic: `chunkDocument` drops a heading line from
the body it chunks, so a wrapped obligation clause misread as a heading is
**deleted** from the document the extractor sees, and its continuation is then
cited to a fragment. Each clause of `isLabel` was measured against both sample
RFPs, the synthetic fixture and the demo corpus; the numbers behind the
ten-word cap are in the source comment.

**Transcript detection is a decision about the document, not about a line.**
The per-line speaker pattern cannot tell `KENJI MORI:` from `E-MAIL:` — both are
capitals followed by a colon — so applied per line it invents a speaker out of
every RFP form label, and the register then attributes procurement boilerplate
to a person who does not exist. The distinguishing fact is repetition plus
shape: a document is a transcript when at least two distinct multi-word labels
each appear at least twice. Multi-word matters on its own, because a two-contact
signature block repeating `NAME:` / `TITLE:` clears the repetition test by
itself.

## 3. Sentence splitting (`text.ts`)

Deliberately conservative. A full stop ends a sentence only when followed by
whitespace and an uppercase letter, digit or quote — and never inside a decimal
or after a known abbreviation.

Naive splitters destroy `99.99%` and `$200,000`. A destroyed number is a missed
conflict, so this is not a cosmetic concern. A blank line is also a hard break,
because bullet lists and note-form documents often have no terminal punctuation.

Offsets are absolute into the document throughout.

## 4. Quantity parsing (`text.ts`)

Five dimensions, each normalised to a canonical unit so two statements can be
compared arithmetically:

| Dimension | Canonical | Examples |
|---|---|---|
| `money` | currency | `$200,000`, `£1.2m`, `200k dollars` |
| `duration` | seconds | `500 milliseconds`, `seven years`, `12-week`, `30 days` |
| `percent` | percent | `99.99%`, `95 per cent` |
| `count` | items | `10,000 concurrent users`, `2,000 activations` |
| `date` | epoch ms | `2 March 2027` |

Written numbers (`seven`) are handled. Typed matches claim their span first, so a
bare-count pass cannot double-count a figure already read as money.

`boundDirection()` reads the comparison that governs a quantity from the 60
characters before it: `must not exceed $200,000` is a **maximum**, `must support
10,000 concurrent users` is a **minimum**. Without this the capacity/budget
detector cannot tell a floor from a ceiling, and would fire on both.

All numeric formatting is pinned to `en-US`. Left to the default locale, a server
in India renders `$2,00,000` in a client-facing conflict report.

## 5. Extraction (`extract.ts`)

An **obligation detector**, not a summariser.

```
chunk → sentences → obligation modal? → filters → verbatim statement + offsets
```

Seven modal patterns, tried in order, each carrying how binding it is: `must
not`/`shall not` (1.0), `must`/`shall` (1.0), `is required to` (0.9), `needs to`
(0.7), `should` (0.6), `will be able to`/`can be` (0.3), and the **commitment
modal** (0.5).

The commitment modal is the RFP addition. A buyer commits with `will`, not with
`shall` — *"The City will provide test data within ten working days of contract
award"* is a real obligation on the acquiring party, and without it the register
captures only the obligations pointing at the supplier. A bare `will` also
swallows narrative (*"the two documents will appear to disagree"*), so the
pattern is anchored at the sentence subject and guarded by `hasActorSubject`,
which reuses the `bindsOn` cue list rather than keeping a second copy of it. The
guard also admits the regular passive — *"Proposals will be evaluated based upon
…"* — because an obligation stands whoever performs it, and where nobody is
identifiable `classifyBindsOn` answers `unknown`.

Three rejection filters, each recording its reason so the UI can show what was
*not* extracted and why:

- **Interrogative** — a question, not an obligation.
- **Facilitation note** — `I will capture that`, `no decision taken`, `under review`.
- **No domain subject** — *"It needs to feel instant"* mentions no buildable thing.

Each rejection also carries a structural `RejectionKind`, `"vocabulary"` or
`"interrogative"`. The coverage metric below has to ask *"was this rejected on
vocabulary?"*, and comparing a displayed sentence against one exact prose string
means any reworded reason silently scores as covered. The facilitation filter
counts as vocabulary too: it is a word list under a different label.

### The coverage metric (`obligationCoverage`)

The P1 success criterion — every shall/must sentence is either extracted or
rejected for a reason other than vocabulary — measured **per sentence**, over
exactly the sentence stream extraction saw. It is not a ratio of captured items
to occurrences of "shall": nothing in that checks that the items captured *are*
those sentences, and on real documents it measured above 100%.

**Its known blind spot, deliberately left latent:** the denominator is counted
downstream of `chunkDocument`, so a sentence wrongly read as a heading is
dropped from *both* sides of the ratio and scores as perfect coverage. It stays
latent because `isLabel` forbids a whole shall/must line from becoming a
heading; closing it means counting over the raw text, which is separate work.

`npm run probe:rfp` prints this metric per document: 75% (67/89) on the Mercer
Island RFP and 81% (70/86) on Santa Fe County, against a target of 75%. It also
prints every missed sentence, so the next improvement is chosen from evidence.

**Confidence is a reading confidence**, not a judgement about whether the
requirement is a good idea. It starts at 0.5, rises with modal strength, present
quantities, resolved attribution and document formality, and falls when the
speaker hedged (`I think`, `probably`) or the sentence is very long.

**Constraints are separated from requirements.** A requirement describes
something the system must do; a constraint describes a boundary the solution must
fit inside. This split matters for conflict detection: the interesting
contradictions are almost always a requirement pushing against a constraint
somebody else set, in a document its author never read.

## 6. Classification (`classify.ts`)

Lexicon-scored across nine classes, each cue weighted 1–3. Chosen over a learned
classifier for two reasons that matter in consulting: it needs no labelled
training data for a new engagement, and every decision comes with the terms that
produced it, so a business analyst can argue with the classifier rather than
trusting it.

Quantified statements get a nudge toward `performance` and `operational` — a
sentence carrying a duration or a percentage is more likely a measurable
non-functional characteristic than a plain capability.

Priority is read from the **modal verb**, per ISO/IEC/IEEE 29148: `must`/`shall`
is binding, `should` is advisory, `may`/`could` is discretionary. Reading the
modal rather than guessing importance keeps the register defensible in review.

Every cue is anchored at a word start and matched as a prefix from there, so an
inflection still counts (`record` → `records`, `integrat` → `integration`) but a
cue landing inside an unrelated word does not. Plain substring matching
classified *"downloading the solicitation"* as performance on `load` and *"a
seamless transition"* as compliance on `aml`. Four cues (`access`, `design`,
`event`, `sustain`) are themselves the prefix of a colliding word, so anchoring
cannot help them and they are spelled out as explicit whole-word inflections.

## 7. Who an obligation binds (`binds-on.ts`)

A dimension **orthogonal to requirement type**, not an extension of it: a
security obligation on the supplier and one on the system are both security.
Five values — `system`, `supplier`, `bidder`, `buyer`, `unknown` — and the
matched cue is stored alongside, so the badge can explain itself.

The earliest cue in the sentence wins, because the grammatical subject comes
first: *"The Contractor shall configure the system"* binds the supplier, not the
system. Two sigils tune a cue: `^term` matches only in subject position (a bare
`city` appearing later usually names what a clause is *about* rather than who it
binds), and `term$` refuses inflections (`the service$`, because "the services"
throughout a county contract means the Contractor's services).

Document cues — `proposal`, `bids` — classify but cannot commit: a proposal is
the bidder's, so *"Proposals must be submitted by 3pm"* binds the bidder. They
are excluded from `AGENT_SUBJECT`, the export the extractor's commitment-modal
guard asks, because a document is not an agent and including them let
announcements through as obligations.

**Why this replaced a vocabulary judgement rather than extending one.** The
rejection filter asked *"does this sentence contain a word I recognise?"*, which
is a list that will never be complete — of the 190 requirements the two sample
RFPs yield today (87 Mercer Island + 103 Santa Fe County, printed by `npm run
probe:rfp`), 113 contain no word from `DOMAIN_NOUNS` as it stood before the
procurement vocabulary was added, so every one of them was being rejected for
the same reason. The question here is
*"can I identify who this binds?"*, and `unknown` is a designed answer that
surfaces for review instead of discarding the statement. `classifyBindsOn`
therefore **never gates extraction**.

The domain-noun list still exists in `extract.ts` as the last rejection filter,
widened with procurement vocabulary. It does a narrower job than before —
telling conversational filler from a statement about a buildable thing — and it
is no longer asked who the obligation binds.

## 8. Quality analysis (`ambiguity.ts`)

Seven finding types. Every one names the exact span, explains the problem in the
vocabulary a BA uses, and proposes a **measurable** rewrite:

| Kind | Fires on |
|---|---|
| `vague_term` | 37 patterns, each with the dimension it fails to specify |
| `unquantified` | An obligation with no threshold and no objective test |
| `missing_acceptance_criteria` | A binding `must` with nothing to assert against |
| `undefined_actor` | Pronoun subject — cannot be allocated to a team |
| `compound_requirement` | Two obligations in one — cannot be partially accepted |
| `unverified_assumption` | `it is assumed`, `presumably` |
| `reported_speech` | *"Tom flagged that the system must…"* |

`reported_speech` is the interesting one. Rejecting these would lose a real
obligation; rewriting them would break the verbatim contract. So the statement is
kept as-is and the reviewer is told to restate it directly.

`secure` and `necessary` are suppressed when the statement already contains a
measurable clause — they are only vague when they *are* the test.

`qualityScore` is a deduction from 1, not a model output: a reviewer can
reconstruct it from the findings list.

## 9. Similarity (`similarity.ts`)

TF-IDF with cosine distance over the project's own statements. Smoothed IDF so a
term present everywhere still contributes a little.

Chosen over a hosted embedding model because it needs no network call, it is
identical on every run, and — most importantly — the terms that produced a score
can be shown to the reviewer. A reviewer who cannot see why two requirements were
linked will not trust the link.

**The honest ceiling:** it matches vocabulary, not meaning. Two requirements
saying the same thing in different words score low. The conflict detectors
compensate by combining this signal with quantity and polarity analysis rather
than relying on it alone.

## 10. Conflict detection (`conflict.ts`)

Five detectors. Each states the arithmetic or linguistic pattern that made it
fire, and each phrases its output as a tension to validate rather than a verdict.

The product may say *"these two numbers do not obviously fit together"*. It may
never say *"this is impossible"*, because it does not know the engagement's
engineering context well enough. Every conflict therefore carries a
`validationQuestion` — the thing a human has to go and check. A test asserts the
word "impossible" never appears in a conflict explanation.

### Capacity versus budget

The reference scenario. Sizes a minimum capacity target against a maximum spend
cap using `SIZING_MODEL`, which is **exported and shown with every input**:

```
10,000 users / 250 per instance      = 40 instances at peak
× 1.3 headroom                        = 52 instances
× 2 multi-zone (from the availability target)
                                      = 104 instances
× $220/instance/month × 12            = $274,560 compute
× 1.25 storage, network, observability
                                      = $343,200 first-year total
```

Severity scales with the ratio to the cap. A platform engineer can disagree with
a *number* rather than with a black box — which is the whole point of printing
the workings.

### Opposing obligations

Polarity (retain vs delete) **plus** a data noun on both sides **plus** a period
ratio of 3× or more. Any one of those alone produces noise.

Lexical overlap is reported when present but deliberately **not required**:
retention and deletion rules are written by different functions in different
vocabulary, and that mismatch is precisely why nobody notices the contradiction.
Gating on shared wording would suppress the one case the detector exists for.

### Availability versus recovery

Converts an availability percentage into its monthly downtime budget and compares
it with the stated RTO. 99.99% allows 4.3 minutes a month; a 4-hour RTO spends
55× that in a single incident. Both statements are individually reasonable —
together they describe two different service tiers, and the programme has not
chosen.

### Fixed date versus preceding duration

Only fires on a **committed** date (`must go live on`), not any date mentioned in
passing, and only against a duration the statement says must elapse first.
Tightening both cues was necessary: `requires a` alone matched sentences that
required a thing and mentioned an unrelated period in the same breath.

### Topical overlap with divergent quantity

Overlap ≥ 0.30 **and** a shared dimension with values differing by ≥ 20%. Overlap
alone is a duplicate, not a conflict.

### De-duplication

The same characteristic is routinely stated in several documents — an
availability target in a transcript and again in the specification — so a naive
pass reports one real problem three times. That inflates every dashboard count
and, worse, trains a reviewer to skim.

Each detector emits a `dedupeKey` identifying the underlying *tension*
(`capacity-budget:10000:200000`) independent of which record pair expressed it.
The surviving conflict keeps the highest-severity, highest-confidence pair and
lists the others in `alsoStatedIn`. On the demo corpus this collapses 11
raw detections into 7 real ones.

## 11. Coverage gaps (`coverage.ts`)

The hardest question in discovery is not *"is this requirement wrong"* but
*"what did nobody say"*.

Answered by **checklist, never by generation** — a generated list of missing
requirements is indistinguishable from invention. Each rule has trigger terms
(has the project entered this territory?) and satisfaction patterns (did it then
say anything?). A rule that does not trigger produces nothing: the detector never
claims a project needs something it has shown no sign of needing.

## 12. Relationship inference (`coverage.ts`)

Edges from lexical overlap, typed by strength and language:

| Score | Edge |
|---|---|
| ≥ 0.35 | `duplicates` — likely two records of the same requirement |
| 0.18–0.35 + sequencing language | `depends_on` |
| 0.18–0.35, same class | `supports` |

Below 0.18 no edge is drawn. A graph that connects everything to everything tells
a reviewer nothing. `contradicts` edges come from conflicts and are owned by that
table.

## 13. The assistant (`../local.ts`)

Retrieval and aggregation over existing records. **No generative step at all** —
every sentence is either a template filled with counted records, or text quoted
from a source document. It cannot invent a stakeholder, a budget or a
requirement, because it has no mechanism for producing one.

Eleven intents route to typed queries (conflicts, missing acceptance criteria,
scope movement, by stakeholder, by type, explain a reference). The fallback is
TF-IDF retrieval with **two gates**: cosine score above 0.12 *and* at least two
shared content terms.

Both gates are needed. A single incidental word match lets a question about a
chief executive's home address surface a requirement about postcode *address*
validation. Two distinct shared terms turns that into an honest *"Insufficient
evidence"*.

---

## Known gaps

Accepted limitations, established by measurement rather than guessed at. They
are here so a reader knows what the register does *not* contain.

- **List items under a modal-bearing stem are not extracted individually.**
  *"The selected firm shall provide the following services:"* is registered as
  one obligation; the a)/b)/c) items beneath it carry no modal of their own, so
  each named service is absent from the register. Attaching list items to their
  stem is a feature, not a filter change.
- **Neither sample RFP yields a constraint.** `constraints 0` on both — they
  state no spend cap. The capacity-versus-budget detector is therefore exercised
  by the demo corpus and the synthetic fixture, and not by real procurement
  text. Absence of a finding here is the documents, not the detector.
- **Roughly a fifth to a quarter of shall/must sentences are still missed** —
  75% (67/89) Mercer Island, 81% (70/86) Santa Fe County. The probe prints each
  missed sentence; most are contract boilerplate about the resulting contract
  rather than about the system.
- **`obligationCoverage` cannot see a sentence lost to a heading** — see the
  blind spot under *Extraction*.
- **`acceptance_criteria` is not refreshed when a reviewer typed it.** Editing a
  statement re-derives every field that quotes it, but that column has no
  per-field provenance: `deriveAcceptanceCriteria` only ever returns the
  statement verbatim or null, so a copy of the *old* statement is treated as
  derived and refreshed, and anything else is treated as human and left alone.
- **Two documents, one jurisdiction.** The engine is measured against two US
  local-government software RFPs. Clause numbering, heading case and the
  vocabulary naming the contracting parties are local conventions;
  `npm run probe:rfp` is how you find out what a document from elsewhere scores
  before trusting its register.

---

## Adding a detector

1. Write it in `conflict.ts` as `(subjects) => DetectedConflict[]`.
2. Give it a `dedupeKey` naming the tension, not the record pair.
3. Hedge the explanation and write a real `validationQuestion`.
4. Add the triggering text to a document in `demo-data/`, run
   `node scripts/sync-demo-data.mjs`, and assert it in `pipeline.test.ts`.
5. Add a negative test — the case where it must *not* fire.

Step 5 is the one that gets skipped and the one that matters. A detector without
a negative test becomes a detector that fires on everything.
