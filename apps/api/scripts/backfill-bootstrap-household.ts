import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

interface Options {
  remote: boolean;
  apply: boolean;
  ownerEmail: string;
  householdName: string;
  confirmation?: string;
}

interface D1Result<T> {
  results?: T[];
  success?: boolean;
}

interface OwnerRow {
  id: string;
  google_subject: string;
  email: string;
}

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]): Options {
  const options: Partial<Options> = {
    remote: false,
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--remote") {
      options.remote = true;
    } else if (current === "--apply") {
      options.apply = true;
    } else if (current === "--owner-email" && next) {
      options.ownerEmail = next.trim();
      index += 1;
    } else if (current === "--household-name" && next) {
      options.householdName = next.trim();
      index += 1;
    } else if (current === "--confirm" && next) {
      options.confirmation = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${current}`);
    }
  }

  if (!options.remote) {
    throw new Error("--remote is required; this tool is only for production backfill");
  }
  if (!options.ownerEmail) throw new Error("--owner-email is required");
  if (!options.householdName) throw new Error("--household-name is required");
  if (options.apply && options.confirmation !== options.householdName) {
    throw new Error(
      `--apply requires --confirm "${options.householdName}"`,
    );
  }

  return options as Options;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runWrangler(args: string[]): string {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    ["wrangler", "d1", "execute", "jangoing-db", ...args],
    {
      cwd: apiDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Wrangler failed");
  }
  return result.stdout;
}

function query<T>(sql: string): T[] {
  const output = runWrangler([
    "--remote",
    "--json",
    "--command",
    sql,
  ]);
  const parsed = JSON.parse(output) as D1Result<T>[];
  const result = parsed[0];
  if (!result?.success) throw new Error("D1 query did not succeed");
  return result.results ?? [];
}

function scalarCount(sql: string): number {
  const [row] = query<{ count: number }>(sql);
  return Number(row?.count ?? 0);
}

function audit(options: Options): {
  owner: OwnerRow;
  legacyEvents: number;
  webInferences: number;
  legacyAppState: number;
} {
  const requiredTables = query<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name IN (
         'users', 'households', 'household_memberships',
         'household_app_state', 'app_state', 'events', 'inference_logs'
       )
     ORDER BY name`,
  );
  if (requiredTables.length !== 7) {
    throw new Error(
      "Remote household migrations are not fully applied; expected seven required tables",
    );
  }

  const owners = query<OwnerRow>(
    `SELECT id, google_subject, email
     FROM users
     WHERE lower(email) = lower(${sqlString(options.ownerEmail)})`,
  );
  if (owners.length !== 1) {
    throw new Error(
      `Expected exactly one signed-in user for ${options.ownerEmail}, found ${owners.length}`,
    );
  }
  const owner = owners[0];

  const memberships = scalarCount(
    `SELECT COUNT(*) AS count
     FROM household_memberships
     WHERE user_id = ${sqlString(owner.id)}`,
  );
  if (memberships !== 0) {
    throw new Error("The selected owner already belongs to a household");
  }
  const matchingHouseholds = scalarCount(
    `SELECT COUNT(*) AS count
     FROM households
     WHERE name = ${sqlString(options.householdName)}`,
  );
  if (matchingHouseholds !== 0) {
    throw new Error("A household with the selected name already exists");
  }

  const legacyEvents = scalarCount(
    "SELECT COUNT(*) AS count FROM events WHERE household_id IS NULL",
  );
  const webInferences = scalarCount(
    `SELECT COUNT(*) AS count
     FROM inference_logs
     WHERE household_id IS NULL AND source = 'web'`,
  );
  const legacyAppState = scalarCount(
    "SELECT COUNT(*) AS count FROM app_state",
  );
  const otherInferenceSources = query<{ source: string; count: number }>(
    `SELECT source, COUNT(*) AS count
     FROM inference_logs
     WHERE household_id IS NULL AND source <> 'web'
     GROUP BY source
     ORDER BY source`,
  );

  console.log("Bootstrap household backfill audit");
  console.log(`- owner email: ${owner.email}`);
  console.log(`- owner Google subject: ${owner.google_subject}`);
  console.log(`- household: ${options.householdName}`);
  console.log(`- unassigned consumer events: ${legacyEvents}`);
  console.log(`- unassigned web inferences: ${webInferences}`);
  console.log(`- legacy app-state rows to copy: ${legacyAppState}`);
  console.log("- inference sources left unassigned:");
  if (otherInferenceSources.length === 0) {
    console.log("  (none)");
  } else {
    for (const row of otherInferenceSources) {
      console.log(`  ${row.source}: ${Number(row.count)}`);
    }
  }

  return { owner, legacyEvents, webInferences, legacyAppState };
}

function applyBackfill(
  options: Options,
  auditResult: ReturnType<typeof audit>,
): void {
  const householdId = randomUUID();
  const timestamp = new Date().toISOString();
  const sql = `
INSERT INTO households (id, name, created_at, updated_at)
VALUES (
  ${sqlString(householdId)},
  ${sqlString(options.householdName)},
  ${sqlString(timestamp)},
  ${sqlString(timestamp)}
);

INSERT INTO household_memberships (household_id, user_id, role, created_at)
VALUES (
  ${sqlString(householdId)},
  ${sqlString(auditResult.owner.id)},
  'owner',
  ${sqlString(timestamp)}
);

UPDATE events
SET household_id = ${sqlString(householdId)}
WHERE household_id IS NULL;

UPDATE inference_logs
SET household_id = ${sqlString(householdId)},
    user_id = ${sqlString(auditResult.owner.id)}
WHERE household_id IS NULL
  AND source = 'web';

INSERT INTO household_app_state (household_id, key, value, updated_at)
SELECT ${sqlString(householdId)}, key, value, updated_at
FROM app_state;

INSERT INTO household_app_state (household_id, key, value, updated_at)
VALUES (
  ${sqlString(householdId)},
  'legacy_backfill_completed_at',
  ${sqlString(timestamp)},
  ${sqlString(timestamp)}
);
`.trim();

  const temporaryDirectory = mkdtempSync(
    resolve(tmpdir(), "jangoing-household-backfill-"),
  );
  const sqlPath = resolve(temporaryDirectory, "backfill.sql");
  try {
    writeFileSync(sqlPath, `${sql}\n`, { mode: 0o600 });
    runWrangler(["--remote", "--file", sqlPath, "--yes"]);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const [verification] = query<{
    memberships: number;
    events: number;
    web_inferences: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM household_memberships
        WHERE household_id = ${sqlString(householdId)}
          AND user_id = ${sqlString(auditResult.owner.id)}
          AND role = 'owner') AS memberships,
       (SELECT COUNT(*) FROM events
        WHERE household_id = ${sqlString(householdId)}) AS events,
       (SELECT COUNT(*) FROM inference_logs
        WHERE household_id = ${sqlString(householdId)}
          AND source = 'web') AS web_inferences`,
  );
  if (
    Number(verification?.memberships) !== 1 ||
    Number(verification?.events) !== auditResult.legacyEvents ||
    Number(verification?.web_inferences) !== auditResult.webInferences
  ) {
    throw new Error("Backfill verification failed");
  }

  console.log("Backfill applied and verified.");
  console.log(`- household id: ${householdId}`);
  console.log(`- events assigned: ${verification.events}`);
  console.log(`- web inferences assigned: ${verification.web_inferences}`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const auditResult = audit(options);
  if (!options.apply) {
    console.log("");
    console.log("Dry run only. No data was changed.");
    console.log(
      `Apply with --apply --confirm ${JSON.stringify(options.householdName)}`,
    );
    return;
  }
  applyBackfill(options, auditResult);
}

main();
