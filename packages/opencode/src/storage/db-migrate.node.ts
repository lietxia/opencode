/**
 * Node-sqlite compatible migrate function.
 * drizzle-orm/node-sqlite/migrate only supports folder-based migration,
 * so we implement journal-based migration manually using the underlying DatabaseSync.
 * 
 * This mimics drizzle-orm's internal migration tracking using __drizzle_migrations table.
 * The existing database uses `name` field to track applied migrations (hash is empty).
 */

type MigrationsJournal = { sql: string; timestamp: number; name: string }[]

export function migrate(db: any, entries: MigrationsJournal): void {
  // Access the underlying DatabaseSync client from drizzle wrapper
  const client = db.$client

  // Ensure migration tracking table exists
  client.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at INTEGER,
    name TEXT,
    applied_at TEXT DEFAULT (datetime('now'))
  )`)

  // Get already applied migration names
  const applied = new Set<string>()
  try {
    const stmt = client.prepare("SELECT name FROM __drizzle_migrations WHERE name IS NOT NULL")
    for (const row of stmt.all()) {
      applied.add(row.name as string)
    }
  } catch {
    // Table might not exist yet, that's fine
  }

  // Apply each migration that hasn't been applied yet
  for (const entry of entries) {
    if (applied.has(entry.name)) {
      continue
    }

    // Split on drizzle's statement breakpoint marker
    const statements = entry.sql
      .split("--> statement-breakpoint")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)

    for (const stmt of statements) {
      client.exec(stmt)
    }

    // Record this migration as applied
    const now = new Date().toISOString()
    client.exec(
      `INSERT INTO "__drizzle_migrations" (hash, created_at, name, applied_at) VALUES ('', ${entry.timestamp}, '${entry.name}', '${now}')`
    )
  }
}
