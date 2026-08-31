import { EventRecordSchema, type EventRecord } from "@jangoing/contracts";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { projectInventory, projectShoppingList } from "../src/domain/projections";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localDatabasePath =
  process.env.LOCAL_DB_PATH ?? resolve(apiDirectory, ".local/jangoing.sqlite");
const eventsMigrationPath = resolve(
  apiDirectory,
  "migrations/0001_create_events.sql",
);
const inventoryLowThresholdMigrationPath = resolve(
  apiDirectory,
  "migrations/0009_add_inventory_low_threshold.sql",
);
const sampleIdPrefix = "local-ui-sample-";

function migrationSql(path: string, tableName: string): string {
  return readFileSync(path, "utf8")
    .replace(`CREATE TABLE ${tableName}`, `CREATE TABLE IF NOT EXISTS ${tableName}`)
    .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
}

function isoTimestamp(daysOffset: number, hour: number, minute = 0): string {
  const timestamp = new Date();
  timestamp.setUTCDate(timestamp.getUTCDate() + daysOffset);
  timestamp.setUTCHours(hour, minute, 0, 0);
  return timestamp.toISOString();
}

function isoDate(daysOffset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function sampleEvent(
  id: string,
  event: Omit<EventRecord, "id">,
): EventRecord {
  return EventRecordSchema.parse({
    id: `${sampleIdPrefix}${id}`,
    ...event,
  });
}

function sampleEvents(): EventRecord[] {
  return [
    sampleEvent("01-oat-milk-added", {
      event_type: "item_added",
      item_name: "oat_milk",
      quantity: 2,
      unit: "carton",
      location: "fridge",
      expiration_date: isoDate(4),
      raw_utterance: "Added two cartons of oat milk.",
      confidence: 0.98,
      source: "web",
      created_at: isoTimestamp(-4, 9, 15),
    }),
    sampleEvent("02-eggs-added", {
      event_type: "item_added",
      item_name: "egg",
      quantity: 12,
      unit: "piece",
      location: "fridge",
      expiration_date: isoDate(7),
      raw_utterance: "Put a dozen eggs in the fridge.",
      confidence: 0.97,
      source: "web",
      created_at: isoTimestamp(-3, 18, 10),
    }),
    sampleEvent("03-eggs-low", {
      event_type: "item_marked_low",
      item_name: "egg",
      quantity: null,
      unit: null,
      location: "fridge",
      expiration_date: null,
      raw_utterance: "We're running low on eggs.",
      confidence: 0.88,
      source: "voice",
      created_at: isoTimestamp(-1, 8, 30),
    }),
    sampleEvent("04-spinach-added", {
      event_type: "item_added",
      item_name: "spinach",
      quantity: 1,
      unit: "bag",
      location: "fridge",
      expiration_date: isoDate(-1),
      raw_utterance: "Added a bag of spinach.",
      confidence: 0.99,
      source: "web",
      created_at: isoTimestamp(-3, 12, 0),
    }),
    sampleEvent("05-blueberries-added", {
      event_type: "item_added",
      item_name: "frozen_blueberry",
      quantity: 2,
      unit: "bag",
      location: "freezer",
      expiration_date: isoDate(120),
      raw_utterance: "Added frozen blueberries to the freezer.",
      confidence: 0.97,
      source: "web",
      created_at: isoTimestamp(-5, 14, 5),
    }),
    sampleEvent("06-sparkling-water-added", {
      event_type: "item_added",
      item_name: "sparkling_water",
      quantity: 8,
      unit: "can",
      location: "fridge",
      expiration_date: null,
      raw_utterance: "Stocked eight cans of sparkling water.",
      confidence: 0.96,
      source: "web",
      created_at: isoTimestamp(-2, 11, 40),
    }),
    sampleEvent("07-chicken-added", {
      event_type: "item_added",
      item_name: "chicken",
      quantity: 1,
      unit: "pack",
      location: "fridge",
      expiration_date: isoDate(1),
      raw_utterance: "Added one pack of chicken.",
      confidence: 0.95,
      source: "web",
      created_at: isoTimestamp(-2, 17, 20),
    }),
    sampleEvent("08-pasta-added", {
      event_type: "item_added",
      item_name: "pasta",
      quantity: 3,
      unit: "box",
      location: "pantry",
      expiration_date: isoDate(180),
      raw_utterance: "Stored three boxes of pasta in the pantry.",
      confidence: 0.97,
      source: "web",
      created_at: isoTimestamp(-6, 16, 25),
    }),
    sampleEvent("09-yogurt-thrown-away", {
      event_type: "item_thrown_away",
      item_name: "yogurt",
      quantity: 1,
      unit: "cup",
      location: "fridge",
      expiration_date: null,
      raw_utterance: "Threw away the expired yogurt.",
      confidence: 0.93,
      source: "voice",
      created_at: isoTimestamp(0, 8, 5),
    }),
    sampleEvent("10-bananas-buy", {
      event_type: "item_added_to_buy",
      item_name: "banana",
      quantity: 6,
      unit: "piece",
      location: null,
      expiration_date: null,
      raw_utterance: "Add bananas to the shopping list.",
      confidence: 0.94,
      source: "voice",
      created_at: isoTimestamp(0, 8, 10),
    }),
    sampleEvent("11-coffee-buy", {
      event_type: "item_added_to_buy",
      item_name: "coffee",
      quantity: 1,
      unit: "bag",
      location: null,
      expiration_date: null,
      raw_utterance: "We need coffee beans.",
      confidence: 0.91,
      source: "voice",
      created_at: isoTimestamp(0, 8, 12),
    }),
    sampleEvent("12-crackers-buy", {
      event_type: "item_added_to_buy",
      item_name: "crackers",
      quantity: 1,
      unit: "box",
      location: null,
      expiration_date: null,
      raw_utterance: "Put crackers on the shopping list.",
      confidence: 0.95,
      source: "web",
      created_at: isoTimestamp(0, 8, 13),
    }),
  ];
}

function main(): void {
  mkdirSync(dirname(localDatabasePath), { recursive: true });
  const database = new DatabaseSync(localDatabasePath);

  try {
    database.exec(migrationSql(eventsMigrationPath, "events"));
    const eventColumns = database.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
    if (!eventColumns.some((column) => column.name === "low_threshold")) {
      database.exec(readFileSync(inventoryLowThresholdMigrationPath, "utf8"));
    }
    const records = sampleEvents();

    database.exec("BEGIN");
    database.prepare("DELETE FROM events WHERE id LIKE ?").run(`${sampleIdPrefix}%`);

    const statement = database.prepare(
      `INSERT INTO events (
        id, event_type, item_name, quantity, unit, location, expiration_date,
        raw_utterance, confidence, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const record of records) {
      statement.run(
        record.id,
        record.event_type,
        record.item_name,
        record.quantity ?? null,
        record.unit ?? null,
        record.location ?? null,
        record.expiration_date ?? null,
        record.raw_utterance,
        record.confidence,
        record.source,
        record.created_at,
      );
    }

    database.exec("COMMIT");

    const allEvents = database.prepare(
      "SELECT * FROM events ORDER BY created_at ASC, id ASC",
    ).all() as EventRecord[];
    const inventory = projectInventory(allEvents);
    const shoppingList = projectShoppingList(allEvents);

    process.stdout.write(`Local sample data seeded into ${localDatabasePath}\n`);
    process.stdout.write(`- inserted sample events: ${records.length}\n`);
    process.stdout.write(`- projected inventory items: ${inventory.length}\n`);
    process.stdout.write(`- projected shopping list items: ${shoppingList.length}\n`);
  } finally {
    database.close();
  }
}

main();
