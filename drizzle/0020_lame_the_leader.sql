CREATE TABLE "shipping_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"buyer_type" text DEFAULT 'person' NOT NULL,
	"buyer_name" text NOT NULL,
	"company_code" text,
	"vat_code" text,
	"buyer_country" text NOT NULL,
	"buyer_phone" text NOT NULL,
	"buyer_address" text NOT NULL,
	"destination_port" text NOT NULL,
	"receiver_same" boolean DEFAULT true NOT NULL,
	"receiver_name" text,
	"receiver_phone" text,
	"receiver_email" text,
	"receiver_address" text,
	"receiver_country" text,
	"insurance" boolean DEFAULT true NOT NULL,
	"share_container" boolean DEFAULT true NOT NULL,
	"payment_rail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "shipping_profiles" ADD CONSTRAINT "shipping_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;