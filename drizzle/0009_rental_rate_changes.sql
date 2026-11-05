CREATE TABLE "rental_rate_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"old_rate" integer NOT NULL,
	"new_rate" integer NOT NULL,
	"reason" text,
	"changed_by_id" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_rate_changes" ADD CONSTRAINT "rental_rate_changes_contract_id_rental_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_rate_changes" ADD CONSTRAINT "rental_rate_changes_item_id_rental_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."rental_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_rate_changes" ADD CONSTRAINT "rental_rate_changes_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_rate_changes_contract_idx" ON "rental_rate_changes" USING btree ("contract_id");