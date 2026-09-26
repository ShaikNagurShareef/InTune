ALTER TABLE "circles" ADD COLUMN "kind" text DEFAULT 'group' NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "direct_key" text;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_direct_key_unique" UNIQUE("direct_key");