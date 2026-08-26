# jangoing

A voice-first kitchen inventory assistant that turns natural-language commands into fridge, expiry, and shopping-list updates.

## Current Milestone

The first milestone is a text-based MVP:

1. Enter an English command such as `We are low on milk`.
2. Review the structured action produced by the command parser.
3. Confirm the action before it changes inventory.
4. See the updated inventory, shopping list, and event history.

An optional expiry date can be attached to added items. Raspberry Pi audio, speech-to-text, and a trained NLP model will be added after this workflow is reliable.

## Stack

- `apps/web`: Next.js mobile web app, deployed on Vercel
- `apps/api`: Cloudflare Worker API with D1 storage
- `packages/contracts`: shared Zod schemas and TypeScript types
- `ml`: future English intent-classification and slot-extraction work
- `pi`: future Raspberry Pi voice client

## Local Development

Prerequisites:

- Node.js 22 or newer
- npm 10 or newer

Install dependencies:

```bash
npm install
```

Run the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`. The web app uses `http://localhost:8787` as its default API URL.

Local development uses Node's SQLite API and stores data in `apps/api/.local/`. Production uses the same event schema through Cloudflare D1.

## Documentation

- [MVP and product plan](./PLAN.md)
- [Local, Cloudflare, and Vercel setup](./SETUP.md)
- [Development progress log](./PROGRESS.md)

## MVP Commands

```text
Add two cartons of milk
We are low on eggs
I used one egg
Throw away the spinach
Put yogurt on the shopping list
Do we have milk
```

The initial deterministic parser validates the product workflow and collects corrected English utterances before model training begins.
