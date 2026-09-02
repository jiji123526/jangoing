# Item Media and Vision Recognition Plan

## 1. Decision Summary

User-captured photos in Jangoing will be used in two stages.

1. **Current goal: artwork**
   - The user takes an item photo from Inventory or from initial fridge setup.
   - The photo is stored as the primary artwork for the canonical `item_name`.
   - It is reused in Inventory, Home Recently Updated, Search, and Shopping List.
   - The photo does not automatically change inventory quantity or status.
2. **Ultimate goal: vision recognition**
   - The same capture flow proposes candidate item, brand, category, and condition values.
   - Barcode and OCR can be added as separate signals.
   - Model output is always a reviewable proposal and does not create inventory
     events before user confirmation.

This order was chosen because photo storage and rendering create immediate UX
value on their own, while also letting the project safely build the real capture
distribution and confirmation feedback needed for future vision modeling.

## 2. Product Principles

- Do not bundle photo upload and vision recognition into one feature.
- Store image bytes in R2 and searchable metadata plus item relations in D1.
- Link photos to the canonical item, but preserve the specific item name the user sees.
- Items without a user photo continue using the existing category-gradient artwork.
- Even with high model confidence, do not mutate inventory automatically.
- Do not automatically use user photos for model training. That requires
  separate consent and retention policy.
- CORS is not authentication. Do not expose the production upload endpoint
  without either authentication or a restricted household upload token.
- Do not store EXIF or location metadata.

## 3. Scope

### Included in Phase 1

- select one image from mobile camera or photo library
- client-side orientation correction, resize, crop preview, WebP/JPEG re-encode
- user photo upload, replacement, and removal
- one primary artwork image per item
- artwork fallback chain for Inventory, Home, Search, and Shopping List
- validation of file type, decoded image, dimensions, and byte size
- upload rate limiting and ownership validation

### Excluded from Phase 1

- automatic item creation from photo alone
- whole-fridge image analysis for multi-object scenes
- automatic quantity estimation
- automatic expiry confirmation
- automatic condition or spoilage classification
- model fine-tuning from user photos
- public gallery or cross-household photo sharing

## 4. Artwork User Flow

### Inventory

```text
Edit
→ select item
→ Add Photo or Change Photo
→ Take Photo / Choose from Library
→ square crop preview
→ Save
→ primary artwork updated
```

Photo replacement must be able to fail or retry independently from quantity,
expiry, and threshold edits. Image upload success and inventory event save
should not be unnecessarily tied into the same transaction.

### Set Up My Fridge

During initial setup, each item can carry an optional photo draft. But the
atomic inventory save for setup must not depend on image upload.

Recommended order:

1. keep photo preview and local draft in the browser
2. complete the fridge setup event transaction first
3. upload photos for the successfully saved canonical items
4. if some uploads fail, keep the setup and retry only those photos

### Display Priority

```text
user primary photo
→ verified external catalog photo
→ category gradient artwork
```

The same primary image should be used across these frame sizes:

- Inventory artwork: `102×102px`
- Home Recently Updated: `160×160px`
- Home attention or compact row: `48×48px`
- Shopping/Search result: `48×48px`

Use thumbnail variants so the original image is not downloaded every time.

## 5. Storage Structure

### R2

Recommended object keys:

```text
households/{household_id}/items/{item_name}/{media_id}/display.webp
households/{household_id}/items/{item_name}/{media_id}/thumb.webp
```

Even if the MVP is single-household, include the household namespace in the key.
That avoids a later object migration when authentication is introduced.

Recommended image output:

- display: long edge up to `1200px`, WebP quality around `0.80`
- thumbnail: square `480×480px`, WebP quality around `0.78`
- maximum allowed size after upload processing: `1MB` per file
- do not allow animation, SVG, or arbitrary binary upload

Do not retain unlimited originals just for vision input. If later models need
higher resolution, add a separate variant only with an explicit retention policy.

### Draft D1 Migration

The expected migration is `0012_create_item_media.sql`. `0011` was already used
for inventory category override.

```sql
CREATE TABLE item_media (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  display_object_key TEXT NOT NULL,
  thumbnail_object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  source TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_item_media_household_item
  ON item_media(household_id, item_name);

CREATE UNIQUE INDEX idx_item_media_one_primary
  ON item_media(household_id, item_name)
  WHERE is_primary = 1;
```

Initial `source` values:

- `user_capture`
- `user_library`
- `external_catalog`

Photos do not go into the inventory event payload. `item_media` is item
presentation metadata and must not modify quantity or state projection. If
needed, upload and delete audit events can be recorded in a separate media-audit
table.

## 6. Draft API

### Artwork API

```text
GET    /item-media?item_names=milk,oat_milk
POST   /items/{item_name}/media
DELETE /items/{item_name}/media/{media_id}
POST   /items/{item_name}/media/{media_id}/primary
```

For the first MVP, the browser can send `multipart/form-data` capped at 1MB
after client-side processing, and the Worker can validate it before forwarding
to R2. If scale grows, this should move to an upload-intent plus short-lived
signed upload URL flow.

GET responses should return usable media URLs, dimensions, and version info
rather than raw object keys. Include the URL or `updated_at` in cache keys so a
replaced image does not leave stale content visible.

### Required Server Validation

- confirm the authenticated household can access the item
- enforce size limits on both request body and decoded image
- allowed MIME types: `image/jpeg`, `image/webp`, and optionally `image/png`
- verify magic bytes and actual decode results
- validate width and height upper bounds
- strip EXIF through re-encode
- handle duplicate upload by hash
- per-household rate limiting
- clean up created R2 objects if D1 write fails
- record cleanup retries if R2 delete fails

## 7. Authentication and Privacy Gate

The current one-household MVP has no user authentication. `ALLOWED_ORIGINS` and
CORS alone do not protect an upload endpoint.

Before Phase 1 production, one of the following is required.

### Recommended

- account authentication
- server-side household ownership checks on requests
- per-household isolation for R2 prefixes and D1 rows

### Limited Temporary Option

- a rotatable household upload token issued by the server
- only the token hash stored on the server
- short expiry, rate limiting, and revoke support

Temporary tokens are not a substitute for full multi-user authorization. If the
photo feature must be opened in a public demo, keep it behind a feature flag
until authenticated accounts exist.

The privacy policy must state:

- which image variants are stored
- whether EXIF is removed
- when deletion propagates from R2 and D1
- whether the images are ever used for training
- how users can request export and deletion

## 8. Vision Recognition Evolution Plan

### Phase 2: Pretrained Proposal

After the user selects a photo, request recognition either before upload or after upload.

```text
photo
→ vision/OCR/barcode signals
→ candidate list
→ user confirmation
→ normal inventory setup/update flow
```

Example response contract:

```json
{
  "request_id": "uuid",
  "candidates": [
    {
      "item_name": "coke_zero",
      "generic_item": "soda",
      "brand": "coca_cola",
      "category": "beverage",
      "confidence": 0.84,
      "evidence": ["visual", "ocr"]
    }
  ],
  "expiry_candidates": [],
  "requires_confirmation": true
}
```

Initially, candidates can come from a general vision API or a pretrained
image-text embedding system. Even at this stage, vision output must not be
treated as annotation ground truth.

### Phase 3: Catalog Retrieval

For open-world grocery items, catalog retrieval is more appropriate than a
closed fixed-class classifier.

1. create an image embedding
2. search nearest neighbors over a curated grocery or catalog image embedding index
3. combine OCR brand/product text and barcode results
4. perform entity linking into the Jangoing canonical taxonomy
5. present top-k candidates to the user

Use Open Food Facts only as a catalog source for product names, brands,
barcodes, categories, and image candidates. Verify image licensing and
attribution separately, and do not use it as utterance-intent ground truth.

### Phase 4: Jangoing-Specific Adaptation

Once enough consented data exists, compare:

- frozen pretrained embedding + nearest-neighbor retrieval
- a lightweight classifier head
- a multimodal ranker: image + OCR + barcode + household history
- Raspberry Pi- or mobile-compatible ONNX models

Custom training should not aim for a closed classifier that only predicts
common classes. It should reject unknown items and rank candidates well.

## 9. Vision Label Collection

When the user confirms recognition candidates, record:

```text
recognition_request_id
model/version
top-k candidates and scores
selected canonical item
selected brand/category
manual replacement
dismissed/unknown
latency
image consent scope
```

Important:

- separate UI confirmation results from training consent
- consent to store artwork does not imply consent to train models on the image
- split evaluation so resize/crop variants of the same photo never cross train
  and evaluation; use image hash or capture group as the split unit
- check leakage across the same household, product, or capture session
- evaluate external catalog images and real fridge photos as separate domain slices

## 10. Evaluation Metrics

### Artwork

- upload success rate
- median upload latency
- browser compression failure rate
- broken media URL rate
- replace/delete consistency
- page image transfer bytes and LCP impact

### Recognition

- top-1 accuracy
- top-3 recall
- mean reciprocal rank
- unknown-item rejection precision/recall
- confidence calibration
- manual replacement rate
- accuracy by brand, generic item, and category
- ablation by barcode/OCR/image signal
- slices for packaged, produce, frozen, reflective, and occluded images

Evaluate expiry OCR as a separate task from general item recognition. Reading a
date string does not mean the system can safely conclude that it is an expiry
date; date type and temporal normalization must still be checked.

## 11. Stepwise Execution Plan

### Phase 0: Security and Contract

- [ ] choose account authentication or a restricted household token approach
- [ ] write photo retention, deletion, and training-consent policy
- [ ] define the `ItemMedia` contract and API error schema
- [ ] define R2 lifecycle and cache policy

Completion condition: no public endpoint can read or write objects without
household ownership.

### Phase 1A: Storage

- [ ] add Cloudflare R2 bucket and Worker binding
- [ ] write migration `0012_create_item_media.sql`
- [ ] implement upload/read/delete APIs
- [ ] validate MIME, decode, dimensions, bytes, and hash
- [ ] test D1/R2 partial-failure cleanup

Completion condition: one item's primary image can be saved, read, replaced,
and deleted without leaving orphan objects.

### Phase 1B: Artwork UX

- [ ] add Add/Change/Remove Photo to Inventory edit
- [ ] add client-side orientation correction, crop, resize, and re-encode
- [ ] add optional photo draft to Set Up My Fridge
- [ ] apply the image fallback chain to Home, Inventory, Search, and Shopping
- [ ] implement loading, upload progress, retry, error, and offline states
- [ ] validate responsive image sizes and cache invalidation

Completion condition: user photos display consistently across the four consumer
surfaces and photo failures do not damage inventory actions.

### Phase 2: Vision Prototype

- [ ] define recognition request/response schema
- [ ] build a general-vision or pretrained-embedding baseline
- [ ] implement top-k confirmation UI
- [ ] add prediction, correction, and dismissal logging
- [ ] test that vision output never directly creates inventory events

Completion condition: a photo can propose candidates and the user can confirm
them or replace them manually.

### Phase 3: Retrieval and Evaluation

- [ ] validate curated grocery catalog and image licenses
- [ ] build a catalog embedding index
- [ ] compare image + OCR + barcode fusion baselines
- [ ] create a frozen evaluation set and domain slices
- [ ] write top-k, unknown-rejection, and calibration reports

Completion condition: improvements over a simple vision API are shown with
reproducible evaluation.

### Phase 4: Edge Deployment Research

- [ ] define Raspberry Pi/mobile latency and memory budgets
- [ ] verify ONNX export for candidate encoders/rankers
- [ ] compare cloud, phone, and Raspberry Pi on privacy, latency, and cost
- [ ] design fallback and model-version rollback

## 12. Recommended Build Order

Current priority:

1. stabilize fridge setup and the annotation MVP
2. add authentication or a household upload token
3. add R2/D1 item media storage
4. pilot photo artwork on Inventory
5. expand artwork to Home/Search/Shopping
6. build a recognition proposal prototype
7. wait for consented correction data before custom adaptation

Do not start with photo recognition itself. First build storage, consent,
confirmation, and evaluation structure so vision output can be connected safely
to both product behavior and research data.
