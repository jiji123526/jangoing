import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../migrations");

function migration(name: string): string {
  return readFileSync(resolve(migrationsDirectory, name), "utf8");
}

describe("household ownership migration", () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(migration("0001_create_events.sql"));
    database.exec(migration("0003_create_inference_logs.sql"));
    database.exec(migration("0010_create_app_state.sql"));
    database.exec(migration("0012_add_household_ownership.sql"));
    database.exec(migration("0013_enforce_single_household_membership.sql"));
  });

  afterEach(() => {
    database.close();
  });

  it("adds nullable ownership columns without invalidating legacy rows", () => {
    database.prepare(
      `INSERT INTO events (
        id, event_type, item_name, raw_utterance, confidence, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "legacy-event",
      "item_added",
      "milk",
      "Added milk",
      1,
      "legacy",
      "2026-09-02T00:00:00.000Z",
    );

    database.prepare(
      `INSERT INTO inference_logs (
        id, raw_utterance, request_context, predicted_interpretation,
        parser_version, normalizer_version, schema_version, source,
        outcome, latency_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "legacy-inference",
      "Added milk",
      "{}",
      "{}",
      "rules-v2",
      "normalizers-v1",
      "inference-v1",
      "legacy",
      "pending",
      1,
      "2026-09-02T00:00:00.000Z",
    );

    expect(
      database.prepare(
        "SELECT household_id, created_by_user_id FROM events WHERE id = ?",
      ).get("legacy-event"),
    ).toEqual({ household_id: null, created_by_user_id: null });
    expect(
      database.prepare(
        "SELECT household_id, user_id FROM inference_logs WHERE id = ?",
      ).get("legacy-inference"),
    ).toEqual({ household_id: null, user_id: null });
  });

  it("enforces membership roles and household references", () => {
    const createdAt = "2026-09-02T00:00:00.000Z";
    database.prepare(
      `INSERT INTO users (
        id, google_subject, email, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("user-1", "google-1", "owner@example.com", "Owner", createdAt, createdAt);
    database.prepare(
      `INSERT INTO households (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run("household-1", "Home", createdAt, createdAt);
    database.prepare(
      `INSERT INTO household_memberships (
        household_id, user_id, role, created_at
      ) VALUES (?, ?, ?, ?)`,
    ).run("household-1", "user-1", "owner", createdAt);

    expect(
      database.prepare(
        "SELECT role FROM household_memberships WHERE user_id = ?",
      ).get("user-1"),
    ).toEqual({ role: "owner" });
    expect(() => {
      database.prepare(
        `INSERT INTO household_memberships (
          household_id, user_id, role, created_at
        ) VALUES (?, ?, ?, ?)`,
      ).run("household-1", "user-1", "admin", createdAt);
    }).toThrow();
    expect(() => {
      database.prepare(
        `INSERT INTO household_join_codes (
          id, household_id, code_hash, created_by_user_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        "code-1",
        "missing-household",
        "hash-1",
        "user-1",
        "2026-09-09T00:00:00.000Z",
        createdAt,
      );
    }).toThrow();
  });

  it("isolates app-state keys by household", () => {
    const createdAt = "2026-09-02T00:00:00.000Z";
    const insertHousehold = database.prepare(
      `INSERT INTO households (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    );
    insertHousehold.run("household-1", "Home One", createdAt, createdAt);
    insertHousehold.run("household-2", "Home Two", createdAt, createdAt);

    const insertState = database.prepare(
      `INSERT INTO household_app_state (
        household_id, key, value, updated_at
      ) VALUES (?, ?, ?, ?)`,
    );
    insertState.run("household-1", "fridge_setup_completed", "true", createdAt);
    insertState.run("household-2", "fridge_setup_completed", "false", createdAt);

    expect(
      database.prepare(
        `SELECT household_id, value
         FROM household_app_state
         WHERE key = ?
         ORDER BY household_id`,
      ).all("fridge_setup_completed"),
    ).toEqual([
      { household_id: "household-1", value: "true" },
      { household_id: "household-2", value: "false" },
    ]);
  });

  it("backfills default household profile values", () => {
    const createdAt = "2026-09-02T00:00:00.000Z";
    database.prepare(
      `INSERT INTO households (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run("household-profile", "Profile Home", createdAt, createdAt);

    database.exec(migration("0014_add_household_profile.sql"));

    expect(
      database.prepare(
        `SELECT profile_emoji, icon_color
         FROM households WHERE id = ?`,
      ).get("household-profile"),
    ).toEqual({
      profile_emoji: "🏠",
      icon_color: "#1F6B45",
    });
  });
});
