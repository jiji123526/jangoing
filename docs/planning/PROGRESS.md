# jangoing Progress Log

Add new entries at the top of the log so the latest state is easy to find.

## 2026-09-01 - Voice pipeline and alignment notes documented

### Completed

- Added a dedicated ML note describing `SFT`, `PPO`, `DPO`, and `GRPO`, with
  explicit guidance on how each method would and would not fit Jangoing.
- Documented why GRPO is more realistic for structured consistency and narrow
  context-resolution subtasks than for full open-ended context understanding.
- Added a dedicated voice architecture document covering the ASR/LLM/TTS
  pipeline, latency budget, turn-taking, grounding, reliability, and a staged
  Raspberry Pi strategy for audio input/output.
- Documented a hybrid recommendation: cloud TTS for normal turns, local Pi
  playback or short fallback prompts for resilience and lower perceived latency.
- Linked both new documents from the docs index.

### Deployment

- This change is documentation-only.

## 2026-09-01 - GRPO context-verifier boundary added to question doc

### Completed

- Extended the language engineer question document with a dedicated section on
  where GRPO is and is not realistic for conversational context reading.
- Distinguished full context understanding from verifier-friendly subtasks such
  as pronoun resolution, temporal carryover, and prior-state consistency.
- Added a reusable direct question on how to split context work across
  SFT, DPO, and GRPO.

### Deployment

- This change is documentation-only.

## 2026-09-01 - Language engineer question set documented

### Completed

- Added a focused question list for discussing Jangoing's annotation workflow,
  ontology, queue design, dataset export, and model-feeding strategy with a
  language engineer.
- Included a short-share version, a top-five priority set, and deeper prompts
  on normalization, multi-action data, hard negatives, temporal grounding, and
  leakage risk.
- Linked the new document from the docs index.

### Deployment

- This change is documentation-only.

## 2026-08-31 - Item photo and vision roadmap documented

### Completed

- Defined an artwork-first photo flow using browser processing, R2 object
  storage, and D1 item-media metadata.
- Kept photo metadata independent from inventory event projections and made
  category artwork the final fallback.
- Required authentication or a constrained household token before production
  uploads because CORS does not authorize writes.
- Planned a confirmation-gated progression from pretrained vision proposals to
  catalog retrieval, multimodal ranking, and possible Raspberry Pi/ONNX use.
- Defined privacy, consent, leakage prevention, unknown rejection, and
  evaluation requirements for future vision training.

### Next Gate

- Stabilize the current MVP, then choose the upload authentication mechanism
  before creating R2 and migration `0011`.

## 2026-08-31 - Removed consumer list page bottom dividers

### Completed

- Removed the generic data-section bottom border from Inventory and Shopping
  List pages.
- Preserved inset dividers between individual inventory and shopping rows.

### Deployment

- This change is Web-only.

## 2026-08-31 - Search supports status keywords

### Completed

- Added inventory status search for in-stock, low, out-of-stock, expiring, and
  expired vocabulary plus common English aliases.
- Added shopping status search for to-buy and purchased vocabulary.
- Changed matching from one complete query per field to tokenized AND matching
  across item, status, expiry state, location, and unit.
- Enabled compound queries such as `low milk`, `expiring fridge`, and
  `purchased soda`.

### Deployment

- This change is Web-only.

## 2026-08-31 - Fridge setup hero uses one card action

### Completed

- Removed the separate Start button from the first-run setup hero.
- Made the complete banner one accessible button with a trailing disclosure
  chevron and visible keyboard focus treatment.

### Deployment

- This follow-up is Web-only.

## 2026-08-31 - Guided Set Up My Fridge onboarding

### Completed

- Added a prominent first-run Home hero that opens a three-step fridge setup:
  item entry, inventory details, and final review.
- Persisted unfinished setup drafts in browser local storage.
- Added `GET /fridge-setup/status` and atomic `POST /fridge-setup` endpoints to
  both the Cloudflare Worker and local SQLite API.
- Added migration `0010_create_app_state.sql` and persisted the explicit
  `fridge_setup_completed_at` state independently from inventory size.
- Added setup events with `source = fridge_setup`; these events do not create
  inference logs and therefore do not enter NLP annotation queues.
- New setup items use `item_added`, while already tracked items use
  `item_adjusted`. Omitted existing items are not removed or set to zero.
- Added setup request validation for canonical names, positive quantities,
  optional details, a 100-item limit, and duplicate item rejection.
- Updated inventory projection so a low threshold supplied on an initial
  `item_added` event is retained.

### Verification

- `npm run typecheck`
- `npm run test --workspace @jangoing/api`: 117 tests passed
- `npm run build --workspace @jangoing/web`
- Local SQLite end-to-end status, setup save, state persistence, and inventory
  projection were exercised with a clean temporary database.

### Deployment

1. Run `npm run db:migrate:remote`.
2. Run `npm run deploy:api`.
3. Push/redeploy the Vercel web app.

The migration and Worker must reach production before the new Home UI.

## 2026-08-31 - Bottom navigation width matched to consumer pages

### Completed

- Constrained the entire bottom-navigation surface and top divider to the same
  fluid 430px shell as the five consumer pages.
- Centered the fixed footer and matched its inline border to the page shell.
- Kept the internal five-tab row at 100% of the footer width.

### Deployment

- This change is Web-only.

## 2026-08-31 - Search scope now slides between Inventory and Shopping List

### Completed

- Replaced Kitchen / History with the concrete Inventory / Shopping List data
  scopes.
- Added one shared white segmented-control pill that slides between scopes with
  a 300ms spring curve.
- Changed submitted chips to status filters: Inventory uses In Stock, Low, Out,
  and Expiring; Shopping List uses To Buy and Purchased.
- Removed Activity from Search so the scope and result filters have one clear
  responsibility.

### Deployment

- This change is Web-only.

## 2026-08-31 - Search rebuilt with Apple Music search chips

### Completed

- Replaced the duplicate command-mutation Search screen with a dedicated
  read-only universal search across Inventory, Shopping, and recent Activity.
- Recreated the reference interaction: focused search shows a segmented scope;
  submitted search fades/slides into horizontally scrolling result chips over
  250ms.
- Removed hidden scope controls from keyboard navigation and collapsed the
  secondary-control region before search activation.
- Added a shared moving selection pill and limited chips to result types valid
  for the selected Kitchen or History scope.
- Reset result chips when changing scope and removed collapsed controls from
  the tab order.
- Added source-grouped result rows, selected-chip filtering, empty/error/loading
  states, example searches, and five local recent searches.
- Kept all state mutation in Home Quick Update.

### Reference

- https://sebvidal.com/blog/recreating-apple-musics-search-chips-ui/

### Deployment

- This Search change is Web-only.

## 2026-08-31 - Consumer tabs share a mobile-width shell

### Completed

- Added a shared `430px` maximum width for Home, Inventory, Analytics, Shopping,
  and Search while preserving fluid width on smaller phones.
- Matched the Home mini-player and bottom navigation inner frame to the same
  shell.
- Excluded the direct-URL Annotation workspace because its labeling controls
  require the existing desktop width.

### Deployment

- This layout update is Web-only. The pending Analytics work still requires its
  Worker deployment before the Web deployment.

## 2026-08-31 - Center navigation changed from Annotation to Analytics

### Completed

- Replaced the center Annotate destination with `/analytics` and relabeled the
  existing center waveform icon as Analytics.
- Removed the Annotation workspace from consumer navigation while preserving
  `/annotate` for direct-URL data operations.
- Added a first Weekly Summary using the existing event endpoint: last-seven-day
  update, add, purchase, and discard counts plus the five most active items.
- Added optional `GET /events?since=<ISO timestamp>` support so weekly analytics
  is not silently truncated by the default recent-50 event response.
- Added an explicit caveat that analytics summarizes recorded events rather
  than unobserved physical inventory changes.

### Deployment

- Deploy the Worker before the Web app because Analytics uses the new `since`
  query.
- No D1 migration is required.

## 2026-08-31 - Home gains actionable daily kitchen sections

### Completed

- Added Today with at most three priority rows derived from expiry, stock, and
  active shopping projections.
- Added Suggested Actions for adding low/out items to Shopping and setting a
  missing low threshold through the existing confirmation flow.
- Left suggested threshold quantities unset rather than guessing a household
  policy; the user enters the value before interpretation and confirmation.
- Added a four-metric Inventory Snapshot linked to Inventory.
- Added Waste Prevention ordered by nearest recorded expiry date.
- Added loading and visible Home error states for projection and suggested-action
  requests.
- Kept every state change explicit: suggestions require Add or Quick Update
  confirmation, while waste rows only navigate to review.
- Reserved Weekly Summary for a separate future analytics tab.

### Deployment

- This change is Web-only. No Worker deployment or D1 migration is required.

## 2026-08-31 - Quick Update moved into the Home mini player

### Completed

- Replaced the full inline Home command form with a 64px mini-player bar above
  the tab bar.
- Made the entire bar open the existing command, correction, and confirmation
  workflow in a modal without duplicating that logic.
- Added backdrop, Escape, explicit close, initial input focus, focus
  containment, background scroll lock, and automatic close after every
  successful save path.
- Used a 44px microphone artwork region that can later display Raspberry Pi or
  voice-listening state.
- Kept the Search command interface unchanged and limited the fixed bar to Home.

### Deployment

- This change is Web-only. No Worker deployment or D1 migration is required.

## 2026-08-31 - Home profile placeholder added

### Completed

- Added the reference-style circular account icon to the right side of the Home
  large-title navbar.
- Reserved a 44px region around a 30px icon so it can become an accessible
  profile link when authentication and account routes are implemented.
- Kept the placeholder non-interactive to avoid linking users to a route that
  does not exist yet.

### Deployment

- This change is Web-only. No Worker deployment or D1 migration is required.

## 2026-08-31 - Home adopts the Apple Music horizontal content structure

### Completed

- Replaced the developer-oriented recent-action list with a consumer Home
  hierarchy: large title, Kitchen Briefing, Recently Updated, and Quick Update.
- Derived briefing cards from current expiry, inventory status, and shopping
  projections without adding an API or database schema.
- Deduplicated recent events by item so one item occupies only its latest card.
- Added 278px feature cards and 160px square media cards with horizontal touch
  scrolling, momentum, hidden scrollbars, and snap alignment.
- Kept the full command interpretation and confirmation workflow in a compact
  Home section while preserving Search behavior.
- Documented the exact Home component measurements in the design guide.

### Deployment

- This change is Web-only. No Worker deployment or D1 migration is required.

## 2026-08-31 - To Buy swipe now provides Done and Delete

### Completed

- Expanded active-item swipe distance from 84px to 168px.
- Added a green Done action and red Delete action.
- Added `shopping_item_deleted` and a matching Worker/local API endpoint.
- Removed deleted items only from the shopping projection, leaving inventory
  unchanged.
- Kept Purchased rows on the existing single Undo action.
- Increased Shopping section selector specificity so its mobile outer padding
  cannot be reintroduced by the generic data-section rule.

### Deployment

- No D1 migration is required because the existing event type column stores
  text.
- Deploy Worker before Vercel because Delete uses a new API endpoint.

## 2026-08-31 - Stale Safari shopping bundle diagnosed

### Symptoms

- Done succeeded on the Worker and appeared after a refresh, but the current
  page showed the old EventRecord schema error instead of updating immediately.
- The same page still showed Shopping's pre-fix mobile padding.

### Diagnosis

- The public Vercel HTML and JavaScript were inspected directly.
- The served bundle contains `?include=projections`, the composite mutation
  parser, and the current Shopping client.
- The open Safari tab was therefore retaining a JavaScript bundle loaded before
  the deployment while the Worker was already running the newer API.

### Resolution

- Close existing Jangoing tabs and open a cache-busted Shopping URL in a new
  tab, or remove the site's Safari website data.
- No database correction is needed for the failed-looking action because the
  Worker had already stored the purchase event.

## 2026-08-31 - Shopping mutation rollout made backward compatible

### Problem

- Production Worker returned the new `{ event, inventory, items }` mutation
  response while an older Vercel client still parsed a single `EventRecord`.
- The resulting schema error prevented Done from completing in the UI.

### Resolution

- New clients explicitly request authoritative projections with
  `?include=projections`.
- Requests without that parameter continue receiving the legacy single-event
  response, so Worker-first deployments remain compatible with the previous
  web release.

### Deployment

- Deploy the Worker first, then push/redeploy Vercel.
- The current production screenshot and schema error indicate Vercel has not
  yet loaded the commit containing the alignment and composite-response client.

## 2026-08-31 - Shopping add field focus simplified

### Completed

- Removed the blue outline and box shadow from focused Add Item dialog fields.
- Preserved a visible keyboard focus state through a subtle row-level surface
  fill instead of a field boundary.

## 2026-08-31 - Shopping and Inventory page alignment fixed

### Problem

- Shopping was shifted 18px farther right and 24px farther down than Inventory
  on mobile even though both inner components used a 16px inset.

### Cause

- The mobile `.data-section` rule reapplied outer padding to both pages, but
  only `.inventory-section` overrode it.
- Shopping therefore combined 18px outer padding with its own 16px component
  inset.

### Resolution

- Applied the same zero-horizontal-padding mobile override to Shopping.
- Matched Shopping's first-section top spacing to Inventory's 8px spacing.
- Kept the compact Shopping row height while aligning page titles, section
  headings, artwork, trailing actions, and counts to the same page grid.

## 2026-08-31 - Shopping Undo now returns authoritative inventory

### Problem

- Undo moved a Purchased row back to To Buy but the inventory UI could continue
  showing the post-purchase projection.

### Resolution

- Changed purchase and restore mutations to return the event plus inventory and
  shopping projections calculated from the same ordered event sequence.
- Updated the web app to apply those authoritative projections directly instead
  of issuing separate follow-up GET requests after the D1 write.
- Added regression coverage for restoring an item that was Out before purchase.

### Decisions

- Keep the event replay behavior as the source of truth while returning its
  immediate result from the mutation request.
- Avoid relying on cross-request read-after-write timing for user-visible
  purchase and Undo state.

### Validation

- `npm run typecheck`
- `npm run test --workspace @jangoing/api` (111 tests)
- `npm run build --workspace @jangoing/api`
- `npm run build --workspace @jangoing/web`

## 2026-08-31 - Shopping purchases now update inventory

### Completed

- Added quantity, unit, location, and expiration context to projected shopping
  items without adding D1 columns.
- Extended the manual Add Item dialog with fields for all purchase context.
- Prefilled one-tap inventory recommendations with quantity one and the
  inventory item's current unit and location.
- Displayed current inventory status and planned purchase context together on
  every To Buy row.
- Made a context-aware purchase event add a tracked inventory batch.
- Made Undo remove only the batch created by that purchase, preserving older
  inventory.
- Refetched both shopping and inventory projections after Done/Undo so status
  text and recommendations update immediately.
- Added API validation that rejects purchase/restore requests for items in the
  wrong shopping state.
- Protected production history by ignoring legacy purchase events whose
  quantity/context was not recorded.

### Decisions

- Reuse existing event columns instead of introducing a shopping-details table
  or D1 migration.
- Treat planned context stored on `item_added_to_buy` as the server-authoritative
  purchase payload.
- Keep recommendation addition one-tap by inferring unit and location, while
  manual additions collect full context in the dialog.
- Deploy Worker/contracts before Vercel because inventory projection and
  mutation semantics changed.

### Validation

- `npm run typecheck`
- `npm run test --workspace @jangoing/api` (110 tests)
- `npm run build --workspace @jangoing/api`
- `npm run build --workspace @jangoing/web`

## 2026-08-31 - Manual shopping add moved to a dialog

### Completed

- Replaced the inline manual shopping form with a native modal dialog.
- Added a focused item-name field, format hint, and navbar-style Cancel/Add
  actions.
- Kept failed submissions open and displayed their error inside the dialog.
- Added Escape, backdrop-click, focus-trap, and disabled-submit behavior.

### Decisions

- Use the browser's native dialog semantics instead of recreating focus
  management and modal accessibility with generic div elements.
- Keep recommendation additions as one-tap actions; only free-form manual
  additions require the dialog.

## 2026-08-31 - Shopping recommendation production 404 diagnosed

### Problem

- The recommendation `+` action returned `Not found` in production while
  shopping-list reads continued to work.

### Cause

- The web app calls `POST /shopping-list/:item/add`, which was introduced after
  the original purchase/restore Worker routes.
- A Vercel deployment using the new web client against an older Worker returns
  the Worker's route-level 404 response.

### Resolution

- Deploy the current Worker before testing the recommendation action again.
- No D1 migration is required because the action writes the existing
  `item_added_to_buy` event type into the existing `events` table.

## 2026-08-31 - Inventory-scale shopping typography adopted

### Completed

- Matched the Shopping page header to Inventory's 95px large-title structure
  and 34/41px title typography.
- Increased shopping item secondary metadata from 13/16px to Inventory's
  15/20px metadata scale.
- Preserved the compact 56px shopping rows and swipe actions while aligning
  page-level hierarchy across the two tabs.

### Decisions

- Use the same page title and text hierarchy across Inventory and Shopping,
  while retaining different row densities appropriate to browsing inventory
  versus completing a shopping queue.

## 2026-08-31 - Compact media-list shopping UI adopted

### Completed

- Replaced the large Shopping title with a 44px compact navbar and retained the
  Figma-derived 75x28 `+ Add` pill.
- Standardized Suggested, To Buy, and Purchased items on 56px media rows with
  48px category artwork.
- Replaced To Buy checkboxes with a pointer and touch swipe-left interaction
  that reveals an 84px semantic green `Done` action.
- Applied the same swipe-left pattern to Purchased rows, revealing a pink
  `Undo` action instead of keeping it permanently visible.
- Mapped the reference row's artist-name line to shopping metadata: current
  inventory status and quantity for active items, and the full purchase date
  for completed items.
- Reused the inventory snapshot already loaded with Shopping and indexed it by
  canonical item name, avoiding additional per-row API requests.
- Added keyboard focus handling so the swipe action is not pointer-only.

### Decisions

- Retain the Playing Next queue semantics while using the compact media-list
  page as the primary visual template.
- Use restrained category placeholders until product artwork is available.
- Reserve pink for add and undo actions; use system green for completion.

## 2026-08-31 - Playing Next-style shopping queue implemented

### Completed

- Rebuilt Shopping with the Apple Music `Playing Next` and 56px Track List
  structure.
- Split projected items into `To Buy` and `Purchased` sections.
- Added accessible leading circular controls for purchase and restore actions.
- Added `shopping_item_purchased` and `shopping_item_restored` events.
- Kept purchased items visible for 24 hours, then hid them from the projection
  without deleting event history.
- Added matching production Worker and local API mutation endpoints.
- Prevented shopping-only events from creating inventory projection rows.
- Added projection tests for purchase, restore, retention cleanup, deduplication,
  and inventory isolation.
- Added `Suggested from Inventory` for Low items not already represented in To
  Buy or recent Purchased.
- Added a direct recommendation action that records `item_added_to_buy` and
  refreshes the queue without discarding the inventory snapshot.
- Replaced recommendation text actions with the Figma-derived 28px trailing
  plus control and added the 75x28 `+ Add` navbar chip for manual entries.
- Added a compact manual item form that canonicalizes a typed display name
  before saving it to the shopping queue.

### Decisions

- Treat Purchased as a reversible recent-action section rather than deleting
  an item immediately.
- Retain event history for auditability; "clears after 24 hours" means the row
  leaves the shopping projection.
- Use the Track List template instead of album cards because Shopping is an
  action queue, not a browsing library.
- Recommend only explicit `low` inventory states; expiry warnings and generic
  in-stock items do not become shopping suggestions.

### Deployment

- No D1 migration is required because `events.event_type` already stores text.
- Deploy the Worker before the Vercel web update.

### Validation

- `npm run typecheck`
- `npm run test --workspace @jangoing/api` (107 tests)
- `npm run build --workspace @jangoing/api`
- `npm run build --workspace @jangoing/web`

## 2026-08-31 - Quantity-based inventory status added

### Completed

- Added an item-specific nullable `low_threshold` to inventory adjustment
  events and projected inventory records.
- Allowed Quantity `0` in the inventory editor and mapped it to Out.
- Mapped positive quantities at or below the configured threshold to Low.
- Added the compact `Low at` field to the inline inventory editor.
- Preserved zero when reopening Out items and reset unsaved editor values after
  Cancel.
- Preserved explicit Low/Out status when an edit changes only unit, location,
  or expiry.
- Added D1 migration `0009_add_inventory_low_threshold.sql`.
- Added projection coverage for automatic Low, automatic Out, explicit-status
  preservation, and status recalculation after quantity changes.
- Added the `set_low_threshold` intent and `item_low_threshold_set` event.
- Added deterministic `rules-v2` parsing for direct threshold settings,
  notification requests, policy statements, and remaining-quantity triggers.
- Connected threshold review and confirmation through the web command UI.
- Added `set_low_threshold` to the annotation intent and controlled phrase
  family lists without introducing action-word entities.
- Preserved threshold policies set before an item is added without displaying
  a ghost inventory row.
- Preserved threshold units and skipped automatic comparison when the threshold
  and current inventory units do not match.

### Decisions

- Keep thresholds item-specific rather than applying an unreliable global
  quantity rule across different products and units.
- Keep explicit `mark_low` support for utterances that do not include an exact
  quantity.
- Treat an empty threshold as automatic Low detection disabled.
- Distinguish current-state reports (`We only have two left` -> `mark_low`) from
  durable policy requests (`Tell me when two are left` ->
  `set_low_threshold`).
- Reuse `QUANTITY` and `UNIT` entity labels for threshold expressions; the
  intent determines their semantic role.

### Deployment

1. `npm run db:migrate:remote`
2. `npm run deploy:api`
3. `git push origin main`

### Validation

- `npm run typecheck`
- `npm run test --workspace @jangoing/api` (102 tests)
- `npm run build --workspace @jangoing/api`
- `npm run build --workspace @jangoing/web`
- Applied migrations 0001 and 0009 successfully to a temporary SQLite DB.

## 2026-08-31 - Inventory editing changed to single-row expansion

### Completed

- Changed the global page canvas from the green-tinted grid to a plain white
  background, including the main shell and sticky topbar.
- Restored the navbar-level `Edit`/`Done` mode.
- Made category rows clickable only while Edit mode is active.
- Expanded the selected item in place with quantity, unit, location, expiry,
  save, and remove controls.
- Limited editing to one expanded item at a time.
- Closed the expanded editor after a successful save or removal.
- Replaced the two-column boxed form with 52px iOS-style grouped rows.
- Added a `Cancel / item / Save` compact action bar, quantity stepper, trailing
  values and chevrons, native unit/location/date controls, and a 13px
  validation footnote.
- Moved removal into a separate red destructive row.
- Removed inventory update and removal success banners.
- Restored the inventory artwork beside the expanded editor and moved compact
  `Cancel / Save` actions onto the item-name row so editing remains visually
  anchored to the original inventory list item.
- Moved `Cancel / Save` into the editor footer and replaced the former header
  Save position with an accessible trash icon for inventory removal.
- Kept Needs Attention visible in normal mode and hid its duplicate rows while
  editing the category list.

### Decisions

- Keep editing in the list context instead of opening a separate dialog.
- Require the explicit navbar Edit mode before an item can be changed.
- Preserve native select and date behavior through transparent full-row
  controls while presenting one consistent visual row format.
- Keep selection and presentation behavior separate from the later
  quantity-based status semantics.

### Validation

- `npm run typecheck`
- `npm run build --workspace @jangoing/web`
- `git diff --check`

## 2026-08-31 - Local dashboard sample data seed added

### Completed

- Added a local-only sample event seed script for non-annotation UI work.
- Seed data now covers recent actions, inventory attention states, category
  groups, and shopping-list entries.
- Added a root command so the local dashboard can be repopulated quickly after
  clearing the SQLite database.

### Decisions

- Keep sample data explicit and opt-in instead of auto-seeding on every local
  dev startup.
- Replace only deterministic `local-ui-sample-*` events so existing local user
  data is preserved.

### Next

- Use `npm run seed:local-sample` whenever the local UI needs realistic sample
  content without relying on production data.

## 2026-08-30 - Global headers removed and inventory editing added

### Completed

- Removed the duplicated product header from Home, Inventory, Shopping, Search,
  and the dedicated Annotation workspace.
- Matched the Inventory `Edit` action to Figma Light Navbar nodes `1:133493`
  and `1:133495`: 16px right inset, 11px top inset, SF Pro Text Regular 17/22,
  `-0.408px` tracking, and `#FF2D55`.
- Added Edit/Done mode with quantity, unit, location, expiry-date, save, and
  confirmed remove controls for every existing inventory item.
- Added direct inventory mutation endpoints for production Worker and local API.
- Added explicit `item_adjusted` and `item_removed` event types so manual list
  maintenance remains distinguishable from conversational consumption,
  disposal, and model-correction data.
- Added projection tests proving an adjustment replaces the current projected
  batch and removal omits the item from the active inventory list.

### Deployment order

1. Deploy the API Worker with the new mutation endpoints and event types.
2. Deploy the web app with Edit mode enabled.

No D1 schema migration is required because the existing `events.event_type`
column stores text values and the event record shape did not gain a new column.

### Validation

- All workspace TypeScript checks passed.
- All 95 API tests passed.
- Web production build passed for all six routes.

## 2026-08-30 - Bottom tabs split into independent routes

### Completed

- Replaced in-page hash navigation with independent routes for Home,
  Inventory, Shopping, and Search.
- Kept Annotation on its existing dedicated route and kept the shared bottom
  navigation in the root layout.
- Updated active-tab state to follow the pathname instead of browser hash
  state.
- Limited each route to its own screen content so long inventory or shopping
  lists no longer push another tab's content down the same document.
- Split dashboard data fetching so Inventory, Shopping, and Search request only
  the data required by their own screen.

### Routes

- Home: `/`
- Inventory: `/inventory`
- Annotation: `/annotate`
- Shopping: `/shopping`
- Search and command interpretation: `/search`

### Behavior

- Home keeps the quick command entry and recent confirmed actions.
- Inventory renders only the Apple Music-style inventory library.
- Shopping renders only the shopping list.
- Search renders the command interpretation workflow without unrelated lists.

## 2026-08-30 - Apple Music-style inventory library implemented

### Completed

- Rebuilt the Inventory section from Figma screen `1:20888` and its
  `390x116` Album Teaser row `1:126073`.
- Added an at-a-glance Needs Attention section for expired, expiring-soon,
  low-stock, and out-of-stock items.
- Added horizontally scrollable category filters and category-grouped item
  lists while preserving the existing inventory API response.
- Added explicit quantity, storage-location, expiry, and stock metadata with
  accessible text labels rather than color-only status.
- Added deterministic client-side category fallback rules until the inventory
  schema exposes a reviewed category value.
- Kept `frozen` specificity ahead of generic product terms so, for example,
  frozen blueberries remain separate from fresh produce.

### Validation

- Web TypeScript check passed.
- Web production build passed.
- Verified the empty state and Inventory navigation at a 390x844 viewport.

### Next

- Replace category artwork and heuristic classification with catalog-backed
  product images and reviewed category values when those fields are added.

## 2026-08-30 - Mobile tab bar bottom gap removed

### Completed

- Removed the fixed 34px simulated iOS home-indicator area from the web tab
  bar, which appeared as unnecessary white space above mobile browser chrome.
- Kept real device inset support through `env(safe-area-inset-bottom)` and
  synchronized the page bottom padding with the rendered navigation height.

### Decision

- Reproduce the Figma tab row itself on the web, but let the browser provide
  its own chrome and reserve only a real safe-area inset reported by the device.

## 2026-08-30 - Apple Music UI kit design system extracted

### Completed

- Inspected all 19,917 nodes across the Figma kit's Light and Dark mode screens.
- Confirmed the community file does not expose formal local components, styles,
  or variable collections, and derived reusable specifications from recurring
  source frames instead.
- Added a detailed Korean design guide covering color, typography, spacing,
  effects, icons, navigation, list/card variants, tables, player controls,
  modals, accessibility, responsive behavior, and parity validation.
- Recorded representative Figma node IDs, observed instance counts, exact
  geometry, and Jangoing-specific inventory mappings.

### Decisions

- Do not substitute arbitrary fonts, icon families, spacing, radii, or effects
  when a Figma reference is provided.
- Treat source artwork and trademark assets separately from layout and visual
  specifications; verify reuse rights before product distribution.
- Use the 390x116 Apple Music album row as the initial Inventory Item Row, with
  specific item name, quantity/location, and one-line attention metadata.

## 2026-08-30 - Persistent bottom navigation added

### Completed

- Rebuilt the bottom navigation from the exact Figma light-mode tab-bar node
  (`1:125932`) rather than visual approximation: 390x83 reference frame, 49px
  tab row, 34px home-area inset, 0.5px `#C6C6C8` divider, `#FAFAFA` background,
  15px CSS backdrop blur, `#FF2D55` active color, and `#979798` inactive color.
- Replaced Lucide navigation glyphs with the five actual 30px SF Symbol renders
  exported from the referenced Figma file and committed locally as durable
  assets.
- Matched the Figma caption style with SF Pro Text Medium, 10px font size, 12px
  line height, and 0.07px letter spacing.
- Kept the four product destinations `Home`, `Inventory`, `Shopping`, and
  `Search`, with a visually elevated `Annotate` action in the center.
- Connected Inventory, Shopping, and Search to their current main-page
  sections, while Annotate navigates to the dedicated `/annotate` workspace.
- Added safe-area spacing, compact mobile labels, active states, smooth anchor
  navigation, and enough page padding to prevent the tab bar covering content.
- Removed the duplicate top-bar annotation shortcut from the main page.

### Decisions

- Keep annotation globally reachable during the data-collection phase even
  though it is not a normal consumer-product destination.
- Use section anchors for the four product destinations until Inventory,
  Shopping, and Search become independent screens.
- Preserve the five-tab order: Home, Inventory, Annotate, Shopping, Search.

### Validation

- Web TypeScript check passed.
- Web production build passed.
- Verified the 390 x 844 mobile layout and navigation into `/annotate` in the
  local app.

## 2026-08-28 - Open Food Facts and brand normalization decision documented

### Completed

- Documented Open Food Facts as a product catalog and entity-linking source,
  not an intent or relevance utterance dataset.
- Defined MVP branded mentions as full `ITEM` spans and deferred a separate
  `BRAND` entity until the product supports independent brand constraints.
- Proposed a `grocery-v2` structure with category, product family, brand, item,
  aliases, provenance, and canonical lifecycle.
- Recorded a curated 100-500 English concept import strategy, exact-alias
  linker baseline, and leakage-safe product evaluation slices.
- Added explicit license and dataset-schema verification gates before download
  or production use.

### Decisions

- Do not copy the complete Open Food Facts database into D1 or the normalized
  annotation list.
- Keep external rows as candidates until filtering and human canonical review.
- Preserve mention specificity: generic categories, generic items, and branded
  products must not be silently collapsed into one another.
- Define `grocery-v2` and migration rules before implementing the importer.

### Next

- Continue the current reviewed-annotation milestone independently.
- Verify official Open Food Facts terms and schema.
- Design and review the `grocery-v2` schema as the first catalog implementation.

## Current state as of 2026-08-28

- The project now has an explicit academic framing covering research questions,
  methodology, design choices, validity threats, and expected contributions.
- Documentation is categorized under `docs/planning`, `docs/annotation`,
  `docs/ml`, `docs/decisions`, and `docs/operations`.
- Detailed project documentation now lives under `docs/`; the repository and
  ML package READMEs remain at their entry points.
- The Korean ML/NLP guide now includes a beginner-oriented Jangoing model
  specification, first training exercise, hardware guidance, implementation
  gaps, and official references.
- The current Worker, Vercel annotation UI, and annotation queue seed v2 have
  been deployed to production.
- `ACTION_ITEMS.md` now defines deployment, annotation-volume, quality, export,
  and model-training gates from the workflow pilot through the English MVP.
- Annotation queue seed v2 uses per-example expiry grounding, a non-overwriting
  ID namespace, and generation-time normalization validation.
- Expiry queue responses and `/annotate` now expose original temporal context
  and a server-derived normalized expiry suggestion.
- Annotation assistant prompt v6 receives the original temporal context, while
  deterministic server code validates and normalizes expiry spans.
- Interpretation now resolves and stores an effective `reference_date` and
  validated `timezone` for every request, and shared deterministic code
  normalizes relative expiry phrases from that original temporal context.
- `main` includes annotation-v2 multi-action collection, prioritized annotation
  queues, deterministic queue seeding, generated-review dataset import, split
  train/evaluation dataset export validation, task-aware reviewed export
  filtering, dynamic normalized-value suggestions, and assistant-draft proposal
  plumbing.
- Annotation-v3 storage now includes first-class relevance values:
  `actionable`, `contextual_preference`, `domain_non_actionable`, and
  `unrelated`.
- `/annotate` now asks for relevance before action structure and hides action,
  AI-draft, and entity controls for non-actionable utterances.
- Reviewed export supports a dedicated `relevance` task and prevents
  non-actionable records from entering intent, slot, or joint datasets.
- Dedicated generated-review queues now cover context/preferences,
  domain-adjacent non-actionable language, and unrelated negatives.
- Inference logs and reviewed exports now preserve optional conversation, turn,
  speaker, and activation metadata.
- `relevance-candidates-v1` provides 600 reproducible non-actionable review
  candidates across 35 phrase families.
- `/annotate` preserves the last queue and dataset purpose across refreshes and
  consecutive submissions in the same browser.

## 2026-08-28 - Academic goals and research approach documented

### Completed

- Defined the project as a human-in-the-loop situated language understanding
  study for household food-state management.
- Added six research questions covering relevance, data sources, modular versus
  end-to-end modeling, temporal grounding, annotation efficiency, and edge
  deployment.
- Recorded major language, data, architecture, safety, evaluation, and
  deployment choices with their rationale.
- Documented rejected alternatives, experimental design, validity threats,
  ethics, expected contributions, current status, and selected foundations.

## 2026-08-28 - Documentation categorized

### Completed

- Grouped planning, annotation, ML/data, decision, and operations documents into
  dedicated `docs/` subdirectories.
- Updated the documentation index, repository README, ML README, and
  cross-category links.

## 2026-08-28 - Documentation centralized

### Completed

- Moved all detailed root-level Markdown documents into `docs/`.
- Kept the root `README.md` and package-specific `ml/README.md` at their
  conventional entry points.
- Added `docs/README.md` as a categorized documentation index.
- Updated repository, ML, and cross-document links for the new paths.

## 2026-08-28 - Beginner model-building specification documented

### Completed

- Explained why Jangoing fine-tunes pretrained models instead of pretraining a
  language model from scratch.
- Defined separate relevance, intent, slot, and deterministic normalization
  responsibilities.
- Recorded the current and planned Python ML stack, starter DistilBERT
  hyperparameters, hardware expectations, and artifact sizes.
- Added a synthetic TF-IDF hands-on exercise and explained its artifacts.
- Documented current trainer limitations and the implementation sequence needed
  before production model deployment.
- Added official Scikit-learn, PyTorch, Hugging Face, Datasets, and ONNX
  references.

## 2026-08-28 - Temporal annotation stack deployed

### Completed

- Pushed the temporal implementation and action-item roadmap.
- Deployed the Cloudflare Worker and Vercel annotation UI.
- Seeded `annotation-queue-seed-v2` into production D1.
- Updated the operational checklist to reflect deployment completion.

### Next

- Verify the Temporal context card and `tomorrow` normalization on one
  production expiry sample.
- Begin the 300 training / 100 evaluation workflow pilot.

## 2026-08-28 - Operational action-item checklist added

### Completed

- Added one checklist connecting the current temporal implementation to
  production deployment, annotation collection, dataset export, and training.
- Defined a 300/100 workflow pilot, 1,000/200 first baseline, and
  3,000-5,000/500 English MVP dataset gates.
- Added intent, relevance, entity-span, duplicate, phrase-family leakage, and
  reproducibility requirements.
- Clarified that generated or AI-drafted candidates count only after human
  review.

### Next

- Deploy and verify temporal grounding in production.
- Complete the workflow pilot before scaling annotation volume.

## 2026-08-28 - Temporally explicit annotation seed v2 added

### Completed

- Replaced shared hidden expiry seed dates with explicit phrase-level
  `reference_date`, `timezone`, and expected ISO cases.
- Aligned synthetic inference timestamps to each date case.
- Added the `annotation-queue-seed-v2` source and a distinct deterministic UUID
  namespace, preserving all v1 rows and annotations.
- Made repeated v2 imports non-mutating with `ON CONFLICT DO NOTHING`.
- Excluded every `annotation-queue-seed-v*` source from actual-user queues.
- Added regression checks for every configured date case and every generated
  expiry phrase, including holdout examples.

### Decision

- Seed meaning is immutable after publication; semantic changes require v3
  rather than modifying v2 rows.
- Seed data remains synthetic provenance and must never enter correction,
  confirmed, or evaluation queues intended for actual user traffic.

### Deployment

- No D1 schema migration is required.
- Run the existing remote seed command after deploying the updated Worker to
  insert v2 records. Existing v1 rows are not overwritten.

## 2026-08-28 - Expiry queue temporal context exposed

### Completed

- Added temporal context and optional normalized expiry suggestion to the
  shared annotation queue contract.
- Preserved the actual inference `created_at` in queue responses instead of
  returning the later resolution timestamp.
- Reused one inline-expiry extractor across runtime parsing and queue
  suggestions, including `expires`, `expiration date`, `best by`, and `use by`.
- Normalized queue suggestions on the server from stored reference date and
  timezone.
- Added an expiry annotation card showing reference date, timezone, original
  inference time, and normalized suggestion.
- Made the apply helper prefer the server-grounded value over legacy reviewed
  or parser values.

### Decision

- Browser time is display-only during annotation and never changes temporal
  meaning.
- Queue sorting may still use resolution time, but the returned original
  inference timestamp must remain semantically accurate.

### Remaining

- Expiry seed v2 must replace hidden shared-date assumptions with explicit
  per-example temporal cases.

## 2026-08-28 - Assistant expiry proposals grounded to inference time

### Completed

- Loaded `request_context` and original `created_at` for Worker and local
  assistant proposal requests.
- Included effective `reference_date` and `timezone` in assistant prompt v6.
- Restricted the LLM to exact expiry span identification instead of calendar
  calculation.
- Ignored model-supplied expiry normalization and recomputed it with the shared
  deterministic normalizer.
- Dropped only an unparseable expiry entity while preserving its action and
  other valid entities.
- Added prompt, valid relative-date, invalid model-date, and stored-context
  fallback regression tests.

### Decision

- An LLM may identify temporal language but is not a calendar authority.
- Old records with missing or malformed request context fall back to the
  original inference timestamp in UTC, never the later proposal timestamp.

### Remaining

- Queue responses and `/annotate` still need to expose this context and the
  server-derived expiry suggestion.

## 2026-08-28 - Shared temporal grounding added

### Completed

- Added one shared temporal-grounding module for the parser and upcoming
  annotation-assistant paths.
- Made explicit request `reference_date` authoritative and derived a missing
  date from the request timestamp in the validated user timezone.
- Added a safe UTC fallback for missing or invalid timezones.
- Persisted effective temporal context in both Worker and local inference logs
  instead of nullable client input.
- Added deterministic relative-date, delayed-processing, timezone-boundary,
  invalid-timezone, and invalid-date regression tests.

### Decision

- Relative language is always grounded to the original inference context.
- Annotation time and assistant processing time must never reinterpret an
  existing utterance.
- Calendar normalization remains deterministic code rather than an LLM task.

### Remaining

- Assistant drafts, annotation queue responses/UI, and expiry seed v2 still
  need to consume this shared temporal context.

## 2026-08-28 - Annotation queue and purpose preferences persisted

### Completed

- Stored the last selected queue type and dataset purpose in browser
  `localStorage`.
- Reloaded the last queue on page refresh instead of always returning to
  `generated_review`.
- Preserved dataset purpose while switching queues and loading the next sample
  after submission.
- Added an active visual state and accessible `aria-pressed` value to the
  selected queue button.
- Kept the annotation page usable when browser storage is unavailable.

### Decision

- Queue source and dataset purpose are independent annotator choices.
- Evaluation holdout no longer silently overrides a deliberately selected
  purpose; the annotator must verify the metadata before saving.

## 2026-08-28 - Relevance candidate dataset generated

### Completed

- Added a deterministic relevance candidate generator and versioned scenario
  file.
- Generated 200 contextual/preference, 300 domain non-actionable, and 100
  unrelated candidates.
- Added duplicate, class-count, phrase-family, grocery-overlap, candidate-only,
  and manifest-hash validation.
- Preserved imported generated phrase families through reviewed relevance
  export so family leakage checks remain effective.
- Documented production import and a 120-record pilot annotation plan.

### Decision

- Prioritize domain-adjacent hard negatives over easy unrelated negatives.
- Keep generated relevance as queue metadata, not supervised ground truth.
- Use existing reviewed actionable data for the fourth relevance class rather
  than duplicating it in this non-actionable candidate corpus.

## 2026-08-28 - Conversation and activation metadata foundation added

### Completed

- Added optional `conversation_id`, `turn_index`, `speaker_role`, and
  `activation_mode` fields to the interpretation request contract.
- Required `conversation_id` whenever `turn_index` is present.
- Persisted all four values in the existing inference `request_context` for
  both Worker and local API paths.
- Added the metadata to reviewed dataset exports.
- Made browser text requests explicitly identify `speaker_role = user` and
  `activation_mode = manual_text`.
- Added contract and export tests.

### Decision

- Keep activation metadata separate from utterance text.
- Strip a wake word before downstream NLU rather than training the relevance
  model to depend on it.
- Use existing request-context JSON, so this step requires no D1 migration.

### Limitation

- This records conversation structure but does not resolve pronouns, ellipsis,
  or references from earlier turns. A context resolver remains future work.

## 2026-08-28 - Relevance review queues added

### Completed

- Added `preference_context`, `domain_non_actionable`, and
  `unrelated_negative` queue types across contracts, API, and `/annotate`.
- Extended generated JSONL import to accept non-actionable `relevance` records
  without requiring an inventory intent.
- Stored generated labels in `request_context.candidate_relevance` and used
  them only to preselect the annotation UI.
- Kept candidate-relevance records out of the general actionable
  `generated_review` queue.
- Added query and UI-payload tests for all three queue classes.

### Decision

- Do not infer these queues from grocery keywords; that would encode the same
  lexical shortcut the relevance model is intended to avoid.
- Human-saved `annotations.relevance` is ground truth. Candidate relevance is
  routing metadata only.
- Keep fully unrelated negatives smaller than domain-adjacent hard negatives.

## 2026-08-28 - Relevance dataset export added

### Completed

- Added `--task relevance` to the reviewed train/evaluation export.
- Required human annotations for relevance data and retained all four relevance
  classes, including actionless non-actionable records.
- Added `relevance` to every exported dataset record.
- Excluded non-actionable records from `intent`, `slots`, and `joint` exports.
- Added tests for CLI parsing, task filtering, and legacy action cleanup.

### Decision

- Relevance is trained as an utterance-level task.
- Intent and slot models receive only actionable utterances; preference,
  domain-adjacent, and unrelated speech must not become false `unknown` actions.

## 2026-08-28 - Relevance-first annotation UI added

### Completed

- Added a four-way relevance selector immediately after sample creation.
- Kept parser intent as supporting information rather than using it to infer
  relevance automatically.
- Limited AI draft, action, phrase-family, and entity controls to actionable
  utterances.
- Saved contextual/preference, domain non-actionable, and unrelated examples
  with empty action lists.
- Updated the annotation guide and convention so new non-actionable records no
  longer require legacy `unknown` actions.

### Decision

- Relevance is an utterance-level judgment; intent remains an action-level
  judgment.
- Unsupported but clear requests remain actionable and use
  `unknown > unsupported_request`.

## 2026-08-28 - Relevance schema and persistence added

### Completed

- Added a shared relevance enum for actionable, contextual/preference,
  domain-related non-actionable, and unrelated utterances.
- Allowed non-actionable annotations to store an empty action list while
  retaining the requirement that actionable annotations contain an action.
- Added D1/SQLite migration `0008_add_annotation_relevance.sql`.
- Updated both Worker and local API storage paths to persist relevance and write
  annotation schema version `annotation-v3`.
- Added schema tests for valid and invalid relevance/action combinations.

### Compatibility

- Existing clients that omit relevance continue to be treated as `actionable`.
- Existing preference and unrelated annotations are backfilled from legacy
  phrase families during migration.

### Next

- Collect reviewed relevance data and design the first relevance-classification
  baseline.
- New annotations treat `ITEM_CONDITION` as legacy-only. Product-identity
  modifiers stay inside ITEM (`frozen blueberries` -> `frozen_blueberry`),
  while temporary state and intent-trigger wording (`spoiled`, `gone bad`,
  `out of`) stays as raw context for intent and phrase-family learning.
- Shared canonical defaults now also include `blueberry`, and the synthetic
  taxonomy no longer treats condition-like phrases such as `ripe bananas` or
  `fresh strawberries` as plain ITEM aliases.
- `/annotate` now auto-loads one `generated_review` sample on first page entry
  so annotation can start immediately from pregenerated coverage data.
- After each successful save, `/annotate` now automatically opens the next item
  from the current queue, or falls back to `generated_review` after manual-entry
  annotations.
- After each successful save, `/annotate` also resets the page scroll to the top
  so the next sample starts at the beginning of the workflow.
- Freeform normalized-value dropdowns now show only actual canonical values, and
  new ITEM/CATEGORY/UNIT values can be added inline with a
  `Save ...` helper.
- Newly added entity cards now appear at the top of the current action group
  instead of being reordered to the bottom by text span position.
- Browser text selection in `/annotate` now trims leading and trailing
  whitespace before creating an entity span, so double-click word picks do not
  accidentally save the following space.
- `synthetic-v1` now regenerates against a broader grocery taxonomy with 34
  canonical food/drink items and rotates English aliases so generated_review
  coverage is less concentrated on the original tiny item set.
- The repo now includes a Korean survey of relevant open-source datasets and a
  practical import priority order, separating general NLU corpora from grocery
  vocabulary sources and recommendation-only datasets.
- `mark_out` / `item_marked_out` now exist as first-class runtime actions, so
  `we have no milk` can drive an explicit inventory-to-zero update instead of
  being forced into clarification-only handling.

## 2026-08-27 - Product identity versus temporary condition clarified

### Completed

- Updated annotation convention to v4 and assistant prompt to distinguish
  identity-changing modifiers from temporary conditions.
- Full product mentions such as `frozen blueberries`, `oat milk`, and
  `diet Coke` are one ITEM span with distinct canonical values.
- Temporary state and intent-trigger wording such as `spoiled`, `moldy`,
  `no longer usable`, and `out of` remains unlabeled raw context.
- Added server tests for both boundaries: `frozen blueberries` remains a full
  ITEM, while an AI-proposed legacy ITEM_CONDITION is discarded.

### Decision

- The operational test is whether the phrase identifies a product that should
  be stored, bought, searched, or recommended separately. If yes, include it
  in ITEM; if it only describes the current state or requested action, leave it
  outside the entity span.

## 2026-08-27 - Item-condition annotation support added (superseded by v4)

### Completed

- Added `ITEM_CONDITION` to the shared annotation entity-label contract.
- Added default normalized-value suggestions for common condition values such as
  `ripe`, `fresh`, `spoiled`, `frozen`, and `thawed`.
- Updated `/annotate` so ITEM_CONDITION can be labeled, requires a normalized
  value, and can grow its canonical list inline with the same `Save ...`
  workflow used by ITEM/ITEM_CONDITION/CATEGORY/UNIT.
- Updated normalized-value aggregation so reviewed ITEM_CONDITION values are
  returned from the API and reused as future annotation suggestions.
- Added schema and aggregation tests for condition entities.
- Added `blueberry` to the shared canonical item defaults and cleaned the
  synthetic taxonomy to stop treating condition phrases as plain item aliases.

### Decisions

> Historical decision below is retained as an implementation log. Annotation
> convention v4 supersedes it: `frozen` belongs inside ITEM when it identifies
> a separately stored or purchased product.

- Treat temporary state modifiers such as `ripe`, `frozen`, `spoiled`, and
  `moldy` as `ITEM_CONDITION`, not as part of ITEM canonical identity.
- Keep subtype or market-name expressions such as `oat milk`, `green tea`,
  `ground coffee`, and `baby spinach` inside `ITEM` unless the household wants
  a separate canonical item.
- Keep annotation normalization at the user's mention granularity:
  `milk` stays `milk`, `whole milk` stays `whole_milk`, and later inventory
  resolution can connect a generic mention to a household-specific subtype.
- Limit this change to annotation/data-contract support for now; runtime parser
  and event semantics for condition-aware actions remain future work.
- Keep synthetic-v1 free of alias-embedded condition phrases, but defer full
  synthetic `ITEM_CONDITION` span generation to a later dataset pass.

### Validation

- `python3 ml/data_generation/generate_synthetic.py`
- `npm run test --workspace @jangoing/api`
- `npm run typecheck`

## 2026-08-27 - Open dataset adoption plan documented

### Completed

- Added `OPEN_DATASETS_KO.md` to document the most relevant open-source dataset
  candidates for `jangoing`.
- Separated dataset candidates by real use: NLU bootstrap, grocery vocabulary
  expansion, multi-turn reference, and later recommendation data.
- Documented why MASSIVE and SNIPS should be used as general NLU/bootstrap
  corpora rather than directly merged into `jangoing` intent labels.
- Documented why grocery-focused datasets such as GroceryList and
  grocery-ner-dataset are more appropriate for taxonomy and slot/entity support.
- Added a recommended adoption order and raw-to-mapped provenance guidance.

### Decisions

- Treat public datasets as auxiliary sources, not as replacements for reviewed
  `jangoing` annotations.
- Prefer schema-safe partial reuse over aggressive label remapping when intent
  semantics do not cleanly match the project contract.

## 2026-08-27 - Synthetic grocery coverage expanded

### Completed

- Expanded `ml/taxonomy/grocery-v1.json` from the original tiny starter set to
  34 canonical products across dairy, produce, greens, protein, breakfast,
  staple, beverage, snack, and sweet categories.
- Updated the synthetic generator so it no longer always uses the first alias
  for each product/category and instead rotates deterministic English surface
  aliases for broader wording coverage.
- Regenerated `ml/datasets/synthetic-v1.jsonl` and
  `ml/manifests/synthetic-v1.json` with the broader vocabulary.
- Expanded shared annotation ITEM defaults so generated_review annotation has
  first-class suggestions for the newly introduced canonical items.
- Added a dataset regression check that now expects at least 20 distinct
  `item_name` canonical values and specific new foods such as `oat_milk`,
  `spinach`, `chicken`, `pasta`, and `tea`.

### Decisions

- Keep `synthetic-v1` at 800 balanced records for now instead of inflating the
  count, so baseline comparisons remain simpler while item variety improves.
- Prefer broader canonical coverage plus deterministic alias rotation over
  purely increasing template count, because the current bottleneck was item
  diversity more than raw record volume.

### Validation

- `python3 ml/data_generation/generate_synthetic.py`
- `npm run typecheck`
- `npm run test --workspace @jangoing/api`
- `python3 -m pytest ml/tests/test_synthetic_dataset.py` could not run in this
  environment because `pytest` is not installed.
- The annotation convention now includes explicit overlap-resolution rules for
  phrase families such as `finished_item_report` vs `state_out_of_entity` and
  category-level `add_to_buy` vs `vague_category_request`.
- Korean docs now describe the exact assistant-draft API path from browser to
  Worker to OpenAI and back to `annotation_proposals` / `annotations`.
- Production D1 migrations are confirmed through 0005. Migration 0006 and
  redeploy are required before production can persist assistant proposals.
- Production Worker is deployed at `https://jangoing-api.letmetellu.workers.dev`.
- Vercel remains connected to `main` for the existing frontend deployment.
- Recent validation target for this branch: API tests, repo-wide typecheck, and
  web build after the assistant-draft update.
- Active work: collect 100–200 human training candidates and 100+ independent
  evaluation candidates, monitor canonical drift in newly added normalized
  values, measure whether assistant drafts materially speed up annotation, and
  build the first slot-training dataset and baseline.
- Current production counts were 0 training and 0 evaluation candidates at the
  last verified stats request.

## 2026-08-27 - Assistant-driven annotation draft flow added

### Completed

- Added `annotation_proposals` storage via migration `0006_create_annotation_proposals.sql`.
- Added `POST /annotations/proposal` to both the Cloudflare Worker and local
  Node API.
- Added `OPENAI_API_KEY` / `OPENAI_MODEL` support for Worker-side draft
  generation with a deterministic parser fallback when the key is absent.
- Added `/annotate` UI controls to request a draft, apply it, and record whether
  the saved annotation matched the draft or was edited first.
- Hardened proposal materialization so invalid phrase families are dropped
  instead of failing the whole draft.
- Documented the new production setup and annotation rules for assistant drafts.

### Decisions

- Keep AI proposals separate from final annotations so the reviewed annotation
  remains the only ground truth row used for training export.
- Do not block annotation when AI is unavailable; return a parser-based fallback
  so the UI path stays usable.
- Record assistant acceptance only when the annotator explicitly applies the
  draft, not merely because a proposal was generated.

### Next

- Apply migration 0006 to production D1 and redeploy the Worker and web app.
- Evaluate whether span prefill quality is good enough to justify continued API cost.
- Add lightweight analytics later if you want per-provider acceptance rate,
  edit distance, or annotator throughput comparisons.

## 2026-08-27 - Phrase family overlap rules clarified

### Completed

- Added explicit overlap-resolution rules to `ANNOTATION_CONVENTIONS_KO.md` for
  the most ambiguous phrase-family boundaries.
- Clarified `finished_item_report` vs `mark_low` vs `state_out_of_entity`.
- Clarified `consumed_item_report` vs `used_item_report` vs `quantity_consumed`.
- Clarified shopping-related boundaries such as `explicit_add_to_list`,
  `purchase_request`, `need_to_buy`, and `shopping_reminder`.
- Clarified that category-only requests can still be `add_to_buy` when an action
  verb such as `add`, `put on the list`, or `buy` is explicit.

### Decisions

- Prefer explicit action verbs over coarse entity type when separating
  `add_to_buy` from `needs_clarification`.
- Keep `We're out of ...` conservative as a `mark_out > state_out_of_entity`
  observation unless the utterance clearly states a completed consumption event.

### Next

- Revisit these boundaries after more real annotations accumulate and check
  whether any family should split or merge based on disagreement patterns.

## 2026-08-27 - Out-of-stock action promoted to first-class runtime behavior

### Completed

- Added `mark_out` to the shared intent contract and `item_marked_out` to the
  event contract.
- Updated the parser so `we're out of milk`, `we have no eggs`, and similar
  zero-inventory statements resolve to `mark_out`.
- Updated event confirmation flows to map `mark_out` into a persisted
  `item_marked_out` event in both the production Worker and local dev server.
- Updated inventory projection so `item_marked_out` clears remaining batches and
  forces status `out`.
- Moved `state_out_of_entity` from `needs_clarification` to the `mark_out`
  phrase-family set.
- Updated annotation, plan, README, and ML concept docs to reflect the new
  intent.

### Decisions

- Treat `mark_out` as a state observation, not a consumption event. `We have no
  milk` and `We finished the milk` can both end at zero inventory but should not
  share the same intent.
- Keep `mark_out` confirmation-required because it forces inventory to zero and
  is therefore a high-impact state change.

### Next

- Add multi-action runtime execution later for utterances such as `We're out of
  milk, add it to the list` so both `mark_out` and `add_to_buy` can be confirmed
  together from one interpretation.

## 2026-08-27 - Assistant API flow documented

### Cost guardrails added

- Capped annotation assistant output at 500 completion tokens.
- Added migration `0007_log_annotation_ai_usage.sql` to record actual input and
  output tokens plus estimated USD cost per OpenAI proposal.
- Kept parser fallback usage fields null and retained the existing UI busy-state
  guard against repeated clicks while a draft request is in flight.
- Enforced a $5 default monthly annotation-AI budget in the Worker using stored
  proposal cost; `OPENAI_MONTHLY_BUDGET_USD` can override it.

### Completed

- Added a Korean explanation of the assistant-draft API path to
  `ANNOTATION_GUIDE_KO.md`.
- Documented that the browser only calls the project Worker, not OpenAI
  directly.
- Logged the exact proposal lifecycle: Worker lookup from `inference_logs`,
  optional OpenAI request, offset validation/span reconstruction,
  `annotation_proposals` insert, immediate draft application, and final
  `accepted_as_is` / `accepted_with_edits` update.
- Removed the separate `Apply AI draft` step. `Draft with AI` now immediately
  applies actions, phrase families, entity spans, and normalized values so the
  annotator only reviews and edits.
- Added entity highlights in the source utterance and a readable assistant label
  summary for each proposed action.
- Added the complete intent-to-phrase-family convention map to assistant prompt
  v3. The model selects only a family allowed for its chosen intent, while the
  server retains whitelist validation and permits null when no family fits.
- Added reviewed normalized values to assistant prompt v4, grouped by entity
  label and capped at 200 values per label. GPT is instructed to reuse an
  existing semantically equivalent canonical value before proposing a new one.
- Narrowed assistant prompt v5 and the manual label toolbar to downstream
  argument entities. New drafts no longer label ITEM_CONDITION; descriptive
  state and inference phrases remain raw context for intent and phrase-family
  learning. The schema retains ITEM_CONDITION only for legacy compatibility.
- Replaced native normalized-value datalists with real selects so saved
  canonical values remain visible and selectable on mobile Safari. New values
  use an explicit `Enter a new canonical value` mode.
- Documented parser fallback behavior and the conservative exact-substring span
  reconstruction rule.

### Decisions

- Keep the OpenAI integration server-side so the browser never needs the API key.
- Treat dropped unmatched spans as safer than guessed offsets because training
  label precision matters more than aggressive recall in this stage.

### Next

- After production migration 0006, verify one end-to-end proposal row in D1 and
  confirm that `status`, `resolution`, and `applied_annotation_id` update as expected.

## 2026-08-27 - Generated review auto-load enabled

### Completed

- Updated `/annotate` to automatically load one `generated_review` queue item on
  first page entry.
- Documented that pregenerated review is now the default starting queue for a
  fresh annotation session.

### Decisions

- Auto-load only once on initial page entry instead of forcing a queue reload
  after every save.
- Keep manual queue buttons unchanged so the annotator can immediately switch to
  correction, expiry, confirmed, or evaluation-focused work.

### Next

- If this default proves too repetitive, add a user-selectable default queue
  preference later.

## 2026-08-27 - Auto-advance after annotation save enabled

### Completed

- Updated `/annotate` so a successful save immediately loads the next sample
  from the same queue when the current sample came from a queue.
- Added a fallback so manual-entry annotations automatically continue with the
  next `generated_review` sample when available.
- Documented the new auto-advance behavior in the Korean annotation guide.

### Decisions

- Continue within the current queue by default because that preserves the
  annotator's active workflow better than always jumping back to a single queue.
- Reset to an empty editor only when no next sample is available in the chosen
  queue.

### Next

- If annotators need a pause point, add a toggle later for auto-advance on/off.

## 2026-08-27 - Normalized value add-to-list flow simplified

### Completed

- Changed freeform normalized-value datalist options to display only the actual
  canonical value string.
- Added an inline `Save ...` helper button for ITEM, CATEGORY, and UNIT
  normalized values.
- The helper now converts entered text into lower_snake_case before saving it to
  the current session's suggestion list, for example `oat milk` -> `oat_milk`.
- Added client-side validation so freeform normalized values must be stored in
  lower_snake_case before annotation save.
- Updated the Korean annotation guide and conventions with the new UI flow and
  canonical-format rules.

### Decisions

- Keep the add-to-list action inline next to the input so annotators do not need
  a separate admin screen just to grow the canonical vocabulary.
- Show only canonical values in suggestions because mixing display labels with
  stored values made duplicates look worse than they really were.

### Next

- If annotators still create near-duplicates, add similarity warnings such as
  showing close existing values before saving a new canonical value.

## 2026-08-27 - Generated review queue added

### Completed

- Added a dedicated `generated_review` annotation queue for pregenerated JSONL datasets.
- Added `annotation:import-generated` for local or remote import of pregenerated review candidates.
- Imported records now store parser prediction and pregenerated reference interpretation together in `inference_logs`.
- Updated `/annotate` with a `Load generated review` button and queue notice.
- Documented that pregenerated data should bootstrap coverage, not replace real reviewed traffic.

### Decisions

- Keep pregenerated data in its own queue instead of mixing it into `correction` or `confirmed`.
- Treat `correction`, `confirmed`, and `evaluation_holdout` as actual-user queues.
- Use pregenerated references as annotation starting points, not as unquestioned final truth.

### Next

- Consider entity prefill from pregenerated references if annotation speed becomes the main bottleneck.
- Later, add dataset-label filters if multiple pregenerated corpora need to coexist in production.

## 2026-08-27 - Deterministic annotation queue seeding added

### Completed

- Added a deterministic queue-seeding generator for correction, expiry,
  low-confidence, confirmed, and evaluation-holdout annotation queues.
- Added a local/remote seeding script at
  `apps/api/scripts/seed-annotation-queues.ts`.
- Added root and API workspace commands so queue seed data can be created with
  one npm command.
- Made the local seeding path auto-create the SQLite database and apply
  migrations through 0005 when needed.
- Documented how to prefill queue data for annotation sessions.
- Documented the production-only annotation rule: Vercel `/annotate` must be
  paired with remote seeding and remote export, not local SQLite.
- Added a production-only command cheat sheet for multi-laptop annotation
  workflow.
- Documented how to inspect queue seed rows in D1 and clarified that queues are
  derived from `inference_logs`, not stored as separate tables.
- Documented that seed/synthetic data are bootstrap aids and should not remain
  the dominant long-term training distribution.

### Decisions

- Seed `inference_logs` directly because queue loading only depends on reviewed
  inference state, not on events or annotations.
- Keep seed IDs deterministic and stable so reruns refresh the same namespace
  instead of creating unbounded duplicate traffic.
- Leave previously annotated seeded rows intact; reruns upsert the same reviewed
  examples rather than deleting rows that may already have annotation history.

### Next

- If the curated seed traffic starts feeling repetitive, add a v2 seed set with
  more lexical variety while keeping the same queue semantics.
- Use the seed script mainly for annotation bootstrapping and UI workflow
  testing, not as a substitute for real reviewed user traffic.

## 2026-08-27 - Dynamic normalized annotation values added

### Completed

- Added `GET /annotations/normalized-values` for both the Worker and local API.
- Merged shared seed values with distinct normalized values already present in
  reviewed annotations.
- Updated `/annotate` so ITEM, CATEGORY, and UNIT can reuse suggestions or
  accept new canonical values directly.
- Kept LOCATION constrained to contract values and EXPIRY_DATE constrained to
  the ISO date picker.
- Updated annotation docs to replace the old "leave blank and propose later"
  workflow with immediate canonical-value entry.

### Decisions

- Use shared contracts only as the seed vocabulary, not the full long-term
  closed list for item-style labels.
- Let reviewed annotation history grow the reusable vocabulary automatically
  instead of creating a separate approval queue first.
- Keep strict controls for LOCATION and EXPIRY_DATE because they must remain
  aligned with product contract semantics, not annotator creativity.

### Next

- Add monitoring or lightweight review for canonical drift such as duplicate
  forms (`oatmilk` vs `oat_milk`) once more real data accumulates.
- Consider surfacing normalized-value search or taxonomy cleanup tools if the
  dynamic list grows noisy.

## 2026-08-27 - Reference date and timezone persistence added

### Completed

- Added optional `timezone` to the interpret request contract.
- Sent the browser timezone with each text interpretation request.
- Stored both `reference_date` and `timezone` in inference-log request context.
- Included `reference_date` and `timezone` in reviewed dataset export records.
- Added export tests covering request-context persistence.

### Decisions

- Persist timezone now even before using it deeply in normalization so reviewed
  datasets keep enough context for later reprocessing and audits.
- Keep annotation records linked to inference context through `inference_id`
  instead of duplicating the same date metadata into a second table right now.

### Next

- Surface date-context metadata in annotation and debugging workflows when needed.
- Use timezone-aware evaluation once natural-date coverage expands beyond the current expiry-only parser.

## 2026-08-27 - Natural-language expiry normalization added

### Completed

- Added `chrono-node`-based expiry parsing for explicit phrases such as
  `expiring tomorrow`, `expires next Friday`, and
  `with expiry date on August twenty-eighth`.
- Added optional `reference_date` to the interpret request contract.
- Sent the browser's local date as the default reference date for text parsing.
- Stored `reference_date` and later `timezone` alongside request context in inference logs.
- Added parser tests covering natural and relative expiry phrases.

### Decisions

- Restrict natural-date parsing to explicit expiry markers so generic date
  phrases are less likely to be misread as expiration dates.
- Keep inline `YYYY-MM-DD` support unchanged and let an explicit date-picker
  value override any parsed natural-language expiry.

### Next

- Expand date handling beyond expiry-only phrases if the product needs it.
- Add stronger ambiguity handling for vague natural-language date expressions.

## 2026-08-27 - Task-aware reviewed export filters added

### Completed

- Added `--task intent|slots|joint` to reviewed dataset export.
- Added `--require-annotation` for intent-only runs that still want annotation-backed rows.
- Made `slots` and `joint` exports automatically require reviewed annotations.
- Added tests for task parsing and filtering of corrected-but-unannotated rows.

### Decisions

- Keep `intent` export permissive by default because corrected reviewed rows are
  still useful supervision for intent classification.
- Make `slots` and `joint` exports annotation-only because span supervision must
  not mix with reviewed rows that have no entity labels.

### Next

- Add normalized-value completeness checks for reviewed annotation exports.
- Consider a first-class single-action-only export mode for the current baseline.

## 2026-08-27 - Split reviewed dataset export enforced

### Completed

- Refactored dataset export parsing and record-building into reusable helpers.
- Changed reviewed export to require separate training and evaluation output files.
- Added leakage validation so identical normalized text or phrase families cannot
  cross training and evaluation exports.
- Added tests covering CLI arguments, split separation, duplicate IDs, and
  cross-split leakage detection.

### Decisions

- Remove the legacy single `--output` mode because it encourages accidental
  mixing of training and evaluation data.
- Fail export early when a reviewed split is empty or when leakage is detected,
  rather than silently writing a misleading dataset.

### Next

- Add task-specific export modes such as `intent`, `slots`, or `joint`.
- Add a `reviewed-only`/`require-annotation` filter for slot-supervised training.

## 2026-08-27 - Prioritized annotation queues added

### Completed

- Added queue-backed annotation sample loading to `/annotate`.
- Added correction, expiry, low-confidence, confirmed, and evaluation-holdout queues.
- Prefilled reviewed intent information when a corrected example already has a
  saved reviewed interpretation.
- Defaulted evaluation-holdout samples to `evaluation_candidate`.

### Decisions

- Do not expose a free-browsing raw-log screen; load one prioritized sample at a
  time for the annotation workflow.
- Use separate queues to balance error-focused labeling, real-distribution
  coverage, and evaluation-set collection.

### Next

- Add annotator/admin controls if queue access later needs authentication or audit history.

## 2026-08-27 - Documentation synchronized with annotation-v2

### Completed

- Updated all project Markdown files to reflect multi-action annotation-v2.
- Documented controlled values, semantic phrase families, collection counters,
  migration 0005, production Worker status, and current validation results.
- Aligned ML guidance around synthetic bootstrap training, human candidate
  collection, single-intent baseline exclusions, and frozen-set approval.
- Replaced stale setup, milestone, test-count, and next-step descriptions.

## 2026-08-27 - Annotation collection counters added

### Completed

- Added production counts for training and evaluation candidates.
- Displayed progress against the initial 100–200 training and 100+ evaluation goals.
- Updated counters immediately after a successful annotation save.
- Added responsive progress cards and documented that quantity does not replace quality.

## 2026-08-27 - Multi-action annotation-v2 implemented

### Completed

- Replaced the single intent annotation payload with one-to-eight action groups.
- Connected intent, phrase family, entities, and normalized values per action.
- Added D1 migration 0005 while preserving legacy v1 columns and records.
- Updated local and Worker APIs, reviewed-dataset export, and baseline filtering.
- Added action selection, action creation/removal, and action-specific spans to UI.

### Decisions

- Store `{ intent, phrase_family, entities, normalized }` per action.
- Allow a source span to be reused across actions but not overlap within one action.
- Do not mislabel a multi-action record with only its first intent during export.
- Exclude multi-action records from the existing single-intent baseline and log the count.
- Retain legacy columns populated from the first action for operational compatibility.

## 2026-08-27 - Annotation keyboard submission added

### Completed

- Added Enter-to-create behavior to the annotation sentence field.
- Reserved Shift+Enter for an intentional line break.
- Avoided submitting while an IME composition is active.

## 2026-08-27 - Controlled phrase families added

### Completed

- Replaced the free-text phrase-family field with an intent-specific dropdown.
- Added semantic family names for all eight current intents.
- Reset phrase family whenever the annotator changes intent.
- Added API schema validation for intent and phrase-family combinations.
- Documented how to propose a genuinely new phrase family without forcing a match.

### Decisions

- Use human-readable semantic families for real annotations instead of synthetic
  generator identifiers such as `template-01`.
- Keep phrase-family options in the shared contracts package.
- Continue allowing an empty family when no controlled option is correct.

## 2026-08-27 - Controlled normalized values added

### Completed

- Replaced free-text normalized values with label-specific dropdown menus.
- Reused grocery-v1 canonical product/category IDs and contract locations.
- Added controlled quantity and unit values, plus an ISO date picker for expiry.
- Documented the process for values that are not yet in the controlled vocabulary.

### Decisions

- Do not allow arbitrary normalized strings from the annotation UI.
- Leave a value empty and record it in notes instead of selecting a false match.
- Keep the controlled values in the shared contracts package so the UI has one
  typed source of truth.

## 2026-08-27 - Annotation convention documented (upgraded to v2)

### Completed

- Added a Korean annotation convention separate from the UI operation guide.
- Defined intent boundaries, entity span rules, ITEM/CATEGORY decisions,
  canonical normalization, phrase families, and train/evaluation candidates.
- Added conservative rules for implicit out-of-stock statements and missing context.
- Added a checklist and a versioned process for resolving future edge cases.

### Decisions

- Treat the raw utterance as immutable annotation evidence.
- Do not infer an explicit shopping-list action from `We're out of ...` alone.
- Use `needs_clarification` when the current sentence lacks enough context.
- Keep category-level expressions generalized for the later recommendation system.

## 2026-08-26 - Production annotation workspace added

### Completed

- Added a dedicated `/annotate` page linked from the kitchen dashboard.
- Added intent labeling, exact text selection, entity labels, normalized values,
  train/evaluation purpose, phrase family, and notes.
- Added D1 annotation schema with server-side span and overlap validation.
- Included annotation entities and metadata in local and remote dataset export.
- Added a non-sensitive annotation count without exposing prior raw utterances.

### Decisions

- Publish the annotation input page without login as explicitly requested.
- Do not expose an unauthenticated queue of existing conversational text.
- Treat evaluation selection as a candidate until separate frozen-set approval.

### Validation

- TypeScript tests, typecheck, Worker build, and Next.js build pass.
- A local annotation with ITEM span and normalized value persisted successfully.
- The saved span, dataset purpose, and phrase family exported to JSONL.

### Blockers

- Public write access permits low-quality or abusive annotations.
- No annotation edit, adjudication, or authenticated review queue exists yet.

### Next

- Completed later: migrations 0004 and 0005 and the Worker redeployment.
- Active: use `/annotate` to collect independent real English evaluation candidates.

## 2026-08-26 - English synthetic-v1 bootstrap generated

### Completed

- Added `needs_clarification` as a distinct intent and reviewable non-event outcome.
- Added a multilingual-ready grocery taxonomy with canonical IDs and en/ko aliases.
- Generated 800 English records across eight balanced intents.
- Added exact entity spans, normalized values, locale, phrase families, difficulty,
  source, generator version, and taxonomy version.
- Added deterministic generation, duplicate/span validation, and a dataset manifest.
- Changed grouped splitting to remain balanced by intent.

### Decisions

- Start training with English while keeping schema and taxonomy multilingual-ready.
- Use deterministic scenarios and seed for v1 reproducibility.
- Keep `unknown` separate from requests that require clarification.
- Use synthetic-v1 only for bootstrap training, never as the final human test set.

### Validation

- 800 total records; 100 per intent.
- Zero duplicate texts and zero entity-span errors.
- Grouped split test keeps phrase families isolated and all intents represented.
- TF-IDF grouped-holdout smoke Macro-F1: 0.1875 on 80 records.

### Blockers

- No real frozen human test set exists yet.
- Production correction UI does not support entity-span annotation.

### Next

- Collect real English interactions for validation and final testing.
- Review taxonomy coverage before connecting a category resolver to production.

## 2026-08-26 - First measurable model-learning loop built

### Completed

- Added default inference logging with prediction, request context, parser,
  normalizer, schema version, latency, timestamp, and outcome.
- Connected confirmed, corrected, and cancelled UI outcomes to inference IDs.
- Added reviewed JSONL export with dataset-safe local output.
- Added Python dataset validation and phrase-family grouped splits.
- Added a CPU TF-IDF plus logistic-regression intent baseline.
- Added reproducibility metadata: dataset digest, Git commit, seed, Python
  version, split counts, class metrics, and confusion matrix.

### Decisions

- Keep pending/cancelled interactions for product analysis but exclude them from
  supervised baseline exports until they receive reviewed labels.
- Prevent phrase families from crossing train, validation, and test splits.
- Keep raw data and model artifacts out of Git.

### Validation

- Eight TypeScript parser/projection tests pass.
- ML grouped-split test passes on Python 3.12.
- A 20-record fixture trains and evaluates the baseline successfully on CPU.
- A live local request records an inference ID and cancelled outcome in SQLite.

### Blockers

- Real reviewed data is not yet large enough for meaningful model metrics.
- Entity-span labeling is still required before training a slot model.

### Next

- Apply migration 0003 locally and remotely.
- Collect 250 to 400 reviewed utterances across at least two intents.
- Add span annotation and the versioned category taxonomy contract.

## 2026-08-26 - Generalized item and category language planned

### Completed

- Added category-level language such as `we're out of drink` to the model roadmap.
- Defined a versioned product taxonomy for aliases, brands, category hierarchies,
  regional terms, and household-specific vocabulary.
- Added category ambiguity, clarification, dataset coverage, and evaluation requirements.

### Decisions

- Preserve the original surface phrase separately from the resolved entity.
- Use household context and confidence thresholds instead of expanding broad
  categories into arbitrary products.
- Require confirmation before a category interpretation changes inventory or a list.

### Validation

- The requirement is represented in language schema, dataset, contextual-model,
  success-metric, and risk sections of the plan.

### Blockers

- The initial taxonomy format and canonical grocery category source are not selected.

### Next

- Define the taxonomy contract and baseline category resolver before model training.

## 2026-08-26 - Model-first north star and evaluation standard defined

### Completed

- Reframed jangoing around model training, validation, and measurable progress.
- Defined default inference, correction, experiment, latency, and outcome logging.
- Added contextual conversation understanding and explainable recommendation roadmaps.
- Added offline, slice, calibration, ranking, safety, and online evaluation metrics.
- Documented the correct monorepo-specific Wrangler deployment commands.

### Decisions

- Treat the product as the model data and evaluation environment.
- Require reproducible evidence and release gates for every model promotion.
- Keep context structured, permissioned, versioned, and auditable.
- Begin recommendations with rules and retrieval before learned ranking.

### Validation

- Documentation agrees on the north star, staged milestones, and deployment path.

### Blockers

- All-attempt inference logging and an experiment dashboard are designed but not implemented.
- Deal recommendations require an explicit external data-provider decision.

### Next

- Implement all-attempt inference logging before collecting the first model dataset.
- Apply D1 migrations and deploy the API from the API workspace.

## 2026-08-26 - Editable interpretation review added

### Completed

- Replaced the read-only interpretation preview with editable action, item,
  quantity, unit, location, and expiry fields.
- Added a correction-data migration that retains the original prediction and
  the user's confirmed values alongside the resulting event.
- Allowed unsupported commands to be recovered by selecting a valid action and
  filling in the corrected fields.

### Decisions

- Store prediction and correction snapshots separately from inventory events.
- Record confirmations that needed no edits as useful reviewed examples too.
- Version the current deterministic parser as `rules-v1`.

### Validation

- Eight parser and projection tests pass.
- All TypeScript workspaces pass type checking.
- Cloudflare Worker dry bundle and Next.js production build succeed.

### Blockers

- `None` for local development. Production requires applying migration 0002.

### Next

- Apply the correction migration to D1 and deploy the API and web app.
- Add natural English date normalization.

## Entry Template

```markdown
## YYYY-MM-DD - Short title

### Completed

- What changed

### Decisions

- Decision and reason

### Validation

- Commands, tests, or manual checks performed

### Blockers

- `None`, or a specific blocker and owner

### Next

- The next concrete task
```

## 2026-08-26 - Language limitations and model roadmap defined

### Completed

- Documented the current deterministic parser limits.
- Recorded the failure case where a natural expiry phrase becomes part of `item_name`.
- Defined the hybrid intent, slot extraction, and normalization architecture.
- Added dataset, evaluation, ONNX deployment, and Raspberry Pi milestones.

### Decisions

- Do not ask the model to calculate calendar dates.
- Extract raw expiry spans and normalize them with reference date and timezone.
- Build correction logging before training a custom model.
- Train separate DistilBERT intent and slot baselines before considering a joint model.

### Validation

- The roadmap uses the existing intent, slot, event, and confirmation contracts.
- Model and normalizer errors have separate evaluation criteria.

### Blockers

- The application does not yet provide editable interpretation fields.
- No reviewed command dataset exists yet.

### Next

- Implement the correction UI and correction data schema.
- Add deterministic English date normalization.
- Begin collecting reviewed utterances and parser failures.

## 2026-08-26 - Text MVP scaffold verified

### Completed

- Added npm workspace structure for web, API, and shared contracts.
- Added a Vercel-ready Next.js kitchen dashboard.
- Added a Cloudflare Worker API and D1 event migration.
- Added a persistent Node SQLite server for local development.
- Added English command parsing, confirmation, inventory projection, shopping-list projection, and optional expiry dates.
- Added Cloudflare and Vercel setup instructions.

### Decisions

- Use the Node SQLite server for local development and Cloudflare D1 in production.
- Keep the current parser deterministic until reviewed utterance data is available.
- Use the patched Next.js and Wrangler releases reported clean by npm audit.

### Validation

- All TypeScript workspaces pass type checking.
- Eight parser and projection tests pass.
- The Cloudflare Worker dry bundle succeeds.
- The Next.js production build succeeds.
- npm reports zero vulnerabilities.
- A local `Add two cartons of milk` command was interpreted, confirmed, persisted, and projected with expiry `2026-09-03`.
- The running web app returned HTTP 200.

### Blockers

- Wrangler's local D1 emulator cannot run in the current AgentSpace because its native `workerd` binary requires a newer GLIBC than the host provides. The local Node SQLite server avoids this limitation.
- Cloudflare and Vercel deployment still require account authentication.

### Next

- Create the production D1 database and deploy the Worker.
- Import the repository into Vercel and set `NEXT_PUBLIC_API_BASE_URL`.
- Add the Vercel origin to `ALLOWED_ORIGINS`.

## 2026-08-26 - Text MVP foundation started

### Completed

- Selected English-only language support.
- Selected Vercel for the Next.js web app.
- Selected Cloudflare Workers and D1 for the backend.
- Defined optional batch-level expiry dates.
- Started the text-command vertical slice.

### Decisions

- Use npm workspaces because npm is already available.
- Keep interpretation separate from event creation.
- Use a deterministic parser before training a language model.

### Validation

- Repository state and local Node/npm versions checked.

### Blockers

- Cloudflare and Vercel resources require setup in the user's accounts.

### Next

- Complete and verify the Worker, D1, shared contracts, and Next.js scaffolds.
