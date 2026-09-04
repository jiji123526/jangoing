# jangoing

Jangoing is a conversational kitchen intelligence project focused on turning
everyday household language into grounded, reviewable food-management actions.

## Ultimate Goal

The goal is to build a personalized assistant that can understand relevant
requests inside ordinary conversation, connect them to household context, and
propose safe inventory, shopping, and recommendation actions.

```text
conversation
-> relevance and context
-> structured action proposal
-> user review or correction
-> household state update
-> reusable training and evaluation data
```

The long-term system should support typed and spoken Korean-English interaction,
household-specific vocabulary, preferences, temporal expressions, and
resource-constrained deployment such as Raspberry Pi.

Jangoing is not intended to be only an inventory UI or a command parser. The
product is also the environment for collecting corrections, evaluating model
versions, and measuring whether personalization improves real interaction.

## Research Direction

The project follows a personalized-first, generalizable-architecture approach:

- A shared base defines actions, temporal rules, safety policy, and general
  language behavior.
- A personal adapter contains household vocabulary, aliases, preferences,
  recurring errors, and device-specific calibration.
- Every state-changing interpretation remains reviewable.
- Generated and AI-assisted data are candidates; reviewed human data is ground
  truth.
- Text understanding is evaluated before speech recognition is added, so ASR
  errors and language-understanding errors remain separable.

## Current Phase

The authenticated household product and text annotation workflow are
implemented. The current milestone is the first reviewed English text
benchmark:

1. Complete the 300-training / 100-evaluation workflow pilot.
2. Build a gap-targeted synthetic dataset from the reviewed distribution.
3. Reach the first 1,000-training / 200-evaluation human-data baseline.
4. Compare relevance, intent, entity-span, normalization, and joint-action
   performance on frozen evaluation sets.

The runtime language layer is still deterministic and English-first. Voice,
Korean-English code-switching, learned context resolution, and recommendation
ranking follow only after the text benchmark is stable.

## Product Foundation

The current application provides:

- Google-authenticated, household-scoped inventory and shopping lists
- join-or-create household onboarding and shared member access
- reviewed text commands with confirmation and correction logging
- expiry, quantity, category, low-stock, out-of-stock, and leftover workflows
- production annotation, dataset export, and reproducible baseline tooling
- Next.js on Vercel with a Cloudflare Worker and D1 backend

## Roadmap

```text
household product + annotation workflow
-> reviewed English text benchmark
-> hybrid relevance / intent / span / normalization pipeline
-> multi-turn context and personalized language adaptation
-> Korean-English code-switching and personalized ASR
-> Raspberry Pi voice interaction
-> explainable recommendation and deal ranking
```

Image, barcode, and catalog features remain separate tracks and should not delay
the language benchmark.

## Repository

- `apps/web`: Next.js household and annotation application
- `apps/api`: Cloudflare Worker API and D1 persistence
- `packages/contracts`: shared schemas and types
- `ml`: dataset, evaluation, and baseline training tools
- `pi`: future Raspberry Pi voice client

## Local Development

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run dev:api
npm run dev:web
```

Run the API and Web commands in separate terminals, then open
`http://localhost:3000`.

## Documentation

- [English documentation index](./docs/ENG/README.md)
- [Current progress log](./docs/planning/PROGRESS.md)
- [ML quick start](./ml/README.md)

The detailed plans, decisions, annotation rules, setup instructions, and
research methodology live in the documentation tree rather than this README.
