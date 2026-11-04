CREATE TYPE "public"."quote_line_kind" AS ENUM('RENT', 'FEE');--> statement-breakpoint
CREATE TYPE "public"."rental_quote_status" AS ENUM('QUOTE', 'ACCEPTED', 'LOST');--> statement-breakpoint
CREATE TABLE "rental_quote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"kind" "quote_line_kind" DEFAULT 'RENT' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"qty" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"status" "rental_quote_status" DEFAULT 'QUOTE' NOT NULL,
	"customer_id" integer,
	"customer_name" text,
	"contact" text,
	"phone" text,
	"buyer_tax_id" text,
	"address" text,
	"salesperson_id" integer,
	"billing_type" "billing_type" DEFAULT 'MONTHLY' NOT NULL,
	"billing_months" integer DEFAULT 1 NOT NULL,
	"term" integer,
	"planned_start" timestamp with time zone,
	"tax_type" "tax_type" DEFAULT 'INCLUDED' NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"note" text,
	"contract_id" integer,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_quotes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "rental_quote_items" ADD CONSTRAINT "rental_quote_items_quote_id_rental_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."rental_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_quotes" ADD CONSTRAINT "rental_quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_quotes" ADD CONSTRAINT "rental_quotes_salesperson_id_users_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_quotes" ADD CONSTRAINT "rental_quotes_contract_id_rental_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_quotes" ADD CONSTRAINT "rental_quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_quotes_status_idx" ON "rental_quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rental_quotes_customer_idx" ON "rental_quotes" USING btree ("customer_id");