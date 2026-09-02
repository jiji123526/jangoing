# Annotation Convention v4

## Document Purpose

This document defines the **gold-label decision rules** used when labeling
English conversational data in `/annotate`. For screen operation details, see
[ANNOTATION_GUIDE.md](./ANNOTATION_GUIDE.md). The goal is to make relevance,
intent, entity spans, normalized values, and dataset purpose as consistent as
possible regardless of who labels the same sentence.

- convention version: `annotation-v4`
- default language/locale: English, `en-US`
- scope: real user expressions and English sentences reviewed by humans
- priority: raw meaning > conversational context > parser prediction

The current screen does not store previous-turn context fields together with
the annotation. Therefore, **if a safe decision cannot be made from the current
sentence alone, do not guess; choose `needs_clarification`.**

## Order for Handling One Sentence

Always decide in the following order.

1. Enter the raw utterance exactly as written, without editing or fixing grammar.
2. Select utterance-level relevance.
3. If the utterance is `actionable`, create one action for each independent
   desired behavior by the speaker.
4. Select the intent for each action.
5. Link only the raw-text expressions needed for that action as entities.
6. Normalize each entity into a canonical value.
7. Assign the phrase family that captures the structure of each action.
8. Choose whether the whole utterance is for independent evaluation or training.
9. Record notes only when the case was not fully resolved by the rules.

If you choose `contextual_preference`, `domain_non_actionable`, or `unrelated`,
do not create actions, intents, entities, or phrase families. Move directly to
dataset metadata.

## Assistant Draft Rules

- `Draft with AI` is a speed-assist feature for the annotator, not a gold-label generator.
- Even if an AI draft is applied, the human remains fully responsible for
  validating intent, entity span, normalized value, and phrase family.
- If the AI invented a span not present in the raw text, over-normalized an
  ambiguous value, or chose the wrong phrase family, do not save it unchanged.
- If there is no OpenAI key, the draft may come from parser fallback. The label
  quality standard is still the same.

## Raw Utterance Preservation Rules

- Preserve capitalization, contractions, typos, and punctuation exactly as entered.
- Do not rewrite `We're out of milk` as `We are out of milk`.
- One input should contain one utterance only.
- Do not enter sensitive content such as personal identifiers, passwords, or
  payment information.
- Do not enter the exact same sentence repeatedly. Meaningful spelling errors or
  different phrasings are allowed as separate utterances.

## Relevance Convention

Relevance is decided before any action. It answers: **what type of signal is
this utterance for the current system as a whole?**

| Relevance | Selection rule | Example |
| --- | --- | --- |
| `actionable` | requires execution, querying, state update, or clarification | `We're out of milk.`, `Find the cheapest milk.` |
| `contextual_preference` | no immediate action, but useful later as preference, goal, or life context | `I love oat milk.`, `I'm trying to eat less sugar.` |
| `domain_non_actionable` | mentions food, shopping, or cooking but is not an action and not durable preference context | `Milk is expensive these days.`, `We had pasta yesterday.` |
| `unrelated` | unrelated to kitchen, food, or household context | `I'm exhausted today.`, `What's the weather?` |

- If the speaker is asking the system for something, `needs_clarification` and
  `unknown` still count as `actionable`.
- A clear but unsupported request is also `actionable`.
  Example: `Find the cheapest milk brand.` -> `actionable` + `unknown > unsupported_request`
- Do not choose `actionable` just because food vocabulary appears.
- For non-actionable relevance, save an empty action list. In new annotation, do
  not create legacy `preference_statement`, `unrelated_statement`, or
  `unrelated_question` actions.

## Intent Convention

Only choose an intent when relevance is `actionable`, and choose it by **the
speaker's goal**, not by keywords. If one sentence contains multiple independent
actions, add multiple actions and attach intent and entities separately. If the
sentence has multiple clauses but only one real goal, do not split actions
unnecessarily.

For example, `Add milk to the list and throw away the spinach` is two actions.
By contrast, `Add milk and eggs to the list` can be treated as one shopping-list
action. If the current normalized object cannot fully represent multiple values
for the same label, split the sentence into multiple actions with the same
intent and explain why in notes.

| Intent | Selection rule | Example |
| --- | --- | --- |
| `add_item` | a request or report that an item came in or should be added to inventory | `Add two cartons of milk.` |
| `update_expiry` | a request or report to add, set, or correct expiry information for an existing item | `The milk expires next Friday.` |
| `set_low_threshold` | a request to set or change the quantity threshold for Low, or to be notified at that point | `Tell me when milk reaches one carton.` |
| `consume_item` | a report that inventory decreased because something was eaten or used | `I used one egg.` |
| `mark_low` | a report that some of the item remains but it is running low | `We're low on eggs.` |
| `mark_out` | a report that current inventory is definitely zero | `We have no milk.` |
| `throw_away` | a request or report to discard an item | `Throw away the spinach.` |
| `add_to_buy` | an explicit request to add something to the shopping list | `Put yogurt on the shopping list.` |
| `query_inventory` | a request asking about possession, quantity, location, or expiry | `Do we have milk?` |
| `needs_clarification` | domain-related, but the safe action or target is unclear | `Put that on the list.` |
| `unknown` | the action meaning is clear, but the goal is outside the supported intent set | `Find the cheapest milk brand.` |

### Expressions About Shortage

- If the meaning is “some remains,” as in `We're low on milk`, choose `mark_low`.
- If the speaker **reports the current remaining quantity**, as in
  `We only have two cartons left`, choose `mark_low`.
- If the speaker **sets a future threshold**, as in
  `Tell me when two cartons are left`, choose `set_low_threshold`.
- If the sentence describes a lasting threshold, as in
  `Milk is low at two cartons`, choose `set_low_threshold`. But if the context
  only says that two cartons remain right now, use `mark_low`.
- If the utterance directly says the current inventory is zero, as in
  `We're out of milk`, `We have no milk`, or `There is no yogurt left`,
  choose `mark_out`.
- If shopping-list addition is **not explicit**, do not convert `mark_out` into
  `add_to_buy`.
- `We're out of milk, add it to the list` becomes two actions.
  Action 1 is `mark_out`, Action 2 is `add_to_buy`.
- `We're out of drinks` follows the same rule, and `drinks` is a `CATEGORY`.

### `add_item` and `update_expiry`

- If the core action is **adding a new item**, as in
  `Add milk expiring next Friday`, use `add_item`.
- If the core action is **adding or changing expiry metadata for an existing
  item**, as in `The milk expires next Friday` or
  `Set the yogurt expiry to Friday`, use `update_expiry`.
- If inventory addition and expiry update are independently present in the same
  sentence, split them into separate actions.

### `unknown` and `needs_clarification`

- If the utterance is actionable but it is unclear what should be done or what
  is being referred to: `needs_clarification`
- If the utterance is actionable and its meaning is clear, but the capability
  is outside the current system: `unknown`
- Preference, domain non-actionable, and unrelated utterances are handled at
  the relevance level only and do not get actions.
- Do not infer an intent just because a plausible action seems personally reasonable.

## Entity Convention

This is not a task of marking every noun in the sentence. Mark only the
information needed to execute or evaluate the **currently selected action**.
Non-actionable relevance gets no entities. Actions of type `unknown` or
`needs_clarification` may validly have no entities.

| Label | Selection rule | Raw example | Example normalized value |
| --- | --- | --- | --- |
| `ITEM` | a specific food or product | `Coke`, `milk`, `apples` | `coke`, `milk`, `apple` |
| `ITEM_CONDITION` | legacy compatibility label. Not used in default new annotation | - | - |
| `CATEGORY` | a higher-level concept covering multiple products | `drinks`, `snacks`, `fruit` | `beverage`, `snack`, `fruit` |
| `QUANTITY` | a number or amount expression | `two`, `a couple` | `2` |
| `UNIT` | the packaging or measurement unit for the quantity | `cartons`, `bottles` | `carton`, `bottle` |
| `LOCATION` | one of the currently supported storage locations | `fridge`, `freezer`, `pantry` | `fridge`, `freezer`, `pantry` |
| `EXPIRY_DATE` | a date expression representing expiry | `tomorrow`, `2026-09-01` | preferably `YYYY-MM-DD` |

### Span Boundaries

- Select only consecutive characters that literally appear in the raw text.
- Exclude meaningless surrounding spaces, articles, possessives, and punctuation.
- Separate quantity and unit rather than merging them:
  `[two] [cartons] of [milk]`.
- In `set_low_threshold`, select the threshold number as `QUANTITY`.
  Example: `Tell me when [milk] reaches [one] [carton].`
- If both the current amount and a threshold appear, as in
  `I have six eggs; alert me at two`, select only `two` as the `QUANTITY` for
  the threshold action unless there is also an explicit separate inventory
  report action to label.
- Select the full meaningful phrase for compound product names:
  `[peanut butter]`.
- Include modifiers when they are part of product identity:
  `[oat milk]`, `[diet Coke]`, `[frozen blueberries]`. The test is whether the
  phrase needs to be distinguished as a separate product for storage, purchase,
  search, or recommendation.
- Do not create new entities for temporary state, quality, or inference cues.
  Words such as `ripe`, `spoiled`, `moldy`, `no longer usable`, and `gone bad`
  remain raw context and are used later as training signals for intent and
  phrase family.
- Do not include pure action-state expressions as entities:
  `low on`, `out of`.
- If `expired` is only a trigger for discard or expiry reasoning rather than a
  modifier of the item itself, use it for phrase-family judgment only and do
  not force it into an entity.
- Spans inside one action cannot overlap or nest.
- The same raw span can be linked once per action if multiple actions truly
  require it.
- Do not invent implied entities that do not appear in the utterance.

### ITEM and CATEGORY

The key question is: “does this refer to one canonical product, or to a set of
possible products?”

- `milk` -> `ITEM: milk`
- `whole milk` -> `ITEM: whole_milk`
- `oat milk` -> `ITEM: oat_milk`
- `Coke` -> `ITEM: coke`
- `ripe bananas` -> `ITEM: banana`; leave `ripe` in raw context
- `frozen blueberries` -> full span as `ITEM: frozen_blueberry`
- `spoiled milk` -> `ITEM: milk`; leave `spoiled` in raw context
- `drinks` / `beverages` / `something to drink` -> `CATEGORY: beverage`
- `fruit` -> `CATEGORY: fruit` if no specific fruit is established in context
- `apples` -> `ITEM: apple`

Do not normalize categories into arbitrary specific products. For example,
`drinks` must not be normalized to `water`. A future recommendation system
should accept `beverage` as a category input and choose specific products later
using separate constraints and inventory or price information.

### Generic Item vs Specific Item

The annotator should preserve the **specificity level that actually appears in
the utterance**. Do not arbitrarily promote a phrase into a more specific
subtype just because you know what is in inventory.

- if the user says only `milk`, annotate `ITEM: milk`
- if the user says `whole milk`, annotate `ITEM: whole_milk`
- if the user says `saltine crackers`, annotate `ITEM: saltine_crackers`, or
  if current taxonomy operations intentionally group it broadly, annotate
  `ITEM: crackers`
- if the user says only `crackers`, annotate `ITEM: crackers`

So the normalized value in annotation is the **canonical form of the user's
mention**, not necessarily the same thing as a final inventory row ID.

Examples:

- even if inventory contains only `whole_milk`, when the user says
  `We're out of milk`, the annotation stays `ITEM: milk`
- later, runtime resolution can connect `milk -> whole_milk` using household
  aliases, taxonomy parent-child relations, and current inventory candidates
- if there are multiple candidates, runtime may ask for clarification, but the
  annotator should not remove that ambiguity manually at annotation time

`ITEM_CONDITION` remains for compatibility with older experiments and schema,
but it is excluded from the default entity scope for new annotation. Reintroduce
it later only as a separate task if condition semantics become something the
product truly stores and uses for search or recommendation.

For expressions such as `frozen blueberries`, `oat milk`, `green tea`,
`ground coffee`, and `baby spinach`, where the modifier indicates a distinct
product for storage, shopping, search, or recommendation, include the full
phrase in ITEM. So `blueberries` becomes `blueberry`, while
`frozen blueberries` becomes `frozen_blueberry`. By contrast,
`spoiled blueberries` or `blueberries are no longer usable` should leave the
condition outside ITEM as raw context.

## Normalization Convention

Normalized values are not translations or prose descriptions. They are
canonical IDs the system can compare.

- Use lower-case English `snake_case`: `oat_milk`, `peanut_butter`.
- Replace spaces with underscores:
  `oat milk` -> `oat_milk`, `greek yogurt` -> `greek_yogurt`.
- Clean uppercase, hyphenation, and repeated spaces in canonical IDs:
  `Coke Zero` -> `coke_zero`, `non-fat milk` -> `non_fat_milk`.
- Normalize plurals to singular:
  `apples` -> `apple`.
- Merge synonymous expressions into one value:
  `drinks`, `beverages` -> `beverage`.
- Preserve a brand when it matters:
  `Coke` -> `coke`.
- Keep generic mentions generic:
  `milk` stays `milk`, `whole milk` stays `whole_milk`.
- Convert number expressions into numerals:
  `two`, `a couple` -> `2`.
- Use singular canonical unit forms:
  `bottles` -> `bottle`.
- For LOCATION, use only the contract-supported values
  `fridge`, `freezer`, `pantry`.
- Relative dates must be converted to ISO dates using only the original
  inference `reference_date` and `timezone` shown in the screen's
  `Temporal context`. Do not reinterpret them using the current annotation date
  or browser timezone.
- The `Normalized suggestion` in expiry queues is only a server-derived helper
  computed from stored temporal context. Apply it only after a human verifies
  that it matches the `EXPIRY_DATE` span and the original time reference. If
  there is no suggestion or it seems wrong for the context, do not guess; leave
  notes instead.
- If a canonical ID already exists in the taxonomy, use it before creating a new value.
- If ITEM, CATEGORY, or UNIT needs a canonical value that is not in the list
  but the meaning is clear, the annotator may enter a new `snake_case` value
  directly. After saving, it becomes part of later suggestion lists.
- However, do not collapse a specific user-mentioned subtype down into a more
  generic canonical value just because a broader one exists. Likewise, do not
  promote a generic mention upward into a specific subtype based on inventory
  knowledge alone.
- The `/annotate` UI `Save ...` button is only a helper that normalizes new
  ITEM, CATEGORY, and UNIT values into lower_snake_case and adds them to the
  current suggestion list. Example: if you type `oat milk` and click
  `Save oat_milk`, it aligns to the canonical value `oat_milk`.
- If a normalized value is uncertain, do not guess. Reconsider the span or the
  intent judgment instead, and explain the reason in notes.

### Required Normalized Values in Reviewed Annotation

- In new annotation, `ITEM`, `CATEGORY`, `UNIT`, `LOCATION`, and `EXPIRY_DATE`
  **must** have normalized values in reviewed annotation.
- The normalized value for `EXPIRY_DATE` must always use `YYYY-MM-DD`.
- `QUANTITY` is the one current exception and may be left blank, though it
  should still be filled numerically when possible.
- If the normalized value for a required label is uncertain, do not force a
  wrong value. Reconsider the span or intent judgment itself, then explain why
  in notes.

`/annotate` enforces this rule by using different normalized-value input styles
by label:

- ITEM, CATEGORY, UNIT: search existing canonical values + add a lower_snake_case
  value with `Save ...` if needed
- QUANTITY: numeric input + numeric suggestions
- LOCATION: choose from `fridge`, `freezer`, `pantry`
- EXPIRY_DATE: date picker that guarantees ISO format

ITEM, CATEGORY, and UNIT can accept new canonical values immediately if they do
not already exist in suggestions. Once saved, they are merged into later
annotation suggestions automatically. LOCATION does not allow new values because
the product contract constrains it.

## Phrase Family Convention

Phrase family is not a slot value like an item name. It groups **surface
structure and pragmatic function**. Its main job is to prevent data leakage in
which the model trains and tests on effectively the same sentence.

- Write it in lower-case `snake_case`.
- Do not use only the intent name; distinguish structure.
- Do not include concrete item or category names in the family.
- Sentences that only swap words should stay in the same family.

In `/annotate`, only controlled families allowed for the current intent can be
selected. If no listed family fits, leave the field empty instead of forcing it
into a near match, and record the candidate family in notes. After agreement,
update both the shared contract and this document together.

Examples:

| Sentence | Phrase family |
| --- | --- |
| `We're low on milk.` / `We're low on eggs.` | `state_low_on_entity` |
| `We're out of milk.` / `We're out of drinks.` | `state_out_of_entity` |
| `Add milk to the list.` / `Put eggs on the list.` | `explicit_add_to_list` |
| `Do we have milk?` / `Do we have apples?` | `yes_no_inventory_query` |
| `Put that on the list.` / `Use that one.` | `unresolved_reference` |

If it is ambiguous whether a new family is needed, compare it against existing
sentence structure first. Simple synonym replacement should stay in the same
family. A change in speech act or syntactic structure should split into a new family.

### Phrase Family Selection Principles

- Choose phrase family **after the intent is fixed**. If the intent changes,
  choose the family again.
- In family names, `entity` covers both `ITEM` and `CATEGORY`.
- Focus on **sentence function**, not only the surface keyword. For example,
  even if `need` appears, choose an `add_to_buy` family when the actual function
  is a shopping request, and a `mark_low` family when the actual function is
  reporting shortage state.
- If a more specific family is explicitly indicated, prefer it over a more
  generic family.
  Example: when `expired` is explicit, prefer `expired_item_discard` over a
  generic discard family.
- If tense or speech act is clear, preserve it directly.
  Example: imperatives should prefer request families; reports of completed
  actions should prefer report families.
- If the meaning is the same and only the item, category, or quantity changes,
  keep the same family.

### Frequent Family Overlap Rules

- `finished_item_report` vs `mark_low` vs `state_out_of_entity`
  If the utterance directly states a **completed consumption event**, such as
  `finished`, `used up`, `ate the last`, or `drank the last`, use
  `consume_item > finished_item_report`.
  If the utterance reports **some remaining but not enough**, such as
  `low on`, `almost out`, or `only one left`, use `mark_low`.
  If the utterance only expresses a **zero state**, as in `out of`, with no
  explicit event or next action, use `mark_out > state_out_of_entity`.

- `consumed_item_report` vs `used_item_report` vs `quantity_consumed`
  If the focus is **eating or drinking**, as in `ate` or `drank`, use
  `consumed_item_report`.
  If the focus is **cooking or using**, as in `used for cooking` or
  `used in pancakes`, use `used_item_report`.
  Even when a quantity appears, do not switch families unless the real focus of
  the sentence is how much was consumed. Use `quantity_consumed` only when the
  amount removed is the structural center of the sentence.

- `state_low_on_entity` vs `state_almost_out` vs `quantity_running_low`
  `low on` and `running low on` map to `state_low_on_entity`.
  `almost out`, `almost gone`, and `barely any left` map to `state_almost_out`.
  When the low state is directly expressed through a remaining amount, such as
  `one left` or `half a carton left`, use `quantity_running_low`.
  However, if the meaning is effectively zero, as in `0 left`, prefer
  `state_out_of_entity`.

- `explicit_add_to_list` vs `purchase_request` vs `need_to_buy` vs `shopping_reminder`
  If the sentence explicitly manipulates the list, as in
  `add ... to the list` or `put ... on the shopping list`, use
  `explicit_add_to_list`.
  If it is a direct request to buy now, as in `buy`, `pick up`, or `get`, use
  `purchase_request`.
  If it is a statement of shopping necessity, as in `need to buy`, use
  `need_to_buy`.
  If it is a memo or future reminder, as in `remind me` or
  `don't let me forget`, use `shopping_reminder`.

- `need_more_soon` vs `need_to_buy`
  If the sentence predicts a shortage in the near future, as in
  `We'll need more milk soon`, use `mark_low > need_more_soon`.
  If the sentence directly states the need to purchase, as in
  `We need to buy milk`, use `add_to_buy > need_to_buy`.
  Even if `need` appears, prefer `need_more_soon` when the real function is
  state judgment rather than a shopping action.

- `vague_category_request` vs category-level `add_to_buy`
  Even when only a category is mentioned, if there is a clear action verb such
  as `add`, `put on the list`, or `buy`, assign `add_to_buy` intent and use a
  `CATEGORY` entity.
  Example: `Add drinks to the list.` -> `add_to_buy > explicit_add_to_list`
  If the action itself is unclear and the utterance only says that something is
  needed, use `vague_category_request`.
  Example: `We need some drinks.` -> `needs_clarification > vague_category_request`

- `yes_no_inventory_query` vs `quantity_inventory_query`
  If the core question is existence, as in `Do we have milk?`, use
  `yes_no_inventory_query`.
  If the core question is remaining amount, as in `How much milk is left?`, use
  `quantity_inventory_query`.
  `Do we have any milk left?` is still fundamentally yes/no and should
  generally remain `yes_no_inventory_query`.

- `storage_instruction` vs `explicit_add_to_inventory`
  Even if a location appears, if the core action is “add it,” use
  `explicit_add_to_inventory`.
  Use `storage_instruction` only when the location decision itself is central.

- `expiry_metadata_report` vs `expired_item_discard`
  If the sentence only **reports or records** expiry information, use
  `expiry_metadata_report`.
  If the sentence **requests discard or reports discarding because of expiry**,
  use `expired_item_discard`.

- `spoiled_item_discard` vs `expired_item_discard`
  If the central reason is **quality failure** such as spoilage, smell, or mold,
  use `spoiled_item_discard`.
  If the central reason is passing the date or explicit expiry judgment, use
  `expired_item_discard`.

### Intent-Specific Family Boundaries

#### `add_item`

- `explicit_add_to_inventory`
  A **direct request** to add something into inventory.
  Example: `Add milk.`, `Put two cartons of milk in the fridge.`
  If the sentence reports something already purchased or obtained, such as
  `bought`, `picked up`, or `got`, do not use this family; use
  `purchased_item_report`. If the sentence is mainly about where to store it,
  `storage_instruction` may fit better.

- `purchased_item_report`
  A **retrospective report** that something was already bought or brought in.
  Example: `I bought milk.`, `We picked up eggs today.`
  It is not an imperative telling the system to add the item now. Do not switch
  automatically to `quantity_addition` just because a quantity is present.

- `storage_instruction`
  The main function is **where to store it**.
  Example: `Put the yogurt in the fridge.`, `Store the meat in the freezer.`
  If the location appears but the sentence is still primarily about adding the
  item to inventory, keep `explicit_add_to_inventory`.

- `quantity_addition`
  The main function is **how much was added** or **how much should be added**.
  Example: `Add one more carton of milk.`, `We added three more eggs.`
  This is not any ordinary add sentence that merely contains a quantity. Use
  `explicit_add_to_inventory` or `purchased_item_report` when quantity is not
  the structural center.

#### `update_expiry`

- `explicit_set_expiry`
  The main function is a **direct request** to set or record expiry information
  for an existing item.
  Example: `Set the milk expiry to Friday.`, `Add an expiration date for the yogurt.`
  If the main action is adding a new item, this should be handled under `add_item`.

- `expiry_metadata_report`
  Reports or states expiry information for an existing item.
  Example: `The milk expires next Friday.`, `These eggs are good until Monday.`
  If it is a question, consider `query_inventory > expiry_inventory_query`.
  If it is about discarding because of expiry, consider
  `throw_away > expired_item_discard`.

- `expiry_metadata_correction`
  Corrects previously known expiry information.
  Example: `Actually, the yogurt expires tomorrow.`, `The earlier date was wrong; it's Friday.`
  If there is no real correction context and it is simply a new report, use
  `expiry_metadata_report`.

#### `set_low_threshold`

- `explicit_set_low_threshold`
  A direct request to set a threshold or Low boundary.
  Example: `Set the low threshold for eggs to six.`, `Make milk low at one carton.`

- `threshold_notification_request`
  A request to be told when inventory reaches a certain amount.
  Example: `Tell me when milk reaches one carton.`, `Let me know when two eggs are left.`
  This is not a current low-state report, so do not move it to `mark_low`.

- `threshold_policy_statement`
  A statement of what quantity the user generally considers Low.
  Example: `Eggs are low at six.`, `For me, two cans counts as low.`
  If the sentence only reports the current state, as in `We only have six eggs left`,
  use `mark_low`.

- `threshold_correction`
  A correction or replacement of an existing threshold.
  Example: `Actually, make the egg threshold four.`, `Change milk's low point to two cartons.`
  If there is no correction context, use whichever of the previous three
  families matches the actual meaning.

#### `consume_item`

- `consumed_item_report`
  A **direct report of consumption** through eating or drinking.
  Example: `I ate two yogurts.`, `We drank the juice.`
  If the focus is cooking or using as an ingredient, `used_item_report` fits better.

- `used_item_report`
  The focus is on **using** something rather than ingesting it directly.
  Example: `I used one egg.`, `We used half the milk for pancakes.`
  If the sentence is really about eating or drinking, use `consumed_item_report`.

- `finished_item_report`
  A report that the item was **completely finished or used up**.
  Example: `We finished the milk.`, `I used up the yogurt.`
  A simple low-state report should stay under `mark_low`, and a pure zero-state
  report such as `We're out of milk`, without an explicit completed event,
  belongs to `mark_out > state_out_of_entity`.

- `quantity_consumed`
  The core structure centers on **the exact amount consumed or used**.
  Example: `I used half a carton of milk.`, `We ate three eggs.`
  If a quantity is present but the sentence still reads as a generic report,
  keep the more generic family. Use this family only when the amount removed is
  the real center of the sentence.

#### `mark_low`

- `state_low_on_entity`
  A direct low-state phrase such as `low on` or `running low on`.
  Example: `We're low on milk.`, `We're running low on drinks.`
  If the nuance is closer to near-complete depletion, `state_almost_out` fits better.

- `state_almost_out`
  Imminent depletion phrasing such as `almost out`, `almost gone`, or
  `barely any left`.
  Example: `We're almost out of eggs.`, `The milk is almost gone.`
  If the utterance says the count is already fully zero and only that state is
  reported, prefer `state_out_of_entity`.

- `need_more_soon`
  The core meaning is a **near-future shortage forecast or judgment**.
  Example: `We'll need more milk soon.`, `We should get more eggs soon.`
  If you actually interpret it as a shopping request and assign `add_to_buy`
  intent, do not use this family. If there is an explicit low-state phrase,
  prefer `state_low_on_entity`.

- `quantity_running_low`
  The low state is expressed directly through a small remaining amount.
  Example: `We only have one egg left.`, `There's half a carton left.`
  A simple yes/no question is a query. Full depletion should move to
  `state_out_of_entity`.

#### `mark_out`

- `state_out_of_entity`
  The sentence directly reports **current zero inventory**, using forms such as
  `We're out of ...`, `We have no ...`, or `There is no ... left`.
  Example: `We're out of milk.`, `We have no eggs.`, `There are no drinks left.`
  This family describes **the zero-state observation**, not the cause of that
  state. So for a clear completed consumption event such as
  `We used up the milk`, prefer `finished_item_report`.
  If a follow-up action such as `Add it to the list` appears too, split it into
  a separate action.

#### `throw_away`

- `explicit_discard_request`
  A **direct request** to throw something away.
  Example: `Throw away the spinach.`, `Discard the old yogurt.`
  If the main reason is `expired`, `spoiled`, or `moldy`, prefer the more
  specific family instead.

- `spoiled_item_discard`
  The reason for discard is **spoilage, bad smell, rot, or other quality failure**.
  Example: `Throw away the spoiled milk.`, `The spinach went bad, toss it.`
  If the reason is date expiry, use `expired_item_discard`.

- `thrown_away_report`
  A report that the item was **already thrown away**.
  Example: `I threw away the spinach.`, `We tossed the old bread.`
  If the sentence is also clearly about `expired` or `spoiled`, prefer the
  reason-specific family over this generic report.

- `expired_item_discard`
  The discard reason is **passed expiry or explicit expiry judgment**.
  Example: `Throw away the expired yogurt.`, `I tossed the milk because it expired.`
  If the sentence is more about looking old or bad than about the date,
  `spoiled_item_discard` may fit better.

#### `add_to_buy`

- `explicit_add_to_list`
  An **explicit list operation** that says to put something on the shopping list.
  Example: `Add milk to the list.`, `Put eggs on the shopping list.`
  This can apply to categories as well as items.
  Example: `Add drinks to the list.` -> `CATEGORY: beverage`
  If the utterance asks to buy without mentioning the list, use
  `purchase_request` or `need_to_buy`.

- `purchase_request`
  The speaker is directly asking someone to **buy or pick up** something now.
  Example: `Buy milk.`, `Pick up eggs.`, `Get more yogurt.`
  If it is only a statement of need, use `need_to_buy`. If it is a reminder
  structure, use `shopping_reminder`.

- `need_to_buy`
  The speaker is stating the **need to buy** something.
  Example: `We need to buy milk.`, `I need eggs.`
  If the imperative force is stronger, `purchase_request` is a better fit.
  If the utterance only reports shortage and does not explicitly request
  shopping, consider `mark_low` or `mark_out`.

- `shopping_reminder`
  A **memo or reminder** for future shopping.
  Example: `Remind me to buy milk.`, `Don't let me forget eggs.`
  This is not a direct request to buy immediately.

#### `query_inventory`

- `yes_no_inventory_query`
  A **yes/no question** about whether an item exists in inventory.
  Example: `Do we have milk?`, `Is there any yogurt?`
  If the question is about amount remaining, use `quantity_inventory_query`.

- `quantity_inventory_query`
  A question about **amount, count, or remaining quantity**.
  Example: `How much milk is left?`, `How many eggs do we have?`
  `Do we have any milk left?` should usually remain
  `yes_no_inventory_query` if the main function is still existence checking.

- `location_inventory_query`
  A question about **where something is stored**.
  Example: `Where is the yogurt?`, `Did we put the juice in the fridge or pantry?`
  If the focus is existence rather than location, keep it as
  `yes_no_inventory_query`.

- `expiry_inventory_query`
  A question about expiry date or expiry status.
  Example: `When does the milk expire?`, `Is the yogurt still good?`
  If inventory existence and expiry are both asked, choose the actual question
  focus. If they are truly separate questions, split them into multiple actions.

#### `needs_clarification`

- `unresolved_reference`
  A referring expression such as `that`, `it`, or `the usual one` cannot be
  resolved from the current sentence alone.
  Example: `Put that on the list.`, `Use that one.`
  The action is visible, but the object is unclear.

- `vague_category_request`
  A category is visible, but **the action itself is not specific enough**.
  Example: `We need some drinks.`, `Get something sweet.`
  But if a category-level action verb is explicit, such as
  `Add drinks to the list` or `Buy some fruit`, send it to an `add_to_buy`
  family instead. Use this family only when the action remains vague.

- `usual_items_request`
  A household-specific routine set is requested, but **its members are not
  recoverable from the current sentence**.
  Example: `Buy the usual.`, `Get our regular groceries.`
  Do not imagine the usual set from annotator common sense.

- `ambiguous_action`
  The target is fairly visible, but **the desired action itself** is unclear.
  Example: `Milk.`, `Eggs next.`, `Handle the yogurt.`
  The utterance is kitchen-related, but there is not enough evidence to choose
  add/query/discard/consume safely.

#### `unknown`

- `preference_statement`
  A taste preference or general opinion statement.
  Example: `I like coffee.`, `We prefer oat milk.`
  This is not a request to change inventory or add something to a list.

- `unrelated_question`
  A question unrelated to the kitchen inventory or shopping domain.
  Example: `What's the weather?`, `When is the meeting?`
  If the sentence is domain-related but requests a capability outside the
  current intent set, prefer `unsupported_request`.

- `unrelated_statement`
  A declarative sentence unrelated to the domain.
  Example: `I'm tired today.`, `The movie was good.`
  It is neither a preference nor a capability request.

- `unsupported_request`
  A clear request that is domain-related but **outside the current supported
  intents**.
  Example: `What should I cook tonight?`, `Find the cheapest milk brand.`
  This is not a case where clarification is needed; the meaning is clear, but
  the capability is outside the current system, so it remains `unknown`.

## Train/Evaluation Convention

### `train_candidate`

- reviewed versions of synthetic sentences
- additional variations of existing phrase families
- example sentences created to establish rules
- sentences already seen during model development
- most annotation candidates loaded from `correction queue`, `expiry queue`,
  `low-confidence queue`, and `confirmed queue`

### `evaluation_candidate`

- independent real expressions produced naturally by users
- sentences not created by simply swapping words in an existing template
- sentences collected before looking at model output, training data, or current error analysis
- sentences whose intent and entity answers have been checked by a human
- by default, candidates loaded from `evaluation holdout` queue

An `evaluation_candidate` is not immediately a final test-set item. It becomes
part of a frozen evaluation set only after deduplication, phrase-family
separation, quality review, and version freezing. The same phrase family must
not be split across train and evaluation.

### Relationship Between Queue and Dataset Purpose

- `correction queue`
  Collects sentences where the model was truly wrong and the user left a correction.
  Its default purpose is error-focused `train_candidate` collection.

- `expiry queue`
  Collects sentences containing date or expiry signals.
  Its default purpose is `train_candidate` collection for improving
  `EXPIRY_DATE` span quality and normalization.
  The screen's reference date, timezone, and original inference timestamp are
  values for restoring the original utterance meaning; they must not be replaced
  by the annotation time.
  Each sentence in `annotation-queue-seed-v2` has explicit temporal context and
  must not reuse the hidden shared-date semantics from v1 as the answer.

- `low-confidence queue`
  Collects sentences with low confidence or near `unknown` /
  `needs_clarification`.
  Its default purpose is active-learning-style `train_candidate` collection.

- `confirmed queue`
  Collects real-use sentences the model predicted correctly and the user confirmed.
  Its default purpose is strengthening `train_candidate` data closer to the
  real production distribution.

- `preference/context queue`
  Collects pregenerated sentences with
  `candidate_relevance = contextual_preference`.
  It is used to review boundaries between preferences, goals, diet, household
  context, and immediate actions.

- `domain non-actionable queue`
  Collects pregenerated sentences with
  `candidate_relevance = domain_non_actionable`.
  It is used to review hard negatives that share grocery vocabulary but contain
  no action.

- `unrelated negative queue`
  Collects pregenerated sentences with
  `candidate_relevance = unrelated`.
  It is a fully outside-domain negative queue and should remain smaller than
  the domain non-actionable queue.

- `evaluation holdout`
  Collects reviewed sentences separated by a deterministic bucket rule.
  Its default purpose is `evaluation_candidate` collection.

The queue indicates **where the sample came from**, while dataset purpose
indicates **where it should belong in the final split**. Usually these align,
but the annotator can save a sample under a different purpose when there is a
clear reason. In that case, leaving an explanation in notes is recommended.

The UI stores the last queue and dataset purpose separately in the browser.
Refresh and repeated submission keep both choices, and the queue does not
automatically change purpose. In particular, when reviewing `evaluation holdout`,
the human must verify that `Evaluation candidate` is actually selected.

The `candidate_relevance` values in the three relevance queues are only routing
hints produced during generation, not answers. Even if the screen preselects
one, read the sentence itself and rejudge which of the four relevance classes
it truly belongs to. Only the human-saved `annotations.relevance` is used as
training ground truth.

## Notes Convention

Leave notes empty for clear sentences. Only record short, objective English
notes in the following cases:

- rationale for choosing one intent over another
- a canonical value missing from the taxonomy
- no relative-date suggestion, or a problem with the stored reference date or timezone
- a multi-intent issue or missing-context issue
- a new edge case not covered by the convention

Example:

```text
Implicit out-of-stock statement; no explicit shopping-list request.
```

## Consistency Checklist

Before saving, verify the following.

- Was the raw utterance kept unchanged?
- Does the intent represent the speaker's goal rather than a keyword?
- Was no unclear meaning guessed arbitrarily?
- Does the span match an exact contiguous part of the source text?
- Were ITEM and CATEGORY distinguished correctly?
- Is the normalized value in canonical form?
- Was the same phrase family used for similar templates?
- Is the evaluation candidate not just a variation of an existing template?
- If special judgment was required, was the reason recorded in notes?

## Procedure for Changing the Convention

If a new case cannot be resolved by this document, do not let each annotator
invent their own rule.

1. Save the record as `needs_clarification` or with the most conservative label.
2. Record the edge case and possible options in notes.
3. After the team decides the rule, update this document first.
4. If the meaning changes, bump the convention/schema version.
5. Find and review earlier annotations affected by the new rule.

Simple typo fixes do not require a version change. A new version is required if
intent meaning, entity boundaries, normalization, or split policy changes.
