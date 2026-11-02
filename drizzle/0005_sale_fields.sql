ALTER TABLE "sales" ADD COLUMN "salesperson_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "contact" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "delivery_method" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "invoice_no" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "paid_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "voided_by_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "sales" SET "paid_amount" = "total" WHERE "payment_method" <> 'CREDIT';
