# Inventory Status and Low Threshold

## Goal

Inventory status should reflect a measurable quantity when one is available,
while preserving explicit commands such as "We're low on eggs" when the user
does not provide a number.

## Status Rules

The inventory projection applies status in this order:

1. Preserve an explicit `item_marked_low` or `item_marked_out` status when no
   inventory-level value has changed.
2. When quantity is `0`, status is `out`.
3. When `low_threshold` is set and
   `0 < quantity <= low_threshold`, status is `low`.
4. Otherwise, status is `in_stock`.

Examples:

| Item | Quantity | Low threshold | Status |
| --- | ---: | ---: | --- |
| Eggs | 13 | 6 | `in_stock` |
| Eggs | 6 | 6 | `low` |
| Milk | 1 | 1 | `low` |
| Milk | 0 | 1 | `out` |
| Coke Zero | 2 | not set | `in_stock` |

## Explicit Status Compatibility

The conversational command "We're low on eggs" still creates an
`item_marked_low` event. This remains useful when the actual quantity is
unknown.

An inventory edit only clears that explicit status when quantity or
`low_threshold` changes. Editing unit, location, or expiry alone preserves the
explicit status.

## Storage and Projection

- `events.low_threshold` stores the threshold on `item_adjusted` events.
- Migration `0009_add_inventory_low_threshold.sql` adds the nullable column.
- `projectInventory()` carries the latest threshold in the item's event-derived
  state.
- `InventoryItem.low_threshold` returns the active value to the web app.
- `InventoryItem.low_threshold_unit` preserves the unit supplied with the
  policy.
- A missing threshold means automatic Low detection is disabled for that item.

The threshold is item-specific because a single global threshold does not work
across pieces, cartons, cans, and other units.

Automatic comparison only runs when the threshold unit and current inventory
unit match, or when the threshold has no explicit unit. Jangoing does not
silently convert cartons, bottles, cans, weight, or volume in this MVP.

## Inventory Editor

- `Quantity` accepts zero.
- `Low at` accepts a positive decimal value or can be left empty.
- Saving zero quantity displays the item as Out.
- Saving a positive quantity at or below `Low at` displays the item as Low.
- Low and Out items appear in `Needs Attention`.

## Natural-Language Threshold Action

Parser version `rules-v2` adds the `set_low_threshold` intent. Supported
deterministic patterns include:

- `Tell me when milk reaches one carton.`
- `Set the low threshold for eggs to six pieces.`
- `Milk is low at two cartons.`
- `Let me know when we have two cans of soda left.`

The interpretation stores `low_threshold` separately from current `quantity`.
Confirmation creates an `item_low_threshold_set` event. This event updates the
item policy without replacing its quantity, location, expiry, or inventory
batches.

If the policy is set before the item exists, the projection keeps it hidden.
The threshold becomes active when a later `item_added` event makes the item
visible.

Annotation uses the existing `QUANTITY` and `UNIT` entity labels. The
`set_low_threshold` intent supplies their semantic role, so action words such
as `tell me` and `reaches` are not entity spans.

## Production Deployment

Apply the D1 migration before deploying the Worker:

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run db:migrate:remote
npm run deploy:api
git push origin main
```

The web deployment must not reach production before the Worker and D1 support
`low_threshold`.
