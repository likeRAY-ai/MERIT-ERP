CREATE TYPE "public"."asset_status" AS ENUM('AVAILABLE', 'RENTED', 'MAINTENANCE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."billing_type" AS ENUM('MONTHLY', 'DAILY');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
ALTER TYPE "public"."serial_status" ADD VALUE 'RENTAL';--> statement-breakpoint
CREATE TABLE "rental_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "asset_status" DEFAULT 'AVAILABLE' NOT NULL,
	"monthly_rate" integer DEFAULT 0 NOT NULL,
	"daily_rate" integer DEFAULT 0 NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"serial_id" integer,
	"acquired_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_assets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rental_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"sale_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"contact" text,
	"phone" text,
	"address" text,
	"salesperson_id" integer,
	"billing_type" "billing_type" DEFAULT 'MONTHLY' NOT NULL,
	"billing_months" integer DEFAULT 1 NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"next_bill_date" timestamp with time zone,
	"tax_type" "tax_type" DEFAULT 'INCLUDED' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CREDIT' NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"deposit_received_at" timestamp with time zone,
	"deposit_refund" integer,
	"deposit_refunded_at" timestamp with time zone,
	"status" "contract_status" DEFAULT 'ACTIVE' NOT NULL,
	"ended_at" timestamp with time zone,
	"note" text,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contracts_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "rental_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"rate" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_service" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "rental_assets" ADD CONSTRAINT "rental_assets_serial_id_serial_numbers_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."serial_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_contract_id_rental_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_bills" ADD CONSTRAINT "rental_bills_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_contract_id_rental_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_asset_id_rental_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."rental_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_assets_status_idx" ON "rental_assets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_bills_period_unique" ON "rental_bills" USING btree ("contract_id","period_start");--> statement-breakpoint
CREATE INDEX "rental_contracts_status_idx" ON "rental_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rental_contracts_customer_idx" ON "rental_contracts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "rental_items_asset_idx" ON "rental_items" USING btree ("asset_id");--> statement-breakpoint
UPDATE "products" SET "is_service" = true, "stock_qty" = 0 WHERE "note" LIKE '%維修／服務項目%' OR "category_id" IN (SELECT "id" FROM "categories" WHERE "name" = 'Lease');
