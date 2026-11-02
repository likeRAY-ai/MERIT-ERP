ALTER TABLE "products" ADD COLUMN "alt_code" text;--> statement-breakpoint
CREATE INDEX "products_alt_code_idx" ON "products" USING btree ("alt_code");