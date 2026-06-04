export * as SessionContextEpoch from "./context-epoch"

import { and, eq, isNull, lt, sql } from "drizzle-orm"
import { DateTime, Effect, Schema } from "effect"
import type { Database } from "../database/database"
import { EventV2 } from "../event"
import { SessionSystemContext } from "../session-system-context"
import { SystemContext } from "../system-context"
import { SessionEvent } from "./event"
import { SessionSchema } from "./schema"
import { SessionContextEpochTable, SessionContextMessageTable } from "./sql"

type DatabaseService = Database.Interface["db"]
const sameBaseline = Schema.toEquivalence(SystemContext.PartsSchema)
const sameCheckpoint = Schema.toEquivalence(SystemContext.CheckpointSchema)

export const prepare = Effect.fn("SessionContextEpoch.prepare")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  context: SessionSystemContext.Interface,
  sessionID: SessionSchema.ID,
) {
  const snapshot = yield* context.load()
  const stored = yield* find(db, sessionID)
  if (!stored) {
    const initialized = SystemContext.initialize(snapshot)
    const event = yield* events.publish(SessionEvent.ContextInitialized, {
      sessionID,
      timestamp: yield* DateTime.now,
      baseline: initialized.baseline,
      checkpoint: initialized.checkpoint,
    })
    if (event.seq === undefined) return yield* Effect.die("Synchronized Session event is missing aggregate sequence")
    return { baseline: initialized.baseline, baselineSeq: event.seq }
  }
  if (stored.replacement_seq !== null) {
    if (SystemContext.replacementBlocked(snapshot, stored.checkpoint))
      return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
    const initialized = SystemContext.initialize(snapshot)
    const event = yield* events.publish(SessionEvent.ContextReplaced, {
      sessionID,
      timestamp: yield* DateTime.now,
      expectedRevision: stored.revision,
      baseline: initialized.baseline,
      checkpoint: initialized.checkpoint,
    })
    if (event.seq === undefined) return yield* Effect.die("Synchronized Session event is missing aggregate sequence")
    return { baseline: initialized.baseline, baselineSeq: event.seq }
  }

  const refreshed = SystemContext.refresh(snapshot, stored.checkpoint)
  if (sameCheckpoint(refreshed.checkpoint, stored.checkpoint))
    return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
  yield* events.publish(SessionEvent.ContextUpdated, {
    sessionID,
    timestamp: yield* DateTime.now,
    expectedRevision: stored.revision,
    parts: refreshed.changes,
    checkpoint: refreshed.checkpoint,
  })
  return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
})

export const find = Effect.fn("SessionContextEpoch.find")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* db
    .select()
    .from(SessionContextEpochTable)
    .where(eq(SessionContextEpochTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
})

export const projectInitialized = Effect.fn("SessionContextEpoch.projectInitialized")(function* (
  db: DatabaseService,
  event: SessionEvent.ContextInitialized,
  seq: number,
) {
  const stored = yield* find(db, event.data.sessionID)
  if (stored) {
    if (stored.baseline_seq > seq) return yield* Effect.void
    if (stored.baseline_seq !== seq || !sameBaseline(stored.baseline, event.data.baseline))
      return yield* Effect.die("Session context epoch initialization conflicts with stored baseline")
    return yield* Effect.void
  }
  return yield* db
    .insert(SessionContextEpochTable)
    .values({
      session_id: event.data.sessionID,
      baseline: event.data.baseline,
      checkpoint: event.data.checkpoint,
      baseline_seq: seq,
      replacement_seq: null,
      revision: 0,
    })
    .run()
    .pipe(Effect.orDie)
})

export const projectUpdated = Effect.fn("SessionContextEpoch.projectUpdated")(function* (
  db: DatabaseService,
  event: SessionEvent.ContextUpdated,
  seq: number,
) {
  const stored = yield* find(db, event.data.sessionID)
  if (!stored) return yield* Effect.die("Session context epoch is not initialized")
  if (stored.baseline_seq > seq) return yield* Effect.void
  if (stored.replacement_seq !== null && seq >= stored.replacement_seq)
    return yield* Effect.die("Session context epoch replacement is pending")
  if (stored.revision > event.data.expectedRevision) {
    if (event.data.parts.length === 0) return yield* Effect.void
    const projected = yield* db
      .select({ parts: SessionContextMessageTable.parts })
      .from(SessionContextMessageTable)
      .where(
        and(eq(SessionContextMessageTable.session_id, event.data.sessionID), eq(SessionContextMessageTable.seq, seq)),
      )
      .get()
      .pipe(Effect.orDie)
    if (projected && sameBaseline(projected.parts, event.data.parts)) return yield* Effect.void
    return yield* Effect.die("Session context update conflicts with stored projection")
  }
  const updated = yield* db
    .update(SessionContextEpochTable)
    .set({ checkpoint: event.data.checkpoint, revision: event.data.expectedRevision + 1 })
    .where(
      and(
        eq(SessionContextEpochTable.session_id, event.data.sessionID),
        eq(SessionContextEpochTable.revision, event.data.expectedRevision),
      ),
    )
    .returning({ revision: SessionContextEpochTable.revision })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* Effect.die("Session context epoch revision mismatch")
  if (event.data.parts.length === 0) return yield* Effect.void
  return yield* db
    .insert(SessionContextMessageTable)
    .values({ session_id: event.data.sessionID, seq, parts: event.data.parts })
    .run()
    .pipe(Effect.orDie)
})

export const projectReplaced = Effect.fn("SessionContextEpoch.projectReplaced")(function* (
  db: DatabaseService,
  event: SessionEvent.ContextReplaced,
  seq: number,
) {
  const stored = yield* find(db, event.data.sessionID)
  if (!stored) return yield* Effect.die("Session context epoch is not initialized")
  if (stored.baseline_seq > seq) return yield* Effect.void
  if (stored.baseline_seq === seq && sameBaseline(stored.baseline, event.data.baseline)) return yield* Effect.void
  if (stored.replacement_seq === null) {
    return yield* Effect.die("Session context epoch replacement was not requested")
  }
  const updated = yield* db
    .update(SessionContextEpochTable)
    .set({
      baseline: event.data.baseline,
      checkpoint: event.data.checkpoint,
      baseline_seq: seq,
      replacement_seq: null,
      revision: event.data.expectedRevision + 1,
    })
    .where(
      and(
        eq(SessionContextEpochTable.session_id, event.data.sessionID),
        eq(SessionContextEpochTable.revision, event.data.expectedRevision),
      ),
    )
    .returning({ revision: SessionContextEpochTable.revision })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* Effect.die("Session context epoch revision mismatch")
  return yield* Effect.void
})

export const requestReplacement = Effect.fn("SessionContextEpoch.requestReplacement")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  seq: number,
) {
  return yield* db
    .update(SessionContextEpochTable)
    .set({ replacement_seq: seq, revision: sql`${SessionContextEpochTable.revision} + 1` })
    .where(
      and(
        eq(SessionContextEpochTable.session_id, sessionID),
        isNull(SessionContextEpochTable.replacement_seq),
        lt(SessionContextEpochTable.baseline_seq, seq),
      ),
    )
    .run()
    .pipe(Effect.orDie)
})
