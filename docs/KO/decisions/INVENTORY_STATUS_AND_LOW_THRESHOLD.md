# Inventory Status와 Low Threshold

## 목표

재고 status는 수량이 있을 때는 measurable quantity를 반영해야 하며, 동시에 사용자가
숫자를 주지 않은 `"We're low on eggs"` 같은 explicit command도 유지해야 한다.

## Status 규칙

Inventory projection은 다음 순서로 status를 적용한다.

1. Inventory-level value가 바뀌지 않았다면 explicit `item_marked_low` 또는
   `item_marked_out` status를 유지한다.
2. Quantity가 `0`이면 status는 `out`이다.
3. `low_threshold`가 설정되어 있고 `0 < quantity <= low_threshold`이면 status는
   `low`다.
4. 그 외에는 `in_stock`이다.

예시:

| Item | Quantity | Low threshold | Status |
| --- | ---: | ---: | --- |
| Eggs | 13 | 6 | `in_stock` |
| Eggs | 6 | 6 | `low` |
| Milk | 1 | 1 | `low` |
| Milk | 0 | 1 | `out` |
| Coke Zero | 2 | not set | `in_stock` |

## Explicit status 호환성

자연어 command `"We're low on eggs"`는 여전히 `item_marked_low` event를 만든다.
실제 quantity가 unknown일 때도 이 event는 유용하다.

Inventory edit는 quantity나 `low_threshold`가 바뀔 때에만 explicit status를
지운다. Unit, location, expiry만 바꾸는 경우에는 explicit status를 유지한다.

## 저장과 projection

- `events.low_threshold`는 `item_adjusted` event에 threshold를 저장한다.
- Migration `0009_add_inventory_low_threshold.sql`이 nullable column을 추가한다.
- `projectInventory()`는 item의 event-derived state 안에 최신 threshold를 보존한다.
- `InventoryItem.low_threshold`는 현재 active value를 web app에 반환한다.
- `InventoryItem.low_threshold_unit`는 policy와 함께 들어온 unit을 보존한다.
- Threshold가 없으면 automatic Low detection은 꺼진 상태다.

Threshold는 item-specific이어야 한다. Piece, carton, can 같은 단위를 하나의 global
threshold로 처리할 수 없기 때문이다.

Automatic comparison은 threshold unit과 현재 inventory unit이 같거나, threshold에
explicit unit이 없는 경우에만 실행한다. 이 MVP에서는 carton, bottle, can, weight,
volume을 silent conversion하지 않는다.

## Inventory editor

- `Quantity`는 zero를 허용한다.
- `Low at`은 positive decimal value를 받거나 비워둘 수 있다.
- Quantity를 zero로 저장하면 item은 Out으로 표시된다.
- Positive quantity가 `Low at` 이하로 저장되면 item은 Low로 표시된다.
- Low와 Out item은 `Needs Attention`에 나타난다.

## 자연어 threshold action

Parser version `rules-v2`는 `set_low_threshold` intent를 추가한다. 지원하는
deterministic pattern 예시는 다음과 같다.

- `Tell me when milk reaches one carton.`
- `Set the low threshold for eggs to six pieces.`
- `Milk is low at two cartons.`
- `Let me know when we have two cans of soda left.`

Interpretation은 current `quantity`와 별도로 `low_threshold`를 저장한다.
Confirmation은 `item_low_threshold_set` event를 만든다. 이 event는 item policy만
갱신하며 quantity, location, expiry, inventory batch는 덮어쓰지 않는다.

Policy가 item이 아직 존재하기 전에 먼저 설정되면 projection은 그 상태를 숨긴다.
이후 `item_added` event가 item을 visible하게 만들면 threshold가 활성화된다.

Annotation은 기존 `QUANTITY`, `UNIT` entity label을 그대로 사용한다.
`set_low_threshold` intent가 semantic role을 부여하므로 `tell me`, `reaches` 같은
action word는 entity span이 아니다.

## Production 배포

Worker를 배포하기 전에 먼저 D1 migration을 적용한다.

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run db:migrate:remote
npm run deploy:api
git push origin main
```

Production에 `low_threshold`를 지원하는 Worker와 D1이 먼저 올라가기 전에는 web
deployment가 앞서가면 안 된다.
