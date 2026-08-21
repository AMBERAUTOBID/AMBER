CREATE TABLE "order_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"number" text NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"r2_key" text NOT NULL,
	"locale" text NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_order_id_vehicle_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."vehicle_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_invoices_order_id_idx" ON "order_invoices" USING btree ("order_id");