import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  deletedAt: ts("deleted_at"),
});

// Communication settings only. Diagnosis fields are intentionally absent (FR02).
export const preferences = pgTable("preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  inputMode: text("input_mode").notNull().default("type"),
  textSize: text("text_size").notNull().default("md"),
  // Sensory colour theme: system (calm by day, soft dark at night), calm, soft-dark or contrast.
  theme: text("theme").notNull().default("system"),
  sentenceLength: text("sentence_length").notNull().default("medium"),
  audioRate: real("audio_rate").notNull().default(1),
  reduceMotion: boolean("reduce_motion").notNull().default(false),
  quietMode: boolean("quiet_mode").notNull().default(false),
  // Auto-translate incoming messages into plain words for this reader (private, opt-in).
  autoTranslate: boolean("auto_translate").notNull().default(false),
  locale: text("locale").notNull().default("en"),
  // Shown to people who share a circle: a self-chosen energy status and a "how to talk with me" card.
  status: text("status").notNull().default("none"),
  commCard: jsonb("comm_card"),
  version: integer("version").notNull().default(1),
  updatedAt: updatedAt(),
});

export const circles = pgTable("circles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // "group" circles are named and invite-based; "direct" circles are one-to-one chats.
  kind: text("kind").notNull().default("group"),
  // Sorted "userA:userB" for direct chats, so each pair has exactly one conversation.
  directKey: text("direct_key").unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  deletedAt: ts("deleted_at"),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: createdAt(),
    removedAt: ts("removed_at"),
    lastReadAt: ts("last_read_at"),
  },
  (t) => [uniqueIndex("memberships_circle_user").on(t.circleId, t.userId)],
);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  circleId: uuid("circle_id")
    .notNull()
    .references(() => circles.id, { onDelete: "cascade" }),
  inviterId: uuid("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  targetEmail: text("target_email"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  usedBy: uuid("used_by"),
  declinedAt: ts("declined_at"),
  revokedAt: ts("revoked_at"),
  createdAt: createdAt(),
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  kind: text("kind").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationSec: real("duration_sec"),
  consentVersion: text("consent_version").notNull(),
  expiresAt: ts("expires_at").notNull(),
  processedAt: ts("processed_at"),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
});

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    replyToId: uuid("reply_to_id"),
    version: integer("version").notNull().default(1),
    sourceMode: text("source_mode").notNull().default("type"),
    sourceText: text("source_text").notNull().default(""),
    transcript: text("transcript"),
    text: text("text").notNull().default(""),
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    assist: jsonb("assist"),
    toneTags: text("tone_tags").array().notNull().default([]),
    mediaId: uuid("media_id"),
    status: text("status").notNull().default("DRAFT"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("drafts_owner").on(t.ownerId)],
);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inputVersion: integer("input_version").notNull(),
  status: text("status").notNull().default("RUNNING"),
  stage: text("stage").notNull().default("queued"),
  wordingMode: text("wording_mode").notNull().default("keep"),
  clarificationRounds: integer("clarification_rounds").notNull().default(0),
  result: jsonb("result"),
  errorCode: text("error_code"),
  modelId: text("model_id"),
  promptVersion: text("prompt_version"),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Immutable. Created only by the authenticated approve endpoint (FR21).
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  draftVersion: integer("draft_version").notNull(),
  contentHash: text("content_hash").notNull(),
  audienceHash: text("audience_hash").notNull(),
  createdAt: createdAt(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    replyToId: uuid("reply_to_id"),
    text: text("text").notNull(),
    version: integer("version").notNull().default(1),
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    // Chosen by the sender only, never by a model.
    toneTags: text("tone_tags").array().notNull().default([]),
    approvalId: uuid("approval_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    // Millisecond precision so the (created_at, id) cursor round-trips exactly through a JS Date.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    editedAt: ts("edited_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("messages_sender_idem").on(t.senderId, t.idempotencyKey),
    index("messages_circle_order").on(t.circleId, t.createdAt, t.id),
  ],
);

export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  circleId: uuid("circle_id").notNull(),
  kind: text("kind").notNull(),
  createdAt: createdAt(),
});

// Recipient-private simplification (FR24). Never shown to anyone else.
export const readingAids = pgTable(
  "reading_aids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageVersion: integer("message_version").notNull(),
    simplifiedText: text("simplified_text").notNull(),
    warnings: jsonb("warnings"),
    summary: jsonb("summary"),
    modelId: text("model_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reading_aids_unique").on(t.messageId, t.userId, t.messageVersion)],
);

export const phraseEntries = pgTable("phrase_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  phrase: text("phrase").notNull(),
  meaning: text("meaning").notNull(),
  example: text("example"),
  approved: boolean("approved").notNull().default(true),
  revision: integer("revision").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: ts("deleted_at"),
});

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  circleId: uuid("circle_id")
    .notNull()
    .references(() => circles.id, { onDelete: "cascade" }),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  includedText: text("included_text"),
  status: text("status").notNull().default("open"),
  resolvedBy: uuid("resolved_by"),
  resolvedAt: ts("resolved_at"),
  createdAt: createdAt(),
});

// Content-free operational events for diagnostics (no message bodies, prompts or keys).
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    kind: text("kind").notNull(),
    requestId: text("request_id"),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_kind_time").on(t.kind, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

/** Live audio/video calls in a circle or direct chat. Media flows through LiveKit; nothing is recorded. */
export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    roomName: text("room_name").notNull().unique(),
    kind: text("kind").notNull().default("audio"),
    startedBy: uuid("started_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: createdAt(),
    /** Last time someone got a join token or was seen in the room; the empty-room grace period counts from here. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: ts("ended_at"),
  },
  (t) => [index("calls_circle_active").on(t.circleId, t.endedAt)],
);
