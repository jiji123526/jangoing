# Jangoing Apple Music UI Kit 디자인 가이드

> 상태: Figma 원본에서 역추출한 구현 기준서
>
> 기준일: 2026-08-30
>
> 원본: [Apple Music UI Kit (Community)](https://www.figma.com/design/HwnO0WPOhkNeA8OfFGLId8/Apple-Music-UI-Kit--Community-?node-id=1-3&p=f)
>
> 기준 페이지: `◈ APPLE MUSIC` (`1:3`)

## 1. 목적과 적용 원칙

이 문서는 Jangoing UI를 Apple Music iOS 키트와 같은 시각 언어로 구현하기 위한 단일 기준서다. 레퍼런스를 사용할 때 임의의 폰트, 아이콘, 간격, 색, 모서리 또는 그림자 스타일로 대체하지 않는다. 먼저 해당 Figma 노드의 실제 값을 확인하고, 그 값을 제품 의미에 맞게 매핑한다.

원본 파일 전체에서 19,917개 노드를 조사했다. 파일에는 정식 Figma 컴포넌트, 로컬 text/paint/effect style, variable collection이 없다. 따라서 이 문서의 토큰과 컴포넌트는 반복되는 실제 프레임에서 역추출한 **derived specification**이다. 원본을 수정하거나 다른 버전을 참조하면 다시 측정해야 한다.

## 2. 원본 구성과 조사 범위

- Light Mode 화면 8개와 Dark Mode 화면 8개, 모두 iPhone 기준 폭 390px이다.
- 대표 Light 화면: `1:20814`, `1:20888`, `1:20908`, `1:20931`, `1:20956`, `1:20980`, `1:21024`, `1:21045`.
- 대표 음악 리스트 화면: `1:20888`.
- 대표 가로형 리스트 행: `Album Teaser` `1:126073`.
- Light tab bar: `1:125932`.
- 화면의 상태바와 Home Indicator는 iOS 캡처 재현용이다. 웹에서는 safe-area inset으로 변환한다.
- 수천 개의 Vector/Group은 SF Symbol과 앨범 이미지 내부 도형이다. 개별 도형을 독립 컴포넌트로 취급하지 않고 의미 단위 아이콘과 이미지로 묶는다.

## 3. 디자인 언어

1. 콘텐츠가 장식보다 우선한다. 큰 제목, 이미지, 짧은 1차/2차 레이블이 정보 위계를 만든다.
2. 화면 전체 카드 테두리 대신 흰색/검은색 바탕과 얇은 inset divider로 그룹을 구분한다.
3. 주요 동작과 현재 선택만 Apple Music pink를 사용한다.
4. 아이콘은 SF Symbols의 무게, 크기, filled/outline 상태를 그대로 따른다.
5. 모바일 390px을 기준으로 만들되 콘텐츠 폭은 유동적으로 늘린다. 16px 좌우 inset과 safe area는 유지한다.
6. Dark/Light는 색만 바꾸고 크기, 위계, 간격과 구조는 바꾸지 않는다.

## 4. 토큰

### 4.1 색상

| 역할 | Light | Dark | 관찰/사용 규칙 |
|---|---:|---:|---|
| page background | `#FFFFFF` | `#000000` 또는 최상위 `#1C1C1E` | 콘텐츠 화면 기본 |
| elevated surface | `#FAFAFA` | `rgba(34,34,34,.92)` | tab bar, mini player |
| primary label | `#000000` | `#FFFFFF` | 제목과 핵심 값 |
| secondary label | `rgba(60,60,67,.60)` | `rgba(235,235,245,.60)` | 부제, metadata |
| tertiary label | `rgba(60,60,67,.33)` | `rgba(235,235,245,.30)` | 약한 상태/disabled |
| separator | `rgba(60,60,67,.38)` | `rgba(235,235,245,.60)` | 0.5px inset divider |
| tab separator | `#C6C6C8` | dark separator | 0.5px top rule |
| accent/action | `#FF2D55` | `#FF375F` | 선택, CTA, 링크 |
| system link | `#007AFF` | `#0A84FF` | iOS형 보조 링크에만 |
| inactive tab | `#979798` | `#757575` | tab icon과 caption |
| fill control | `rgba(118,118,128,.12)` | 대응 dark fill | segmented/control background |
| image border | `rgba(120,120,128,.20)` | 동일 | cover의 0.5px stroke |

Pink는 브랜드 장식색이 아니라 상호작용 상태색이다. 한 화면에서 여러 비중 큰 영역을 pink로 채우지 않는다. 위험/유통기한 임박 상태는 pink를 재사용하지 않고 텍스트와 아이콘, 필요 시 별도 semantic warning token으로 구분한다.

### 4.2 타이포그래피

기본 font stack:

```css
font-family: "SF Pro Text", "SF Pro Display", -apple-system,
  BlinkMacSystemFont, "Helvetica Neue", sans-serif;
```

| 토큰 | Font | 크기 / 행간 | 자간 | 용도 |
|---|---|---:|---:|---|
| large-title | SF Pro Display Bold | 34 / 41px | `0.374px` | 화면 대제목 |
| title-1 | SF Pro Display Regular | 32 / 34px | `0.364px` | 재생/강조 제목 |
| title-2 | SF Pro Display Bold | 22 / 28px | `0.35px` | 섹션 제목 |
| title-3 | SF Pro Display Regular | 20 / 24px | `0.38px` | 중간 제목 |
| headline | SF Pro Text Semibold | 17 / 22px | `-0.408px` | navbar/action 강조 |
| body | SF Pro Text Regular | 17 / 22px | `-0.408px` | 행 1차 레이블 |
| callout | SF Pro Text Regular | 16 / 21px | `-0.32px` | 보조 본문 |
| subheadline | SF Pro Text Regular | 15 / 20px | `-0.24px` | 행 2차 레이블 |
| footnote | SF Pro Text Regular | 13 / 16px | `-0.078px` | caption, metadata |
| tab-caption | SF Pro Text Medium | 10 / 12px | `0.07px` | 하단 탭 레이블 |

`SF Pro Display`는 큰 제목, `SF Pro Text`는 17px 이하 인터페이스 텍스트에 쓴다. 시스템에 SF Pro가 없을 때만 font stack fallback을 허용한다. 임의로 Inter, Roboto, serif를 쓰지 않는다.

### 4.3 간격과 그리드

- 기준 화면: `390 × 844`.
- 기본 좌우 page inset: `16px`.
- 리스트 이미지와 레이블 사이: `16px`.
- 연속 콘텐츠의 기본 단위: 4, 8, 12, 16px.
- table divider는 leading content 시작점에 맞춘다. 전체 폭 divider를 무조건 쓰지 않는다.
- 대형 cover row: padding `7px 16px`, cover `102px`, 전체 높이 `116px`.
- 일반 table row: 높이 `56px`; compact variant `48px`; metadata variant `52px`; large variant `60/148px`.
- header/footer: 콘텐츠 폭 `358px`, 높이 `28px`; 전체 폭 variant `48/70px`.
- 웹에서 `max-width: 390px`로 고정하지 않는다. `min(390px, 100vw)`가 아니라 16px inset과 row 구조를 유지하며 넓어진 공간을 label 영역에 준다.

### 4.4 모서리, 테두리, 그림자, 재질

| 토큰 | 값 | 용도 |
|---|---:|---|
| radius-xs | 2px | 앨범/아이템 cover |
| radius-sm | 4px | 작은 이미지/일부 control |
| radius-md | 6px | grouped elements |
| radius-lg | 8–10px | 큰 panel/button |
| pill | 999px | chip, circular/pill control |
| divider | 0.5px | table/tab 분리선 |
| cover stroke | 0.5px `rgba(120,120,128,.2)` | 이미지 경계 |
| material blur | Figma 30px; CSS `backdrop-filter: blur(15px)` | mini player/tab bar |
| card shadow | `0 2px 8px rgba(0,0,0,.12)` | 떠 있는 cover/card |
| elevated shadow | `0 4px 12px rgba(0,0,0,.16)` | modal/elevated control |

blur를 쓸 때 반투명 surface fill을 반드시 함께 사용한다. 모든 리스트 행에 그림자를 넣지 않는다.

## 5. 아이콘 규칙

- 원본은 SF Symbols를 사용한다. 동일 symbol, filled/outline 상태, optical size를 우선한다.
- 일반 아이콘 컨테이너: `24×24`, tab icon: `30×30`, transport: `36×36`, full-player primary: `64×64`.
- active tab은 filled symbol + accent, inactive tab은 원본 inactive color다.
- Jangoing tab mapping: Home `play.circle.fill`, Inventory `square.grid.2x2.fill`, Annotate `dot.radiowaves.left.and.right`, Shopping `square.stack.fill`, Search `magnifyingglass`.
- 웹에서 SF Symbols를 직접 안정적으로 표시할 수 없으면 Figma에서 export한 원본 alpha mask asset을 사용한다. 비슷한 Lucide 아이콘으로 교체하지 않는다.
- 아이콘만 있는 버튼은 최소 `44×44px` hit area와 접근성 이름을 갖는다.

## 6. 요소 카탈로그

아래 개수는 원본에서 관찰된 인스턴스 수다. node ID는 대표 인스턴스이며 변형마다 원본을 다시 확인한다.

### 6.1 Album Teaser / 콘텐츠 카드

| 변형 | 크기 | 개수 | 대표 node | 구조 |
|---|---:|---:|---|---|
| horizontal large row | `390×116` | 18 | `1:126073` | 102 cover + 16 gap + 2-line label |
| vertical card | `160×206` | 54 | `1:106590` | 160 cover + name/artist |
| medium card | `171×217` | 6 | `1:107208` | 171 cover + labels |
| feature card | `278×362` | 8 | `1:20533` | 278 cover + album info |
| feature + caption | `278×393` | 8 | `1:20531` | feature card + caption |
| hero | `390×356/448` | 4 | `1:20742` | full-width artwork/now playing |

`390×116` 상세 규격: container padding `7px 16px`; cover `102×102`, radius 2px, 0.5px image stroke; labels는 flex-grow; primary 17/22, secondary 15/20; divider는 x=134부터 시작해 오른쪽 끝까지 0.5px이다. 텍스트는 cover 위에 겹치지 않고 긴 값은 말줄임 처리한다.

Jangoing에서는 이 변형을 Inventory Item Row로 사용한다. cover는 실제 상품 이미지 또는 카테고리 artwork, 1차 레이블은 canonical item name, 2차 레이블은 수량·보관 위치·유통기한 상태를 담는다.

### 6.2 Table View Row

| 변형 | 크기 | 개수 | 대표 node | 용도 |
|---|---:|---:|---|---|
| default | `390×56` | 58 | `1:107404` | 48px thumb/icon + label/caption |
| compact | `390×48` | 22 | `1:118032` | text/control 중심 |
| metadata | `390×52` | 8 | `1:107128` | 추가 상태 한 줄 |
| regular tall | `390×60` | 2 | `1:118494` | control/상세 |
| expanded | `390×148` | 2 | `1:114395` | multi-line detail |

Default 구조는 48px icon/image, thumb 영역 52px, label 영역 266px/40px, primary 17/22, caption 13/16이다. divider는 일반적으로 `314×0.5`이며 leading content 뒤에서 시작한다. disclosure, reorder, toggle 같은 trailing control이 있을 때 label 폭을 줄인다.

### 6.3 Table View Group와 Header/Footer

- group 관찰 크기: `390×156`, `240`, `328`, `598`, `616px` 높이.
- header/footer: `358×28` 12개, `390×48` 2개, `390×70` 2개.
- section heading은 16px page inset을 지키고 title-2 또는 footnote를 용도에 맞게 쓴다.
- section 사이 공백은 `Divider 358×8` 또는 배경 여백으로 만든다. 둥근 카드 남발을 피한다.

### 6.4 Navbar

| 변형 | 크기 | 개수 | 대표 node | 사용 |
|---|---:|---:|---|---|
| standard | `390×91` | 8 | `1:107031` | status 영역 + compact title/action |
| large title | `390×142` | 4 | `1:106785` | status + 44px bar + 51px large title |
| compact | `390×44` | 4 | `1:118576` | modal/detail 내부 |

large-title 프레임은 `390×51`이며 대제목은 34/41 Bold다. 뒤로가기와 텍스트 action은 17/22, accent color를 사용한다. 웹에서는 실제 OS status bar를 그리지 않고 header 높이와 safe-area만 보존한다.

Inventory의 `Edit` action은 Light Navbar `1:133493` 안의 text node
`1:133495`를 기준으로 한다. 오른쪽 inset 16px, 상단 11px, SF Pro Text
Regular 17/22, 자간 `-0.408px`, `#FF2D55`이며 편집 중에는 같은 위치에서
`Done`으로 바뀐다. 공통 제품 header를 이 navbar 위에 중복으로 배치하지 않는다.

### 6.5 App Footer / Tab bar

- Light 대표 node `1:125932`; 전체 `390×83`, 12개. modal형 `390×78`, 4개.
- tab row `390×49`; bottom home/safe area `390×34`.
- surface `#FAFAFA`, top divider `#C6C6C8` 0.5px, material blur.
- 각 tab hit region은 78px 폭, icon 30px, caption 10/12 Medium.
- active `#FF2D55`, inactive `#979798`.
- 웹 구현은 `position: fixed`, `env(safe-area-inset-bottom)`을 사용하며 콘텐츠 하단 padding을 확보한다.

### 6.6 Transport / Mini player

- `Transport 390×64`, 12개, 대표 `1:20593`.
- artwork `44×44`, song title 영역 약 192px/22px, play/pause와 forward `36×36`.
- tab bar 바로 위에 붙고 동일 material blur 계열을 사용한다.
- Jangoing에서는 필요할 때만 Context/Quick action tray로 변환한다. Inventory 화면의 항상 고정된 두 번째 nav bar로 쓰지 않는다.

### 6.7 Button과 Chip

- horizontal button: `169×46`, 4개, 대표 `1:117996`, radius 8px 계열.
- chip: icon-only `28×28` 6개, text chip `75×28` 4개, 대표 `1:114294`.
- chip은 필터와 짧은 상태 선택에만 사용한다. 영구 taxonomy를 chip 여러 줄로 전부 노출하지 않는다.
- 선택 chip은 accent 또는 system fill로 명확히 구분하고, text-only color change에 의존하지 않는다.

### 6.8 Slider와 재생 컨트롤

- content slider `358×7`, 4개; control slider `298×27`, 4개.
- playing transport `390×124`, 4개; back/forward `64×64`, play/pause `64×64`.
- song position은 start/end 값과 progress/knob로 구성한다.
- Jangoing에서 수량이나 임계값 조절에 slider를 사용할 때 정확한 숫자 입력 대안을 함께 제공한다.

### 6.9 Modal / Now Playing

- modal title bar `390×16`, 4개, 대표 `1:118563`.
- pull-down bar와 scrim을 사용하며, elevated surface는 background blur 100px 변형이 관찰된다.
- modal은 집중 작업에만 사용한다. inventory item의 기본 상세는 별도 detail screen 또는 bottom sheet 중 하나로 통일한다.
- Playing Next `390×40`, Track List `390×312`는 queue/list template으로 재사용할 수 있다.

### 6.10 Status Bar와 Home Bar

- status bar `390×47`, 16개; time, geo, signal, Wi-Fi, battery로 구성.
- home bar `390×34`, indicator `146×5`, 16개.
- 브라우저에서는 시각 요소를 복제하지 말고 `safe-area-inset-top/bottom`을 사용한다. 네이티브 mockup 또는 Figma 시안에만 표시한다.

## 7. 화면 템플릿

### 7.1 Browse / Home

Large Navbar → feature block → horizontal card row → section divider → tab bar 순서다. 카드 한 행은 횡스크롤이며 다음 카드가 일부 보여 스크롤 가능성을 알린다.

### 7.2 Library / Inventory

Large Navbar → attention section → category header/filter → `390×116` item rows → tab bar 순서가 기본이다. 인벤토리 구조는 다음으로 고정한다.

1. 상단 제목 `Inventory`와 trailing add/action.
2. `Needs attention` 섹션: 유통기한 임박, 소진, 상태 확인 필요 항목만 노출.
3. category filter: All, Produce, Dairy, Meat, Pantry, Frozen 등. 초기에는 28px chip을 사용하되 카테고리가 많아지면 별도 picker로 전환.
4. 카테고리별 section header와 item row.
5. row primary: `Frozen blueberries`처럼 사용자가 식별하는 구체적 아이템.
6. row secondary: `1 bag · Freezer · expires in 3 days`처럼 수량, 위치, 핵심 특이사항 한 줄.
7. trailing에는 하나의 주요 상태/chevron만 둔다. 여러 버튼은 detail 화면으로 보낸다.

`blueberries`와 `frozen blueberries`는 UI에서도 서로 다른 표시명을 유지한다. canonical family가 같아도 preparation/condition specificity를 지우지 않는다.

### 7.3 Search

Compact/large navbar 아래 검색 control을 두고, 최근 검색 또는 category suggestion을 table rows로 표시한다. 결과는 동일한 Item Row를 사용해 다른 화면과 정보 구조를 일치시킨다.

### 7.4 Detail

Compact Navbar → 큰 artwork/cover → primary/secondary metadata → horizontal actions → grouped table rows. 편집 가능한 모든 필드를 첫 화면에 펼치지 않는다.

### 7.5 Compact Media List / Shopping List

Shopping은 `Playing Next`의 queue 의미를 유지하되, 실제 화면 구조는 compact
navbar와 artwork가 있는 기본 Table View Row를 사용한다. 추천, 구매 전, 구매
완료가 같은 media-list 언어를 사용하므로 상태가 달라도 item 식별 위치가 바뀌지
않는다.

1. Inventory와 같은 95px large-title 영역에 `Shopping List`를 `34/41px`로
   표시하고 상단 오른쪽에 `75×28` `+ Add` pill을 둔다.
2. 각 item은 높이 56px, 왼쪽 inset 16px, `48×48` category artwork를 사용한다.
3. primary label은 item name이다. 원본의 artist-name 위치인 secondary label은
   suggestion에서 `Low stock · quantity`, To Buy에서 현재 inventory projection
   상태(`Out of stock`, `Low · 3 cartons left`, `In stock · 5 cartons`,
   `Not tracked in inventory`), Purchased에서 `Purchased Aug 31, 2026` 형식의
   실제 완료일을 표시한다.
4. `Suggested from Inventory`는 현재 `low`이고 To Buy/Purchased에 없는 item만
   표시하며 trailing `28×28` pink `+`로 추가한다.
5. `To Buy` item은 checkbox 대신 왼쪽 swipe로 오른쪽의 84px green `Done`
   action을 노출한다. 마우스 pointer drag와 키보드 focus도 같은 action을 제공한다.
6. `Purchased` item은 24시간 동안 표시하고 왼쪽 swipe로 pink `Undo`를 노출해
   To Buy에 복원한다.
7. 24시간이 지나면 projection에서만 숨기고 원본 event history는 삭제하지 않는다.
8. section 사이에는 여백을 사용하고 각 row는 label 영역 아래 0.5px inset
   divider로 구분한다.
9. item primary는 Inventory와 같은 `17/22px`, secondary metadata는 `15/20px`를
   사용해 두 화면의 정보 위계를 맞춘다.
Shopping add control의 구현 값:

- navbar `+ Add`: `75×28px`, radius `14px`,
  `rgba(118,118,128,.12)` fill, `#FF2D55`, SF Pro Text Medium `15/20px`,
  tracking `-0.24px`.
- recommendation trailing `+`: visual `28×28px`, pink `#FF2D55`,
  row 안의 실제 button hit area는 `52×56px`.
- icon-only plus는 border, circle fill, shadow를 추가하지 않는다.
- `+ Add`를 누르면 compact manual-item form을 열고, 성공한 뒤 form을 닫는다.

Album artwork, transport, mini player, playback control은 shopping action과
관련이 없으므로 이 화면에 가져오지 않는다.

## 8. 반응형과 접근성

- 기준은 390px이나 320px부터 깨지지 않아야 한다. label은 줄바꿈보다 1줄 말줄임을 우선하고 detail에서 전체 값을 제공한다.
- hit target 최소 44×44px.
- 본문 텍스트 대비는 WCAG AA를 만족해야 한다. 원본의 tertiary opacity는 비핵심 정보에만 사용한다.
- Dynamic Type/브라우저 글자 확대에서 row 높이를 고정해 텍스트를 자르지 말고 `min-height`로 전환한다.
- 상태를 색만으로 전달하지 않는다. `Expires soon`, `Out`, `Check` 같은 텍스트와 symbol을 함께 사용한다.
- 이미지에는 의미 있는 alt를 제공하되 장식용 category artwork는 빈 alt를 사용한다.
- fixed footer가 focus 대상이나 마지막 row를 가리지 않도록 safe-area를 포함한 bottom padding을 둔다.
- `prefers-reduced-motion`에서 불필요한 전환과 blur animation을 줄인다.

## 9. Jangoing 구현 토큰 제안

다음 이름을 CSS custom property의 canonical interface로 사용한다. 값은 위 원본 토큰에서 가져오며 light/dark media query에서 교체한다.

```css
:root {
  --am-bg: #fff;
  --am-surface: #fafafa;
  --am-label-primary: #000;
  --am-label-secondary: rgba(60, 60, 67, 0.6);
  --am-label-tertiary: rgba(60, 60, 67, 0.33);
  --am-separator: rgba(60, 60, 67, 0.38);
  --am-accent: #ff2d55;
  --am-tab-inactive: #979798;
  --am-page-inset: 16px;
  --am-row-min-height: 56px;
  --am-tab-height: 83px;
}
```

토큰 이름은 Apple Music의 소유권을 주장하는 의미가 아니라 레퍼런스 계열을 구분하기 위한 내부 prefix다. 향후 고유 Jangoing design system으로 분리할 때 값과 이름을 함께 migration한다.

## 10. 구현 검수 체크리스트

- [ ] 구현 전 정확한 Figma node ID를 기록했다.
- [ ] 폰트 family, weight, size, line-height, letter-spacing을 모두 대조했다.
- [ ] SF Symbol 또는 원본 export asset을 사용했다.
- [ ] 16px inset, row 높이, image 크기, divider 시작점을 대조했다.
- [ ] Light/Dark semantic token을 적용했다.
- [ ] 390×844 screenshot을 원본과 나란히 비교했다.
- [ ] 320px 및 넓은 모바일 폭에서 깨지지 않는다.
- [ ] safe area, fixed footer overlap, keyboard focus를 확인했다.
- [ ] active, inactive, pressed, disabled, empty, loading, error 상태를 확인했다.
- [ ] 색만으로 상태를 전달하지 않는다.
- [ ] 임의의 폰트, Lucide 대체, 카드 그림자, 둥근 모서리를 추가하지 않았다.

## 11. 추출 기록과 한계

- 조사 시 반복 관찰: Album Teaser 92, Table View Row 92, Header/Footer 16, Tab bar 16, Navbar 16, Transport 12, Slider 8, Playing Transport 4, Modal Title Bar 4.
- 이미지 fill 172개와 다수의 gradient/vector는 예시 콘텐츠 또는 SF Symbol 내부 표현이므로 모두 제품 토큰으로 승격하지 않았다.
- 원본에 formal component/style/variable이 없으므로 대표 node ID와 실제 수치를 함께 보존했다.
- Community kit의 이미지와 상표 자산을 제품에 그대로 배포하기 전에는 라이선스와 상표 사용 범위를 별도로 확인한다. 구조, 간격, typography 규격을 참조하는 것과 예시 artwork를 재배포하는 것은 다른 문제다.
- 이 문서는 현재 추출본이다. Figma 파일 연결이 끊겼을 때 기억이나 유사 디자인으로 보완하지 말고 연결을 복구한 뒤 다시 측정한다.
