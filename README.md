# jangoing

Voice-controlled kitchen inventory and grocery tracking on Raspberry Pi with mobile web sync.

## Overview

jangoing is a Raspberry Pi based voice assistant for tracking what is in the fridge, what is running low, and what needs to be bought or thrown away. It is designed for fast, hands-free use in the kitchen, with a mobile web app for review, correction, and household sync.

## Current Plan

- Build a Raspberry Pi voice pipeline for wake word, speech recognition, command parsing, and API calls.
- Store kitchen actions as events such as `added`, `consumed`, `marked_low`, `thrown_away`, and `added_to_buy`.
- Derive current fridge and shopping-list state from those events instead of relying on manual status-only updates.
- Provide a phone-friendly web app to inspect current inventory, expiring items, and recent activity.
- Start with a narrow command set and improve the NLP layer using real household utterances.

## Initial Scope

- Voice commands for adding items, marking items low, throwing items away, and asking what to buy.
- Inventory view, shopping list view, and recent actions view in the web app.
- Low-confidence confirmation flow for ambiguous speech input.
- Alias and normalization support for item names such as `scallion` vs `green onion`.

## High-Level Architecture

- `Raspberry Pi`: microphone input, wake word, local audio handling
- `Speech-to-text`: local ASR for privacy and offline tolerance
- `NLP layer`: intent classification plus slot extraction
- `Backend API`: event storage, inventory projection, notifications
- `Mobile web app`: status, corrections, reports, and sync

## Roadmap

1. Define the data model and event schema.
2. Build the backend API and inventory projection logic.
3. Create the mobile web app MVP.
4. Connect the Raspberry Pi voice pipeline.
5. Add confirmation, reporting, and smarter normalization.

## Detailed Plan

See [PLAN.md](./PLAN.md) for the product goals, architecture, milestones, and implementation details.
