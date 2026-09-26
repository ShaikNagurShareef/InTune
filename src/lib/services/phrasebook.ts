import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { phraseEntries } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";

export type PhraseEntry = typeof phraseEntries.$inferSelect;

export interface PhraseInput {
  phrase: string;
  meaning: string;
  example: string | null;
}

export interface PhraseRef {
  id: string;
  revision: number;
  phrase: string;
  meaning: string;
}

const MAX_MATCHES = 5;

export async function listPhrases(ownerId: string): Promise<PhraseEntry[]> {
  return db()
    .select()
    .from(phraseEntries)
    .where(and(eq(phraseEntries.ownerId, ownerId), isNull(phraseEntries.deletedAt)))
    .orderBy(asc(phraseEntries.phrase));
}

/** Entries are created only from an explicit "Save this meaning" confirmation by the owner (FR26). */
export async function createPhrase(ownerId: string, input: PhraseInput): Promise<PhraseEntry> {
  const [row] = await db().insert(phraseEntries).values({ ownerId, ...input, approved: true }).returning();
  return row;
}

export async function updatePhrase(
  ownerId: string,
  id: string,
  expectedRevision: number,
  input: PhraseInput,
): Promise<PhraseEntry> {
  const [row] = await db()
    .update(phraseEntries)
    .set({ ...input, revision: expectedRevision + 1, updatedAt: new Date() })
    .where(
      and(
        eq(phraseEntries.id, id),
        eq(phraseEntries.ownerId, ownerId),
        eq(phraseEntries.revision, expectedRevision),
        isNull(phraseEntries.deletedAt),
      ),
    )
    .returning();
  if (!row) {
    const [exists] = await db()
      .select({ id: phraseEntries.id })
      .from(phraseEntries)
      .where(and(eq(phraseEntries.id, id), eq(phraseEntries.ownerId, ownerId), isNull(phraseEntries.deletedAt)));
    if (!exists) throw notFound();
    throw new AppError("stale_version", "This phrase changed elsewhere. Reload to see the latest.");
  }
  return row;
}

export async function deletePhrase(ownerId: string, id: string): Promise<void> {
  const rows = await db()
    .update(phraseEntries)
    .set({ deletedAt: new Date(), phrase: "", meaning: "", example: null })
    .where(and(eq(phraseEntries.id, id), eq(phraseEntries.ownerId, ownerId), isNull(phraseEntries.deletedAt)))
    .returning({ id: phraseEntries.id });
  if (!rows.length) throw notFound();
}

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((t) => t.length > 1);

/**
 * Owner-scoped retrieval of approved, current phrase revisions whose phrase occurs in the text (spec §8 read_phrasebook).
 * Deleted entries and other accounts' entries can never match.
 */
export async function findRelevantPhrases(ownerId: string, text: string): Promise<PhraseRef[]> {
  const lower = text.toLowerCase();
  const textTokens = new Set(tokens(text));
  const entries = await db()
    .select()
    .from(phraseEntries)
    .where(and(eq(phraseEntries.ownerId, ownerId), eq(phraseEntries.approved, true), isNull(phraseEntries.deletedAt)));
  return entries
    .map((e) => {
      const phraseTokens = tokens(e.phrase);
      const overlap = phraseTokens.filter((t) => textTokens.has(t)).length;
      const score = lower.includes(e.phrase.toLowerCase()) ? 1 : overlap / Math.max(phraseTokens.length, 1);
      return { e, score };
    })
    .filter(({ score }) => score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
    .map(({ e }) => ({ id: e.id, revision: e.revision, phrase: e.phrase, meaning: e.meaning }));
}

/** Returns ids whose revision no longer matches (changed or deleted) so stale suggestions can be flagged. */
export async function staleReferences(ownerId: string, refs: readonly { id: string; revision: number }[]): Promise<string[]> {
  if (!refs.length) return [];
  const current = await listPhrases(ownerId);
  const byId = new Map(current.map((p) => [p.id, p.revision]));
  return refs.filter((r) => byId.get(r.id) !== r.revision).map((r) => r.id);
}
