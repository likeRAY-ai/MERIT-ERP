ALTER TABLE "customers" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "fax" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_type" "tax_type";--> statement-breakpoint
CREATE INDEX "customers_mobile_idx" ON "customers" USING btree ("mobile");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_code_unique" UNIQUE("code");