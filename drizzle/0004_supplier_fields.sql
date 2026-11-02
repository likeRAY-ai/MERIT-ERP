ALTER TABLE "suppliers" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "fax" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_code_unique" UNIQUE("code");