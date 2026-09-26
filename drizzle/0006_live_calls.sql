CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"room_name" text NOT NULL,
	"kind" text DEFAULT 'audio' NOT NULL,
	"started_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "calls_room_name_unique" UNIQUE("room_name")
);
--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_circle_active" ON "calls" USING btree ("circle_id","ended_at");