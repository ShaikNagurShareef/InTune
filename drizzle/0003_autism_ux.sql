ALTER TABLE "drafts" ADD COLUMN "tone_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tone_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "comm_card" jsonb;--> statement-breakpoint
ALTER TABLE "reading_aids" ADD COLUMN "summary" jsonb;