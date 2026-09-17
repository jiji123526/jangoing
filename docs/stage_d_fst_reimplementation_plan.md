# jangoing Stage D → Real FST: Reimplementation Plan

> Goal 1: literally satisfy the Language Engineer preferred qualification "writing grammars and building FSTs."
> Goal 2: formalize jangoing's Stage D normalization ("oat milk" -> oat_milk, "a couple" -> 2) as a
> deterministic, rule-based finite-state transducer.
> Tool: Pynini (Google, OpenFst-based) — Python-native, industry standard for text normalization.
> Estimated effort: ~3-4 days part-time.

---

## Why FST

jangoing's Stage D maps surface forms to canonical forms — exactly what an FST does (reads input,
transitions states, emits output). The logic already exists as imperative code; rewriting the core
rules as a declarative FST grammar makes "built FSTs" literally true.

## Phase 1 — Catalog Stage D rules (0.5 day)

| Rule type | Example | FST mechanism |
|---|---|---|
| Surface -> canonical lexical map | oat milk -> oat_milk | string mapping (pynini.cross) |
| Synonym merge | drinks/beverages -> beverage | union + cross |
| Plural -> singular | apples -> apple | suffix rewrite |
| Quantity word -> number | a couple -> 2, two -> 2 | lexical mapping |
| Whitespace/hyphen normalize | non-fat milk -> non_fat_milk | character-level rewrite |
| Lowercase | Coke -> coke | case-folding closure |

## Phase 2 — Lexical FSTs (1 day)

```python
import pynini

item_map = pynini.string_map([
    ("oat milk", "oat_milk"),
    ("whole milk", "whole_milk"),
    ("coke", "coke"),
    ("diet coke", "diet_coke"),
    ("greek yogurt", "greek_yogurt"),
])

quantity_map = pynini.string_map([
    ("a couple", "2"),
    ("two", "2"),
    ("a dozen", "12"),
])
```

## Phase 3 — Rule-based rewrite FSTs (1-2 days)

```python
from pynini.lib import rewrite, pynutil

sigma = pynini.union(*"abcdefghijklmnopqrstuvwxyz _-").closure()

# space/hyphen -> underscore
space_to_underscore = pynini.cdrewrite(pynini.cross(" ", "_"), "", "", sigma)

# naive depluralize: drop trailing s
depluralize = pynini.cdrewrite(pynutil.delete("s"), "", "[EOS]", sigma)

# compose rules
normalizer = space_to_underscore @ depluralize
```

## Phase 4 — Validate against existing normalizer (0.5 day)

```python
for surface, expected in test_cases:
    out = rewrite.one_top_rewrite(surface, normalizer)
    assert out == expected, f"{surface}: {out} != {expected}"
```

Regression parity with the current imperative normalizer supports the existing narrative:
"a deterministic contract the trained model can later replace."

## Phase 5 — Reflect in resume/portfolio (0.5 day)

- Resume Skills: add **Pynini / FST**.
- jangoing page Stage D: label it "finite-state normalization (Pynini)".
- Commit a small `normalization_fst.py` + tests to GitHub as literal proof of "built FSTs".

## Strategic value

- Directly hits preferred qualification "writing grammars and building FSTs."
- Reinforces the Python-scripting basic qualification (Pynini is Python).
- Strengthens the "deterministic contract" story with a formal FST.
- Great interview material: why FSTs, why rules before a model.
- Reusable for Q-Bank, GOLA.IO normalization too.

## Cautions

- Don't over-build. A few core normalization rules as an FST is enough for "built FSTs."
- Honesty: only add "FST"/"Pynini" to resume/portfolio AFTER this is actually implemented.
- Learning refs: Pynini official tutorial; Jurafsky & Martin, "Speech and Language Processing," ch.2 (FSTs/morphology).

## Install
- `pip install pynini` (conda recommended for the OpenFst dependency).
