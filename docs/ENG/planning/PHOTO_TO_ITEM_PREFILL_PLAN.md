# Photo-to-Item Prefill Plan

## 1. Decision Summary

Using a photo to prefill an item form is feasible within Jangoing, but it
should not be treated as a small extension of photo upload alone. It is a
separate vertical slice that connects recognition proposals to an editable item
draft.

The intended flow is:

1. the user takes a photo of an item;
2. the system proposes item-name, category, and some auxiliary fields;
3. the form is prefilled with those proposals;
4. the user edits and saves.

Core rule:

- a photo alone must not create inventory events automatically;
- model output is always an editable draft;
- inventory projection changes only after user confirmation.

## 2. Problem This Solves

Current item entry friction comes from repeatedly typing:

- item name
- category
- sometimes unit
- sometimes expiry-related values

Photo-based prefill can reduce part of that burden. For packaged groceries,
`barcode + OCR + catalog lookup` is usually more practical than pure image
classification.

The real value of this feature is not "automatic recognition" by itself. It is:

1. reducing entry time; and
2. creating real capture/confirmation data for future vision evaluation and
   training.

## 3. Connection to the Current System

The project already has:

- item photo UX in Inventory and `Set Up My Fridge`;
- household-scoped `item_media` storage;
- a product rule that inventory must not change before user confirmation.

The current item-form surface already revolves around:

- `item_name`
- `quantity`
- `unit`
- `location`
- `expiration_date`
- `low_threshold`
- `category`
- `thumbnail_url`

So this feature should not invent a separate item schema. It should prefill a
subset of already-existing form fields.

## 4. Immediate Gaps in the Current Implementation

Three gaps need to be addressed.

### 4.1 A dedicated add-item draft flow

The project has Inventory edit and `Set Up My Fridge`, but not yet a strong
"take photo, create new item draft, then fill the form" general add flow.

### 4.2 A recognition request/response layer

Current photo upload does not yet store:

- recognition request ids
- candidate lists
- confidence
- evidence source
- user acceptance / rejection / replacement logs

### 4.3 A vision-capable stored variant

The current path is thumbnail-centric. Future OCR, barcode crops, and catalog
retrieval will need more than the square UI thumbnail. At minimum, one of these
should exist:

- retained original image; or
- a larger display variant

Original retention must not be opened without explicit retention and consent
policy.

## 5. Recommended Product Scope

The first scope should be **photo-to-draft prefill**.

### Included

- single-item photo capture
- square crop or display crop
- candidate generation from vision/OCR/barcode
- prefill for a subset of item-form fields
- manual user edits
- save only after confirmation

### Excluded

- photo-only automatic inventory creation
- full-fridge multi-object scene analysis
- automatic quantity estimation
- automatic low-threshold calculation
- automatic spoilage judgment
- automatic expiry confirmation

## 6. Recommended User Flows

### 6.1 New item add flow

```text
Add Item
→ Take Photo
→ crop preview
→ recognition request
→ top candidate / OCR text / barcode result
→ item form prefill
→ user edits
→ Save
→ inventory event created
```

Recognition should open and assist the form, not replace it.

### 6.2 `Set Up My Fridge` draft flow

```text
empty draft row
→ take photo
→ crop
→ candidate proposal
→ name/category/unit partially prefilled
→ user checks quantity/location/expiry
→ setup save
```

This is the best first landing zone because the draft-row structure already
exists.

### 6.3 Existing item edit

For an existing inventory item, artwork replacement and recognition-driven
metadata suggestion should stay separate.

- if the user only wants to replace artwork, recognition should not be forced;
- recognition should be an optional "suggest update" path.

## 7. Which Fields Should Be Prefilled

Not every field should be treated equally.

### 7.1 Good first prefill targets

- `item_name`
  - first as a user-visible display-name candidate before final canonicalization
- `category`
  - coarse category proposals are useful
- `unit`
  - only as a weak suggestion when packaging or catalog evidence is clear

### 7.2 Candidate-only fields

- `expiration_date`
  - OCR should surface it only as a candidate, never as a confirmed value
- `brand`
  - current inventory schema does not center brand, so it should first appear
    as helper information
- `barcode`
  - useful as evidence/debug data, not as a core inventory form field

### 7.3 Fields that should not be auto-prefilled

- `quantity`
  - a default of `1` remains safer
- `location`
  - storage location is not reliably inferable from the photo
- `low_threshold`
  - this is closer to household usage preference than vision inference

## 8. Recommended Recognition Strategy

The first version should prefer **signal fusion** over a pure image classifier.

Recommended order:

1. barcode decode
2. OCR text extraction
3. general vision candidate
4. catalog lookup
5. reranking with household/item history

For groceries, packaging text and barcode often outperform image-only
classification.

## 9. Proposed API Shape

### 9.1 Recognition request

```text
POST /recognition-requests
```

The request should reference either:

- a photo blob before final upload; or
- an already stored media id.

### 9.2 Example response

```json
{
  "request_id": "uuid",
  "prefill": {
    "display_name": "Greek Yogurt",
    "canonical_item_name": "greek_yogurt",
    "category": "dairy_eggs",
    "unit": "cup",
    "expiration_date_candidate": null
  },
  "candidates": [
    {
      "display_name": "Greek Yogurt",
      "canonical_item_name": "greek_yogurt",
      "confidence": 0.84,
      "evidence": ["barcode", "ocr", "catalog"]
    }
  ],
  "ocr_text": ["GREEK", "YOGURT"],
  "barcode": "0123456789012",
  "requires_confirmation": true
}
```

## 10. Recommended Storage and Logging

### 10.1 Media

Longer term, `item_media` should clearly separate:

- `thumbnail` variant
- `display` variant
- optionally `original` variant

### 10.2 Recognition request log

A separate table or logging layer should record:

- `recognition_request_id`
- media reference
- model/version
- top-k candidates
- evidence source
- chosen value
- whether the user manually overrode the suggestion
- dismissed / unknown outcome
- latency

This is necessary for later evaluation and product-quality review.

## 11. Privacy and Consent

This feature raises higher privacy requirements than artwork alone.

Two distinct permissions must stay separate:

1. consent to store the image as item artwork;
2. consent to use the image or recognition outcome for model improvement.

They must not be merged. If original retention is introduced, the project must
document:

- which variants are stored;
- whether EXIF is removed;
- how deletion propagates through R2 and D1;
- retention period;
- export and deletion request path.

## 12. Suggested Implementation Phases

### Phase 0: contract and privacy gate

- define recognition request/response schema
- draft consent and retention policy
- decide whether original storage is allowed

### Phase 1: fridge-setup prefill pilot

- capture photo from an existing draft row
- request recognition after crop
- prefill only `name/category/unit`
- keep the user responsible for the remaining fields

This is the lowest-risk pilot and best fits the current structure.

### Phase 2: dedicated add-item flow

- add an Add Item entry point
- create a new item draft from the captured photo
- add top-k candidate confirmation UI

### Phase 3: OCR/barcode/catalog improvements

- barcode decode baseline
- OCR extraction baseline
- catalog retrieval integration
- evidence-source ablation evaluation

### Phase 4: adaptation and evaluation

- household-specific reranking
- correction-log analysis
- frozen evaluation set construction

## 13. Success Criteria

The first version should not be judged by raw recognition accuracy alone.

- does the user complete the item form faster?
- does manual typing decrease?
- is candidate dismissal kept at an acceptable level?
- do wrong prefills avoid becoming a net UX cost?
- does recognition stay blocked from automatically creating inventory events?

## 14. Recommended Conclusion

Photo-based item-form prefill is a realistic next step for this project, but
only under these conditions:

- recognition remains a draft prefill;
- inventory writes still happen only after explicit user confirmation;
- high-resolution or original retention is decided together with privacy policy.

The best first implementation is a **photo-based prefill pilot inside `Set Up My
Fridge` draft rows**, followed later by a general Add Item flow.
