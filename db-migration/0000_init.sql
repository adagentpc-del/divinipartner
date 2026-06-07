CREATE TABLE "partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"secondary_logo_url" text,
	"website_url" text,
	"small_a3_badge_enabled" boolean DEFAULT true NOT NULL,
	"intro_headline" text,
	"intro_text" text,
	"thank_you_text" text,
	"capabilities_link" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"routing_email" text,
	"venue_address" text,
	"industry_focus" text,
	"use_case_options_json" jsonb,
	"global_sizzle_reel_url" text,
	"partner_video_url" text,
	"partner_deck_file_url" text,
	"site_survey_deck_file_url" text,
	"pricing_display_enabled" boolean DEFAULT false NOT NULL,
	"portal_mode" text DEFAULT 'intake' NOT NULL,
	"partner_type" text,
	"default_supplier_id" integer,
	"pricing_mode" text DEFAULT 'hidden' NOT NULL,
	"billing_info_json" jsonb,
	"default_billing_exec_model" text DEFAULT 'a3_collected' NOT NULL,
	"billing_entity_name" text,
	"invoice_template" text,
	"payment_terms" text,
	"deposit_required" boolean DEFAULT false NOT NULL,
	"deposit_pct" numeric(5, 2),
	"allow_partial_payment" boolean DEFAULT true NOT NULL,
	"allow_order_override" boolean DEFAULT true NOT NULL,
	"default_billing_notes" text,
	"billing_contact_name" text,
	"billing_contact_email" text,
	"billing_contact_phone" text,
	"internal_billing_owner_user_id" text,
	"billing_active" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_reason" text,
	"launch_status" text DEFAULT 'draft' NOT NULL,
	"launched_at" timestamp with time zone,
	"launch_override_note" text,
	"demo_flag" boolean DEFAULT false NOT NULL,
	"setup_template" text,
	"unit_preference" text,
	"commercial_account_id" integer,
	"email_from_name" text,
	"reply_to_email" text,
	"email_sender_label" text,
	"internal_forward_email" text,
	"cc_email" text,
	"design_contact_name" text,
	"design_contact_email" text,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"attach_pdf_customer" boolean DEFAULT false NOT NULL,
	"attach_pdf_ops" boolean DEFAULT true NOT NULL,
	"attach_pdf_finance" boolean DEFAULT false NOT NULL,
	"attach_pdf_partner_contact" boolean DEFAULT false NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"default_tax_mode" text DEFAULT 'none' NOT NULL,
	"default_tax_label" text,
	"default_tax_rate" numeric(5, 3),
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"billing_country" text,
	"invoice_display_notes" text,
	"netsuite_customer_number" text,
	"program_manager_name" text,
	"program_manager_email" text,
	"internal_account_owner_name" text,
	"internal_account_owner_email" text,
	"support_contact_name" text,
	"support_contact_email" text,
	"salesperson_name" text,
	"salesperson_email" text,
	"salesperson_phone" text,
	"internal_reply_to_email" text,
	"addon_display_format" text DEFAULT 'grid' NOT NULL,
	"addon_category_grouping_enabled" boolean DEFAULT false NOT NULL,
	"walkthrough_enabled" boolean DEFAULT true NOT NULL,
	"walkthrough_video_url" text,
	"walkthrough_video_poster_url" text,
	"walkthrough_video_status" text DEFAULT 'interactive_ready' NOT NULL,
	"walkthrough_script" jsonb,
	"walkthrough_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "partner_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"asset_type" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"primary_color" text,
	"secondary_color" text,
	"accent_color" text,
	"background_color" text,
	"button_color" text,
	"text_color" text,
	"heading_font" text,
	"body_font" text,
	"button_style" text,
	"border_radius" text,
	"tone_preset" text,
	"theme_notes" text,
	"ai_suggested_json" text,
	"is_approved" text DEFAULT 'pending' NOT NULL,
	"template_key" text DEFAULT 'clean_premium' NOT NULL,
	"logo_storage_key" text,
	"logo_url" text,
	"logo_alt_text" text,
	"logo_placement" text DEFAULT 'navbar_left' NOT NULL,
	"logo_background_treatment" text DEFAULT 'none' NOT NULL,
	"hero_eyebrow" text,
	"hero_headline" text,
	"hero_subheadline" text,
	"hero_background_mode" text DEFAULT 'gradient' NOT NULL,
	"hero_background_storage_key" text,
	"hero_overlay_intensity" real DEFAULT 0.45 NOT NULL,
	"card_style" text DEFAULT 'elevated' NOT NULL,
	"border_radius_style" text DEFAULT 'soft' NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"secondary_cta_label" text,
	"secondary_cta_url" text,
	"header_theme" text DEFAULT 'dark' NOT NULL,
	"header_layout_style" text DEFAULT 'full_width_hero' NOT NULL,
	"header_background_video_url" text,
	"main_logo_storage_key" text,
	"main_logo_url" text,
	"secondary_logo_storage_key" text,
	"secondary_logo_url" text,
	"main_logo_display_mode" text DEFAULT 'contained_logo' NOT NULL,
	"secondary_logo_placement" text DEFAULT 'footer_and_cart' NOT NULL,
	"header_logo_max_height" integer DEFAULT 96 NOT NULL,
	"header_logo_width_percent" integer DEFAULT 80 NOT NULL,
	"header_alignment" text DEFAULT 'center' NOT NULL,
	"header_object_fit" text DEFAULT 'contain' NOT NULL,
	"header_padding_top" integer DEFAULT 72 NOT NULL,
	"header_padding_bottom" integer DEFAULT 72 NOT NULL,
	"header_background_color" text,
	"header_glow_enabled" boolean DEFAULT true NOT NULL,
	"animation_level" text DEFAULT 'subtle' NOT NULL,
	"show_powered_by_a3" boolean DEFAULT true NOT NULL,
	"custom_welcome_message" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_themes_partner_id_unique" UNIQUE("partner_id")
);
--> statement-breakpoint
CREATE TABLE "partner_email_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"role" text NOT NULL,
	"email" text NOT NULL,
	"label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"role" text DEFAULT 'other' NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"section_type" text NOT NULL,
	"title" text,
	"subtitle" text,
	"description" text,
	"featured_image_url" text,
	"featured_video_url" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_branding_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"name" text NOT NULL,
	"internal_code" text,
	"category" text NOT NULL,
	"description" text,
	"size_width" double precision,
	"size_height" double precision,
	"size_depth" double precision,
	"size_diameter" double precision,
	"size_unit" text DEFAULT 'inches',
	"size_width_mm" double precision,
	"size_height_mm" double precision,
	"size_depth_mm" double precision,
	"size_diameter_mm" double precision,
	"artwork_unit" text,
	"artwork_width" double precision,
	"artwork_height" double precision,
	"artwork_width_mm" double precision,
	"artwork_height_mm" double precision,
	"bleed" double precision,
	"bleed_mm" double precision,
	"safe_area" double precision,
	"safe_area_mm" double precision,
	"visible_width" double precision,
	"visible_height" double precision,
	"visible_width_mm" double precision,
	"visible_height_mm" double precision,
	"pricing_model" text DEFAULT 'fixed' NOT NULL,
	"unit_rate" numeric(12, 4),
	"pricing_unit" text,
	"min_billable_size" double precision,
	"min_charge" numeric(12, 2),
	"allows_custom_size" boolean DEFAULT false NOT NULL,
	"source_page_number" integer,
	"source_file_url" text,
	"preview_image_url" text,
	"confidence_score" double precision,
	"default_supplier_id" integer,
	"production_notes_internal" text,
	"install_notes_internal" text,
	"template_file_url" text,
	"artwork_guidelines" text,
	"review_status" text DEFAULT 'needs_review' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_product_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"custom_title" text,
	"custom_description" text,
	"custom_image_url" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"product_id" integer,
	"survey_asset_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"category_override" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"sku" text,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"image_url" text,
	"gallery_images_json" jsonb,
	"visible_dimensions" text,
	"size_width" double precision,
	"size_height" double precision,
	"size_depth" double precision,
	"size_diameter" double precision,
	"size_unit" text,
	"size_width_mm" double precision,
	"size_height_mm" double precision,
	"size_depth_mm" double precision,
	"size_diameter_mm" double precision,
	"artwork_unit" text,
	"artwork_width" double precision,
	"artwork_height" double precision,
	"artwork_width_mm" double precision,
	"artwork_height_mm" double precision,
	"bleed" double precision,
	"bleed_mm" double precision,
	"safe_area" double precision,
	"safe_area_mm" double precision,
	"visible_width" double precision,
	"visible_height" double precision,
	"visible_width_mm" double precision,
	"visible_height_mm" double precision,
	"pricing_model" text DEFAULT 'fixed' NOT NULL,
	"unit_rate" numeric(12, 4),
	"pricing_unit" text,
	"min_billable_size" double precision,
	"min_charge" numeric(12, 2),
	"allows_custom_size" boolean DEFAULT false NOT NULL,
	"backend_production_notes" text,
	"hardware_included" boolean DEFAULT false NOT NULL,
	"print_only_available" boolean DEFAULT false NOT NULL,
	"rental_eligible" boolean DEFAULT false NOT NULL,
	"use_partner_inventory_eligible" boolean DEFAULT false NOT NULL,
	"reusable_hardware_compatible" boolean DEFAULT false NOT NULL,
	"inventory_tracked" boolean DEFAULT false NOT NULL,
	"requires_attachment_selection" boolean DEFAULT false NOT NULL,
	"requires_material_selection" boolean DEFAULT false NOT NULL,
	"attachment_method" text,
	"material" text,
	"finishing" text,
	"install_notes" text,
	"internal_ops_summary" text,
	"feature_badges_json" jsonb,
	"supplier_id" integer,
	"lead_time_days" integer,
	"is_orderable" boolean DEFAULT true NOT NULL,
	"allows_design_request" boolean DEFAULT true NOT NULL,
	"size_options_json" jsonb,
	"packed_width" double precision,
	"packed_height" double precision,
	"packed_depth" double precision,
	"packed_size_unit" text,
	"packed_width_mm" double precision,
	"packed_height_mm" double precision,
	"packed_depth_mm" double precision,
	"shipping_weight" double precision,
	"shipping_weight_unit" text,
	"shipping_weight_g" double precision,
	"carton_count" integer,
	"packing_mode" text,
	"crate_required" boolean DEFAULT false NOT NULL,
	"pallet_required" boolean DEFAULT false NOT NULL,
	"oversize_flag" boolean DEFAULT false NOT NULL,
	"freight_class" text,
	"install_kit_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" text,
	"customer_facing_summary" text,
	"review_status" text DEFAULT 'approved' NOT NULL,
	"missing_data_flags_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_catalog_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_families" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"hardware_product_id" integer,
	"requires_hardware_default" boolean DEFAULT true NOT NULL,
	"low_stock_threshold" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_family_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"role" text DEFAULT 'component' NOT NULL,
	"requires_hardware_units" integer DEFAULT 1 NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"event_name" text NOT NULL,
	"event_date" text,
	"venue_name" text,
	"venue_address" text,
	"install_datetime" text,
	"removal_datetime" text,
	"post_event_disposition" text,
	"industry" text,
	"use_case" text,
	"design_assistance_requested" boolean DEFAULT false NOT NULL,
	"custom_fabrication_requested" boolean DEFAULT false NOT NULL,
	"immersive_requested" boolean DEFAULT false NOT NULL,
	"promotional_items_requested" boolean DEFAULT false NOT NULL,
	"additional_notes" text,
	"status" text DEFAULT 'New' NOT NULL,
	"ai_summary" text,
	"ai_summary_input_hash" text,
	"internal_summary" text,
	"estimated_scope_level" text,
	"recommended_upsells_json" jsonb,
	"pdf_summary_url" text,
	"estimated_price" numeric(12, 2),
	"quote_status" text DEFAULT 'needs_review' NOT NULL,
	"quote_summary" text,
	"quote_ready" boolean DEFAULT false NOT NULL,
	"production_owner" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"category" text NOT NULL,
	"item_name" text NOT NULL,
	"quantity_note" text,
	"size_note" text,
	"size_width" double precision,
	"size_height" double precision,
	"size_unit" text,
	"size_width_mm" double precision,
	"size_height_mm" double precision,
	"pricing_model" text,
	"unit_rate" numeric(12, 4),
	"pricing_unit" text,
	"calculated_area_sqm" double precision,
	"calculated_linear_m" double precision,
	"estimated_price" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"upload_type" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"request_type" text NOT NULL,
	"request_category" text,
	"main_contact_name" text NOT NULL,
	"company_name" text,
	"email" text NOT NULL,
	"phone" text,
	"website_url" text,
	"event_page_url" text,
	"event_name" text,
	"event_date" text,
	"needed_by_date" text,
	"venue_name" text,
	"venue_location" text,
	"attendee_count" text,
	"description" text,
	"design_help_needed" boolean DEFAULT false NOT NULL,
	"artwork_status" text,
	"design_brief" text,
	"style_notes" text,
	"proof_deadline" text,
	"budget_range" text,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"estimated_price" numeric(12, 2),
	"cost_notes" text,
	"quote_summary" text,
	"turnaround_notes" text,
	"quote_ready" boolean DEFAULT false NOT NULL,
	"quote_status" text DEFAULT 'needs_review' NOT NULL,
	"production_owner" text,
	"install_required" text,
	"production_notes" text,
	"fulfillment_notes" text,
	"vendor_notes" text,
	"production_deadline" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"recurring_event" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partnership_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"partner_type" text,
	"portal_use_case" text,
	"estimated_volume" text,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"product_id" integer,
	"main_contact_name" text NOT NULL,
	"company_name" text,
	"email" text NOT NULL,
	"phone" text,
	"website_url" text,
	"event_page_url" text,
	"event_name" text,
	"event_date" text,
	"needed_by_date" text,
	"quantity" integer,
	"selected_size" text,
	"selected_options_json" jsonb,
	"design_help_needed" boolean DEFAULT false NOT NULL,
	"artwork_status" text,
	"design_brief" text,
	"style_notes" text,
	"proof_deadline" text,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"estimated_price" numeric(12, 2),
	"cost_notes" text,
	"quote_summary" text,
	"turnaround_notes" text,
	"quote_ready" boolean DEFAULT false NOT NULL,
	"quote_status" text DEFAULT 'needs_review' NOT NULL,
	"production_owner" text,
	"install_required" text,
	"production_notes" text,
	"fulfillment_notes" text,
	"vendor_notes" text,
	"production_deadline" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"recurring_event" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branding_location_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"branding_location_id" integer,
	"main_contact_name" text NOT NULL,
	"company_name" text,
	"email" text NOT NULL,
	"phone" text,
	"website_url" text,
	"event_page_url" text,
	"event_name" text,
	"event_date" text,
	"needed_by_date" text,
	"design_help_needed" boolean DEFAULT false NOT NULL,
	"artwork_status" text,
	"design_brief" text,
	"style_notes" text,
	"proof_deadline" text,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"estimated_price" numeric(12, 2),
	"cost_notes" text,
	"quote_summary" text,
	"turnaround_notes" text,
	"quote_ready" boolean DEFAULT false NOT NULL,
	"quote_status" text DEFAULT 'needs_review' NOT NULL,
	"production_owner" text,
	"install_required" text,
	"production_notes" text,
	"fulfillment_notes" text,
	"vendor_notes" text,
	"production_deadline" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"recurring_event" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_type" text NOT NULL,
	"request_id" integer NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"item_name" text NOT NULL,
	"starting_price" double precision,
	"internal_cost_basis" double precision,
	"rush_fee_rule" text,
	"install_fee_rule" text,
	"removal_fee_rule" text,
	"design_fee_rule" text,
	"upsell_tags_json" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"note_body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_extraction_claims" (
	"partner_id" integer NOT NULL,
	"file_hash" text NOT NULL,
	"extraction_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_extraction_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"extraction_id" integer NOT NULL,
	"partner_id" integer NOT NULL,
	"location_name" text NOT NULL,
	"category" text DEFAULT 'Custom / Other' NOT NULL,
	"description" text,
	"dimensions_text" text,
	"size_width" double precision,
	"size_height" double precision,
	"size_unit" text DEFAULT 'inches',
	"source_page_number" integer,
	"extracted_text_snippet" text,
	"confidence_score" double precision,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_extractions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"source_file_url" text NOT NULL,
	"source_file_name" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"total_pages" integer,
	"processed_at" timestamp with time zone,
	"error_message" text,
	"file_hash" text,
	"file_size" integer,
	"extracted_text" text,
	"relevant_chunks" jsonb,
	"chunk_count" integer,
	"parse_source" text,
	"deduped_from_id" integer,
	"ai_tokens_input" integer,
	"ai_tokens_output" integer,
	"ai_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_extraction_claims" (
	"partner_id" integer NOT NULL,
	"file_hash" text NOT NULL,
	"extraction_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_extractions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"source_file_url" text NOT NULL,
	"source_file_name" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"total_pages" integer,
	"processed_at" timestamp with time zone,
	"error_message" text,
	"file_hash" text,
	"file_size" integer,
	"extracted_text" text,
	"parse_source" text,
	"deduped_from_id" integer,
	"ai_tokens_input" integer,
	"ai_tokens_output" integer,
	"ai_model" text,
	"parsed_rows" jsonb,
	"parse_warnings" jsonb,
	"commit_result" jsonb,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"description" text,
	"categories_json" jsonb,
	"capabilities_json" jsonb,
	"territory_json" jsonb,
	"fulfillment_notes" text,
	"internal_contacts_json" jsonb,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"company_name" text,
	"website" text,
	"address_line" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"default_lead_time_days" integer,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer,
	"name" text NOT NULL,
	"state" text,
	"country" text DEFAULT 'USA',
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer,
	"city_id" integer,
	"name" text NOT NULL,
	"venue_address" text,
	"shipping_address" text,
	"onsite_contact_name" text,
	"onsite_contact_phone" text,
	"onsite_contact_email" text,
	"install_notes" text,
	"shipping_instructions" text,
	"deadline_notes" text,
	"image_url" text,
	"unit_preference" text,
	"country" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"city_id" integer,
	"venue_id" integer,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"event_start_date" date,
	"event_end_date" date,
	"install_date" date,
	"teardown_date" date,
	"shipping_deadline" date,
	"ordering_opens_at" timestamp with time zone,
	"ordering_closes_at" timestamp with time zone,
	"venue_contacts_json" jsonb,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"available_package_ids_json" jsonb,
	"available_product_ids_json" jsonb,
	"quantity_limits_json" jsonb,
	"addon_override_json" jsonb,
	"addon_display_format" text,
	"image_url" text,
	"billing_exec_model_override" text,
	"currency" text,
	"tax_mode" text,
	"tax_label" text,
	"tax_rate" numeric(5, 3),
	"tax_inclusive" boolean,
	"unit_preference" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"package_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer,
	"supplier_id" integer,
	"name" text NOT NULL,
	"display_name" text,
	"description" text,
	"tier" integer DEFAULT 1 NOT NULL,
	"price" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"image_url" text,
	"image_urls" text[],
	"size_width" double precision,
	"size_height" double precision,
	"size_depth" double precision,
	"size_diameter" double precision,
	"size_unit" text,
	"size_width_mm" double precision,
	"size_height_mm" double precision,
	"size_depth_mm" double precision,
	"size_diameter_mm" double precision,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_blackouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text DEFAULT 'manual' NOT NULL,
	"reason_note" text,
	"event_id" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date,
	"end_date" date,
	"hold_reason" text DEFAULT 'event' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer,
	"city_id" integer NOT NULL,
	"product_id" integer,
	"name" text,
	"category" text,
	"asset_type" text DEFAULT 'hardware' NOT NULL,
	"storage_location" text,
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"hardware_on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"in_use" integer DEFAULT 0 NOT NULL,
	"damaged" integer DEFAULT 0 NOT NULL,
	"retired" integer DEFAULT 0 NOT NULL,
	"on_order" integer DEFAULT 0 NOT NULL,
	"reorder_threshold" integer DEFAULT 2 NOT NULL,
	"graphic_only_available" boolean DEFAULT true NOT NULL,
	"low_inventory_threshold" integer DEFAULT 2 NOT NULL,
	"rentable" boolean DEFAULT false NOT NULL,
	"rental_price" numeric(10, 2),
	"price_basis" text DEFAULT 'per_event' NOT NULL,
	"eligibility_mode" text DEFAULT 'all' NOT NULL,
	"eligible_event_ids" integer[] DEFAULT '{}' NOT NULL,
	"eligible_city_ids" integer[] DEFAULT '{}' NOT NULL,
	"archived_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_spec_standards" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"supplier_id" integer,
	"branding_zone_id" integer,
	"package_id" integer,
	"title" text NOT NULL,
	"standard_type" text DEFAULT 'preferred' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"dimensions_summary" text,
	"material_summary" text,
	"finishing_summary" text,
	"attachment_summary" text,
	"hardware_summary" text,
	"lead_time_days" integer,
	"print_file_requirements" text,
	"install_notes" text,
	"internal_ops_notes" text,
	"effective_date" date,
	"expiration_date" date,
	"source_quote_asset_ids_json" jsonb,
	"review_status" text DEFAULT 'new' NOT NULL,
	"review_notes" text,
	"missing_data_flags_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_asset_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_asset_id" integer NOT NULL,
	"mapping_type" text NOT NULL,
	"mapping_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"attachable_type" text NOT NULL,
	"attachable_id" integer NOT NULL,
	"name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text,
	"version" text,
	"supplier_id" integer,
	"supplier_name" text,
	"effective_date" date,
	"expiration_date" date,
	"is_approved_standard" boolean DEFAULT false NOT NULL,
	"internal_only" boolean DEFAULT true NOT NULL,
	"vendor_visible" boolean DEFAULT false NOT NULL,
	"source_type" text DEFAULT 'quote' NOT NULL,
	"processing_status" text DEFAULT 'new' NOT NULL,
	"confidence_flag" text,
	"extracted_display_name" text,
	"extracted_internal_name" text,
	"extracted_category" text,
	"customer_facing_summary" text,
	"backend_ops_summary" text,
	"dimensions_summary" text,
	"pricing_unit" text,
	"unit_rate" numeric(12, 4),
	"billable_area_sqm" double precision,
	"billable_linear_m" double precision,
	"min_billable_size" double precision,
	"source_unit" text,
	"material_summary" text,
	"finishing_summary" text,
	"attachment_summary" text,
	"hardware_summary" text,
	"lead_time_text" text,
	"print_file_requirements" text,
	"install_notes" text,
	"ops_notes" text,
	"review_notes" text,
	"clarification_needed" text,
	"missing_data_flags_json" jsonb,
	"notes" text,
	"uploaded_by" text,
	"file_hash" text,
	"extracted_text" text,
	"parsed_at" timestamp with time zone,
	"parsed_source" text,
	"parsed_review_status" text DEFAULT 'pending',
	"parsed_currency" text,
	"parsed_currency_confidence" text,
	"parsed_tax_label" text,
	"parsed_tax_rate" numeric(5, 3),
	"parsed_tax_amount" numeric(12, 2),
	"parsed_tax_inclusive" boolean,
	"parsed_subtotal_amount" numeric(12, 2),
	"parsed_total_amount" numeric(12, 2),
	"parsed_quote_reference" text,
	"parsed_supplier_name" text,
	"parsed_payment_terms" text,
	"parsed_deposit_amount" numeric(12, 2),
	"parsed_billing_country" text,
	"parsed_incoterm" text,
	"parsed_billing_notes" text,
	"parsed_billing_flags_json" jsonb,
	"parsed_missing_fields_json" jsonb,
	"parsed_ai_tokens_input" integer,
	"parsed_ai_tokens_output" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"item_type" text NOT NULL,
	"product_id" integer,
	"package_id" integer,
	"branding_zone_id" integer,
	"survey_asset_id" integer,
	"selected_material" text,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2),
	"estimated_supplier_cost" numeric(12, 2),
	"final_supplier_cost" numeric(12, 2),
	"fulfillment_mode" text,
	"hardware_required" boolean DEFAULT false NOT NULL,
	"print_demand_quantity" integer DEFAULT 0 NOT NULL,
	"hardware_demand_quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"shortage_quantity" integer DEFAULT 0 NOT NULL,
	"inventory_source_city_id" integer,
	"inventory_source_inventory_id" integer,
	"inventory_reservation_id" integer,
	"internal_fulfillment_notes" text,
	"assigned_supplier_id" integer,
	"supplier_assignment_source" text,
	"supplier_status" text DEFAULT 'unassigned' NOT NULL,
	"supplier_due_date" timestamp with time zone,
	"supplier_ship_date" timestamp with time zone,
	"supplier_delivery_date" timestamp with time zone,
	"supplier_install_date" timestamp with time zone,
	"supplier_acknowledged_at" timestamp with time zone,
	"supplier_reference" text,
	"supplier_notes" text,
	"exception_flag" boolean DEFAULT false NOT NULL,
	"exception_reason" text,
	"exception_notes" text,
	"entered_width" double precision,
	"entered_height" double precision,
	"entered_size_unit" text,
	"entered_width_mm" double precision,
	"entered_height_mm" double precision,
	"pricing_model" text,
	"pricing_unit" text,
	"billable_area_sqm" double precision,
	"billable_linear_m" double precision,
	"min_billable_size" double precision,
	"calculation_basis" text,
	"artwork_file_url" text,
	"artwork_required" boolean,
	"proof_required" boolean,
	"production_ready" boolean,
	"production_blocked_reason" text,
	"packed_width" double precision,
	"packed_height" double precision,
	"packed_depth" double precision,
	"packed_size_unit" text,
	"packed_width_mm" double precision,
	"packed_height_mm" double precision,
	"packed_depth_mm" double precision,
	"shipping_weight" double precision,
	"shipping_weight_unit" text,
	"shipping_weight_g" double precision,
	"carton_count" integer,
	"packing_mode" text,
	"crate_required" boolean DEFAULT false NOT NULL,
	"pallet_required" boolean DEFAULT false NOT NULL,
	"oversize_flag" boolean DEFAULT false NOT NULL,
	"freight_class" text,
	"install_kit_notes" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"partner_id" integer NOT NULL,
	"event_id" integer,
	"package_id" integer,
	"portal_type" text DEFAULT 'ordering' NOT NULL,
	"shipping_venue_id" integer,
	"assigned_supplier_id" integer,
	"fulfillment_mode" text,
	"status" text DEFAULT 'new' NOT NULL,
	"payment_status" text DEFAULT 'not_charged' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"company_name" text,
	"shipping_address_json" jsonb,
	"billing_address_json" jsonb,
	"artwork_files_json" jsonb,
	"total_estimate" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"currency_source" text DEFAULT 'partner' NOT NULL,
	"tax_mode" text DEFAULT 'none' NOT NULL,
	"tax_label" text,
	"tax_rate" numeric(5, 3),
	"tax_amount" numeric(12, 2),
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"tax_mode_source" text DEFAULT 'partner' NOT NULL,
	"subtotal" numeric(12, 2),
	"payment_model" text DEFAULT 'partner_billed' NOT NULL,
	"billing_entity" text,
	"supplier_estimated_cost" numeric(12, 2),
	"supplier_final_cost" numeric(12, 2),
	"expected_commission" numeric(12, 2),
	"paid_commission" numeric(12, 2),
	"commission_paid_date" text,
	"commission_paid_through" text,
	"commission_status" text DEFAULT 'not_started' NOT NULL,
	"supplier_payable_status" text DEFAULT 'not_started' NOT NULL,
	"payout_status" text DEFAULT 'pending' NOT NULL,
	"reconciliation_status" text DEFAULT 'not_started' NOT NULL,
	"reconciliation_notes" text,
	"finance_notes" text,
	"billing_exec_model" text,
	"billing_exec_model_source" text,
	"invoice_required" boolean DEFAULT true NOT NULL,
	"internal_billing_owner_user_id" text,
	"billing_reference_number" text,
	"external_invoice_ref" text,
	"payment_link_placeholder" text,
	"billing_notes" text,
	"billing_contact_json" jsonb,
	"notes" text,
	"internal_notes" text,
	"vendor_notes" text,
	"fulfillment_status" text,
	"exception_state" text DEFAULT 'none' NOT NULL,
	"exception_type" text,
	"exception_message" text,
	"exception_updated_at" timestamp with time zone,
	"exception_updated_by" text,
	"artwork_needed_flag" boolean DEFAULT false NOT NULL,
	"artwork_brief" text,
	"artwork_contact_name" text,
	"artwork_contact_email" text,
	"ship_date_target" timestamp with time zone,
	"delivery_by_date" timestamp with time zone,
	"package_count" integer,
	"total_shipment_weight" double precision,
	"total_shipment_weight_unit" text,
	"total_shipment_weight_g" double precision,
	"measurement_system" text,
	"oversize_flag" boolean DEFAULT false NOT NULL,
	"crate_required" boolean DEFAULT false NOT NULL,
	"pallet_required" boolean DEFAULT false NOT NULL,
	"shipping_contact_json" jsonb,
	"receiving_contact_json" jsonb,
	"customs_notes" text,
	"international_shipping_notes" text,
	"logistics_notes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "supplier_assignment_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"from_supplier_id" integer,
	"to_supplier_id" integer,
	"source" text NOT NULL,
	"changed_by_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by_user_id" text,
	"changed_by_role" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"full_name" text,
	"role" text NOT NULL,
	"partner_id" integer,
	"supplier_id" integer,
	"permissions_json" text,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"label" text NOT NULL,
	"full_name" text,
	"company" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'USA' NOT NULL,
	"phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"label" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_onboarding_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"website_url" text,
	"industry_focus" text,
	"partner_type" text,
	"portal_mode" text,
	"has_tours" text,
	"intro_headline" text,
	"intro_text" text,
	"thank_you_text" text,
	"brand_colors" text,
	"logo_url" text,
	"secondary_logo_url" text,
	"brand_assets_json" jsonb,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"contact_role" text,
	"billing_contact_name" text,
	"billing_email" text,
	"billing_phone" text,
	"billing_address" text,
	"tax_id" text,
	"payment_terms" text,
	"billing_notes" text,
	"what_we_need" text,
	"timeline" text,
	"budget_range" text,
	"reference_urls" text,
	"status" text DEFAULT 'new' NOT NULL,
	"internal_notes" text,
	"reviewed_at" timestamp with time zone,
	"converted_partner_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"paid_date" text,
	"paid_through" text,
	"reference" text,
	"notes" text,
	"recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text,
	"notes" text,
	"expected_amount" numeric(12, 2),
	"actual_amount" numeric(12, 2),
	"variance_amount" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"assigned_to_user_id" text,
	"resolution_notes" text,
	"auto_flagged" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_date" text,
	"method" text,
	"reference" text,
	"received_by_user_id" text,
	"is_deposit" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"internal_reference" text,
	"public_token" text NOT NULL,
	"order_id" integer NOT NULL,
	"partner_id" integer NOT NULL,
	"event_id" integer,
	"billing_exec_model" text NOT NULL,
	"billing_entity" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"issue_date" text,
	"due_date" text,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"tax_mode" text DEFAULT 'none' NOT NULL,
	"tax_label" text,
	"tax_rate" numeric(5, 3),
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"balance_due" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deposit_amount" numeric(12, 2),
	"deposit_paid" boolean DEFAULT false NOT NULL,
	"payment_instructions" text,
	"external_invoice_ref" text,
	"payment_link_placeholder" text,
	"billing_contact_json" jsonb,
	"line_items_json" jsonb,
	"notes" text,
	"internal_billing_owner_user_id" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "asset_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer,
	"order_id" integer,
	"order_item_id" integer,
	"event_type" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"actor_user_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"role" text,
	"is_required_for" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text,
	"mime_type" text,
	"file_size" bigint,
	"category" text DEFAULT 'client_artwork' NOT NULL,
	"visibility" text DEFAULT 'internal_only' NOT NULL,
	"owner_type" text,
	"owner_id" integer,
	"partner_id" integer,
	"event_id" integer,
	"order_id" integer,
	"product_id" integer,
	"package_id" integer,
	"branding_zone_id" integer,
	"supplier_id" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"parent_asset_id" integer,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"released_to_vendor_at" timestamp with time zone,
	"production_ready" boolean DEFAULT false NOT NULL,
	"uploaded_by_user_id" text,
	"notes" text,
	"tags_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"linked_object_type" text,
	"linked_object_id" integer,
	"partner_id" integer,
	"event_id" integer,
	"order_id" integer,
	"supplier_id" integer,
	"invoice_id" integer,
	"asset_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolved_by_user_id" text,
	"auto_created" boolean DEFAULT false NOT NULL,
	"source_rule_id" integer,
	"dedupe_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"summary" text NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb,
	"is_automated" boolean DEFAULT true NOT NULL,
	"actor_user_id" text,
	"source_rule_id" integer,
	"object_type" text,
	"object_id" integer,
	"partner_id" integer,
	"event_id" integer,
	"order_id" integer,
	"supplier_id" integer,
	"invoice_id" integer,
	"asset_id" integer,
	"override_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text NOT NULL,
	"object_type" text,
	"conditions_json" jsonb DEFAULT '{}'::jsonb,
	"actions_json" jsonb DEFAULT '[]'::jsonb,
	"priority" text DEFAULT 'medium' NOT NULL,
	"escalation_level" text DEFAULT 'none' NOT NULL,
	"portal_types" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"escalation_level" text DEFAULT 'none' NOT NULL,
	"deadline_health" text,
	"owner_user_id" text,
	"due_date" timestamp,
	"linked_object_type" text,
	"linked_object_id" integer,
	"partner_id" integer,
	"event_id" integer,
	"order_id" integer,
	"order_item_id" integer,
	"supplier_id" integer,
	"invoice_id" integer,
	"asset_id" integer,
	"notes" text,
	"auto_created" boolean DEFAULT false NOT NULL,
	"source_rule_id" integer,
	"dedupe_key" text,
	"completed_at" timestamp,
	"completed_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"flow" text NOT NULL,
	"step_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"partner_id" integer,
	"data_json" jsonb,
	"completed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"submitter_user_id" text,
	"submitter_role" text,
	"partner_id" integer,
	"screen_path" text,
	"category" text DEFAULT 'other' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"tags" text[],
	"assigned_to_user_id" text,
	"internal_notes" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"partner_id" integer,
	"user_id" text,
	"role" text,
	"object_type" text,
	"object_id" integer,
	"meta" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"renewal_date" timestamp with time zone,
	"billing_contact" text,
	"contract_notes" text,
	"invoice_status" text DEFAULT 'not_billed' NOT NULL,
	"last_invoiced_at" timestamp with time zone,
	"next_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_usage_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"limit_key" text NOT NULL,
	"allowance" integer,
	"current_usage" integer DEFAULT 0 NOT NULL,
	"hard_limit" boolean DEFAULT false NOT NULL,
	"warning_threshold_pct" integer DEFAULT 80 NOT NULL,
	"last_computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activation_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branding_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level" text DEFAULT 'basic' NOT NULL,
	"allows_custom_logo" boolean DEFAULT true NOT NULL,
	"allows_custom_colors" boolean DEFAULT true NOT NULL,
	"allows_custom_domain" boolean DEFAULT false NOT NULL,
	"allows_custom_emails" boolean DEFAULT false NOT NULL,
	"allows_custom_invoice_branding" boolean DEFAULT false NOT NULL,
	"hides_powered_by" boolean DEFAULT false NOT NULL,
	"default_branding_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"account_type" text DEFAULT 'managed' NOT NULL,
	"parent_account_id" integer,
	"plan_id" integer,
	"branding_package_id" integer,
	"white_label_level" text DEFAULT 'none' NOT NULL,
	"branding_json" jsonb DEFAULT '{}'::jsonb,
	"commercial_status" text DEFAULT 'trial' NOT NULL,
	"start_date" timestamp with time zone,
	"renewal_date" timestamp with time zone,
	"contract_term" text,
	"seat_allowance" integer,
	"portal_instance_allowance" integer,
	"billing_entity_name" text,
	"billing_contact_name" text,
	"billing_contact_email" text,
	"account_manager" text,
	"internal_revenue_owner" text,
	"monetization_notes" text,
	"activation_status" text DEFAULT 'lead' NOT NULL,
	"demo_ready" boolean DEFAULT false NOT NULL,
	"unit_preference" text,
	"sales_notes" text,
	"last_demo_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_accounts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "commercial_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'starter' NOT NULL,
	"pricing_model" text DEFAULT 'flat_monthly' NOT NULL,
	"price_amount" numeric(12, 2),
	"setup_fee" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"included_limits_json" jsonb DEFAULT '{}'::jsonb,
	"feature_flags_json" jsonb DEFAULT '{}'::jsonb,
	"addon_pricing_json" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"prospect_facing_description" text,
	"internal_margin_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"prospect_name" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"recommended_plan_id" integer,
	"compared_plan_ids" jsonb DEFAULT '[]'::jsonb,
	"packaging_notes" text,
	"internal_notes" text,
	"prospect_facing_notes" text,
	"created_by" text,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_followups" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"prospect_name" text,
	"demo_at" timestamp with time zone,
	"outcome" text,
	"status" text DEFAULT 'demo_completed' NOT NULL,
	"interest_areas" jsonb DEFAULT '[]'::jsonb,
	"objections_summary" text,
	"recommended_plan_id" integer,
	"white_label_interest" text DEFAULT 'none',
	"activation_readiness" text DEFAULT 'unknown',
	"next_step" text,
	"priority_features" jsonb DEFAULT '[]'::jsonb,
	"internal_notes" text,
	"logged_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faq_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"audience" text DEFAULT 'internal' NOT NULL,
	"category" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objections" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"proposal_id" integer,
	"scenario_key" text,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'raised' NOT NULL,
	"recommended_response" text,
	"internal_notes" text,
	"tags_json" jsonb DEFAULT '[]'::jsonb,
	"raised_by" text,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_customer_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"partner_id" integer,
	"customer_email" text NOT NULL,
	"customer_name" text,
	"assigned_by_user_id" text,
	"access_status" text DEFAULT 'available' NOT NULL,
	"signed_url_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer,
	"request_id" integer,
	"assignment_id" integer,
	"partner_id" integer,
	"customer_email" text,
	"customer_name" text,
	"event_type" text NOT NULL,
	"event_metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"performed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'other' NOT NULL,
	"document_type" text NOT NULL,
	"visibility_level" text DEFAULT 'internal_only' NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_mime_type" text NOT NULL,
	"file_size_bytes" bigint DEFAULT 0 NOT NULL,
	"version_label" text,
	"expiration_date" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_customer_downloadable" boolean DEFAULT false NOT NULL,
	"requires_admin_approval" boolean DEFAULT true NOT NULL,
	"auto_send_when_requested" boolean DEFAULT false NOT NULL,
	"internal_notes" text,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_company" text,
	"requested_document_types" jsonb,
	"request_message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"external_asset_id" text NOT NULL,
	"external_survey_id" text,
	"source_app" text DEFAULT 'venue_asset_survey' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"venue_name" text,
	"city_name" text,
	"public_photo_url" text,
	"public_photos_json" jsonb,
	"width_in" double precision,
	"height_in" double precision,
	"depth_in" double precision,
	"diameter_in" double precision,
	"area_sqft" double precision,
	"shape" text,
	"measurement_unit" text,
	"orientation" text,
	"surface_material" text,
	"environment" text,
	"zone_name" text,
	"primary_applications_json" jsonb,
	"recommended_applications_json" jsonb,
	"alternate_applications_json" jsonb,
	"public_use_case" text,
	"visibility_tier" text,
	"public_status" text,
	"public_deck_include" boolean DEFAULT true NOT NULL,
	"portal_visible" boolean DEFAULT true NOT NULL,
	"netsuite_include" boolean DEFAULT false NOT NULL,
	"design_needed" boolean DEFAULT false NOT NULL,
	"commission_eligible" boolean DEFAULT false NOT NULL,
	"ops_owner" text,
	"approved_materials_json" jsonb,
	"custom_approved_materials_json" jsonb,
	"material_override_mode" text DEFAULT 'per_item' NOT NULL,
	"internal_notes" text,
	"install_notes" text,
	"production_notes" text,
	"internal_photos_json" jsonb,
	"netsuite_asset_number" text,
	"netsuite_venue_number" text,
	"netsuite_item_name" text,
	"netsuite_item_category" text,
	"internal_pricing_notes" text,
	"cost_center" text,
	"surveyor_name" text,
	"surveyed_at" timestamp with time zone,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"rejected_reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"raw_payload_json" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"integration_type" text NOT NULL,
	"webhook_secret" text,
	"api_base_url" text,
	"api_key_secret_name" text,
	"external_partner_id" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"last_webhook_at" timestamp with time zone,
	"last_pull_at" timestamp with time zone,
	"last_pull_status" text,
	"last_pull_error" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approved_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_materials_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sales_reps" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'sales_rep' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notification_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"parent_company" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"website" text,
	"industry" text,
	"owner_rep_id" integer,
	"status" text DEFAULT 'prospect' NOT NULL,
	"notes" text,
	"uploads_json" jsonb,
	"last_contact_date" date,
	"next_follow_up_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_intake_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_type" text NOT NULL,
	"link_source" text,
	"company_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"payload_json" jsonb NOT NULL,
	"matched_account_id" integer,
	"assigned_rep_id" integer,
	"routing_method" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"assigned_rep_id" integer,
	"matched_account_id" integer,
	"intake_submission_id" integer,
	"project_type" text,
	"estimated_value" numeric(12, 2),
	"stage" text DEFAULT 'new_intake' NOT NULL,
	"quote_needed_by" date,
	"event_date" date,
	"install_date" date,
	"removal_date" date,
	"files_json" jsonb,
	"notes" text,
	"source" text,
	"routing_method" text,
	"lost_reason" text,
	"competitor_name" text,
	"competitor_price" numeric(12, 2),
	"a3_price" numeric(12, 2),
	"lost_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_opportunity_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer NOT NULL,
	"author_rep_id" integer,
	"author_name" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"category" text NOT NULL,
	"product_type" text,
	"description" text,
	"file_url" text NOT NULL,
	"uploaded_by_rep_id" integer,
	"uploaded_by_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_facing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_assets" ADD CONSTRAINT "partner_assets_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_themes" ADD CONSTRAINT "partner_themes_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_email_recipients" ADD CONSTRAINT "partner_email_recipients_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_sections" ADD CONSTRAINT "partner_sections_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_branding_locations" ADD CONSTRAINT "partner_branding_locations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_branding_locations" ADD CONSTRAINT "partner_branding_locations_default_supplier_id_suppliers_id_fk" FOREIGN KEY ("default_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_product_overrides" ADD CONSTRAINT "partner_product_overrides_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_product_overrides" ADD CONSTRAINT "partner_product_overrides_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_addons" ADD CONSTRAINT "partner_addons_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_addons" ADD CONSTRAINT "partner_addons_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_addons" ADD CONSTRAINT "partner_addons_survey_asset_id_survey_assets_id_fk" FOREIGN KEY ("survey_asset_id") REFERENCES "public"."survey_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_hardware_product_id_product_catalog_id_fk" FOREIGN KEY ("hardware_product_id") REFERENCES "public"."product_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_members" ADD CONSTRAINT "product_family_members_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_members" ADD CONSTRAINT "product_family_members_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_uploads" ADD CONSTRAINT "request_uploads_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding_location_requests" ADD CONSTRAINT "branding_location_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding_location_requests" ADD CONSTRAINT "branding_location_requests_branding_location_id_partner_branding_locations_id_fk" FOREIGN KEY ("branding_location_id") REFERENCES "public"."partner_branding_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_extraction_claims" ADD CONSTRAINT "deck_extraction_claims_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_extraction_claims" ADD CONSTRAINT "deck_extraction_claims_extraction_id_deck_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."deck_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_extraction_items" ADD CONSTRAINT "deck_extraction_items_extraction_id_deck_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."deck_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_extraction_items" ADD CONSTRAINT "deck_extraction_items_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_extractions" ADD CONSTRAINT "deck_extractions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_extraction_claims" ADD CONSTRAINT "package_extraction_claims_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_extraction_claims" ADD CONSTRAINT "package_extraction_claims_extraction_id_package_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."package_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_extractions" ADD CONSTRAINT "package_extractions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_blackouts" ADD CONSTRAINT "inventory_blackouts_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_blackouts" ADD CONSTRAINT "inventory_blackouts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_branding_zone_id_partner_branding_locations_id_fk" FOREIGN KEY ("branding_zone_id") REFERENCES "public"."partner_branding_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_assigned_supplier_id_suppliers_id_fk" FOREIGN KEY ("assigned_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_venue_id_venues_id_fk" FOREIGN KEY ("shipping_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_supplier_id_suppliers_id_fk" FOREIGN KEY ("assigned_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_assignment_history" ADD CONSTRAINT "supplier_assignment_history_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_assignment_history" ADD CONSTRAINT "supplier_assignment_history_from_supplier_id_suppliers_id_fk" FOREIGN KEY ("from_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_assignment_history" ADD CONSTRAINT "supplier_assignment_history_to_supplier_id_suppliers_id_fk" FOREIGN KEY ("to_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_status_events" ADD CONSTRAINT "supplier_status_events_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_contacts" ADD CONSTRAINT "saved_contacts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_product_id_product_catalog_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_branding_zone_id_partner_branding_locations_id_fk" FOREIGN KEY ("branding_zone_id") REFERENCES "public"."partner_branding_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_alerts" ADD CONSTRAINT "workflow_alerts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_alerts" ADD CONSTRAINT "workflow_alerts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_alerts" ADD CONSTRAINT "workflow_alerts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_alerts" ADD CONSTRAINT "workflow_alerts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_alerts" ADD CONSTRAINT "workflow_alerts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_alerts" ADD CONSTRAINT "workflow_alerts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_alerts" ADD CONSTRAINT "workflow_alerts_source_rule_id_workflow_rules_id_fk" FOREIGN KEY ("source_rule_id") REFERENCES "public"."workflow_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_audit" ADD CONSTRAINT "workflow_audit_source_rule_id_workflow_rules_id_fk" FOREIGN KEY ("source_rule_id") REFERENCES "public"."workflow_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_source_rule_id_workflow_rules_id_fk" FOREIGN KEY ("source_rule_id") REFERENCES "public"."workflow_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_customer_assignments" ADD CONSTRAINT "document_customer_assignments_document_id_document_library_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_customer_assignments" ADD CONSTRAINT "document_customer_assignments_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_document_library_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document_library"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_request_id_document_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."document_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_assignment_id_document_customer_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."document_customer_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_assets" ADD CONSTRAINT "survey_assets_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_integrations" ADD CONSTRAINT "partner_integrations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_accounts" ADD CONSTRAINT "sales_accounts_owner_rep_id_sales_reps_id_fk" FOREIGN KEY ("owner_rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_intake_submissions" ADD CONSTRAINT "sales_intake_submissions_matched_account_id_sales_accounts_id_fk" FOREIGN KEY ("matched_account_id") REFERENCES "public"."sales_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_intake_submissions" ADD CONSTRAINT "sales_intake_submissions_assigned_rep_id_sales_reps_id_fk" FOREIGN KEY ("assigned_rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_assigned_rep_id_sales_reps_id_fk" FOREIGN KEY ("assigned_rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_matched_account_id_sales_accounts_id_fk" FOREIGN KEY ("matched_account_id") REFERENCES "public"."sales_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_intake_submission_id_sales_intake_submissions_id_fk" FOREIGN KEY ("intake_submission_id") REFERENCES "public"."sales_intake_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity_notes" ADD CONSTRAINT "sales_opportunity_notes_opportunity_id_sales_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity_notes" ADD CONSTRAINT "sales_opportunity_notes_author_rep_id_sales_reps_id_fk" FOREIGN KEY ("author_rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_templates" ADD CONSTRAINT "sales_templates_uploaded_by_rep_id_sales_reps_id_fk" FOREIGN KEY ("uploaded_by_rep_id") REFERENCES "public"."sales_reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_email_recipients_partner_idx" ON "partner_email_recipients" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_email_recipients_partner_role_idx" ON "partner_email_recipients" USING btree ("partner_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_contacts_one_primary_per_role" ON "partner_contacts" USING btree ("partner_id","role") WHERE "partner_contacts"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "partner_addons_partner_product_uq" ON "partner_addons" USING btree ("partner_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_addons_partner_survey_asset_uq" ON "partner_addons" USING btree ("partner_id","survey_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_families_slug_idx" ON "product_families" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "product_family_members_family_product_idx" ON "product_family_members" USING btree ("family_id","product_id");--> statement-breakpoint
CREATE INDEX "inventory_blackouts_inventory_date_idx" ON "inventory_blackouts" USING btree ("inventory_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "inventory_reservations_inventory_date_idx" ON "inventory_reservations" USING btree ("inventory_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_city_partner_product_idx" ON "inventory" USING btree ("city_id","partner_id","product_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_email_idx" ON "user_roles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "workflow_alerts_unresolved_idx" ON "workflow_alerts" USING btree ("is_resolved","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_alerts_dedupe_unique_idx" ON "workflow_alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "workflow_audit_object_idx" ON "workflow_audit" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "workflow_rules_trigger_idx" ON "workflow_rules" USING btree ("trigger_type","is_active");--> statement-breakpoint
CREATE INDEX "workflow_tasks_status_idx" ON "workflow_tasks" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "workflow_tasks_linked_idx" ON "workflow_tasks" USING btree ("linked_object_type","linked_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_tasks_dedupe_unique_idx" ON "workflow_tasks" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_progress_unique" ON "onboarding_progress" USING btree ("user_id","flow","step_key");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_partner_idx" ON "feedback_items" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "usage_events_type_idx" ON "usage_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "usage_events_partner_idx" ON "usage_events" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "usage_events_time_idx" ON "usage_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "doc_assign_document_idx" ON "document_customer_assignments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_assign_email_idx" ON "document_customer_assignments" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "doc_assign_partner_idx" ON "document_customer_assignments" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "doc_evt_type_idx" ON "document_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "doc_evt_document_idx" ON "document_events" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_evt_partner_idx" ON "document_events" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "doc_evt_time_idx" ON "document_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "doc_lib_category_idx" ON "document_library" USING btree ("category");--> statement-breakpoint
CREATE INDEX "doc_lib_type_idx" ON "document_library" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "doc_lib_visibility_idx" ON "document_library" USING btree ("visibility_level");--> statement-breakpoint
CREATE INDEX "doc_lib_active_idx" ON "document_library" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "doc_req_status_idx" ON "document_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doc_req_email_idx" ON "document_requests" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "doc_req_partner_idx" ON "document_requests" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_assets_partner_external_uq" ON "survey_assets" USING btree ("partner_id","external_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_integrations_partner_type_uq" ON "partner_integrations" USING btree ("partner_id","integration_type");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_reps_email_idx" ON "sales_reps" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sales_accounts_normalized_name_idx" ON "sales_accounts" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "sales_accounts_owner_idx" ON "sales_accounts" USING btree ("owner_rep_id");--> statement-breakpoint
CREATE INDEX "sales_intake_assigned_idx" ON "sales_intake_submissions" USING btree ("assigned_rep_id");--> statement-breakpoint
CREATE INDEX "sales_intake_created_idx" ON "sales_intake_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_opportunities_assigned_idx" ON "sales_opportunities" USING btree ("assigned_rep_id");--> statement-breakpoint
CREATE INDEX "sales_opportunities_stage_idx" ON "sales_opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "sales_opportunity_notes_opportunity_idx" ON "sales_opportunity_notes" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "sales_templates_category_idx" ON "sales_templates" USING btree ("category");