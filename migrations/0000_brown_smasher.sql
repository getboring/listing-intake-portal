CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`intake_id` text NOT NULL,
	`item_key` text NOT NULL,
	`label` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`satisfied_at` integer
);
--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`email` text,
	`phone` text,
	`relation_type` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`primary_contact_user_id` text,
	`client_type` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`intake_id` text,
	`property_id` text,
	`client_id` text,
	`uploaded_by_user_id` text,
	`document_type` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_size_bytes` blob,
	`checksum_sha256` text,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`extracted_json` text,
	`reso_media_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_user_id` text,
	`actor_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listing_intake_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`intake_id` text NOT NULL,
	`section_key` text NOT NULL,
	`status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`payload_json` text NOT NULL,
	`validation_json` text,
	`completed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listing_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`property_id` text NOT NULL,
	`client_id` text NOT NULL,
	`assigned_agent_id` text,
	`assigned_coordinator_id` text,
	`intake_number` text NOT NULL,
	`status` text NOT NULL,
	`current_stage` text NOT NULL,
	`completion_percent` real DEFAULT 0 NOT NULL,
	`readiness_score` real DEFAULT 0 NOT NULL,
	`target_list_date` text,
	`list_price` integer,
	`standard_status` text,
	`listing_contract_date` text,
	`modification_timestamp` integer,
	`originating_system_name` text DEFAULT 'listing-intake-portal',
	`originating_system_key` text,
	`seller_motivation` text,
	`source` text,
	`metadata_json` text,
	`submitted_at` integer,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`intake_id` text,
	`conversation_id` text,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`provider_message_id` text,
	`from_value` text,
	`to_value` text,
	`subject` text,
	`body_text` text,
	`delivery_status` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`street_1` text NOT NULL,
	`street_2` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`county` text,
	`parcel_number` text,
	`latitude` real,
	`longitude` real,
	`universal_property_identifier` text,
	`street_number` text,
	`street_name` text,
	`street_dir_prefix` text,
	`street_dir_suffix` text,
	`street_additional_info` text,
	`state_or_province` text,
	`county_or_parish` text,
	`country` text DEFAULT 'US',
	`property_sub_type` text,
	`property_type` text,
	`occupancy_status` text,
	`year_built` integer,
	`lot_size_area` real,
	`living_area` real,
	`lot_size_units` text DEFAULT 'Square Feet',
	`living_area_units` text DEFAULT 'Square Feet',
	`bedrooms_total` integer,
	`bathrooms_total_integer` integer,
	`public_record_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`intake_id` text NOT NULL,
	`property_id` text NOT NULL,
	`assigned_to_user_id` text,
	`task_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`role` text NOT NULL,
	`email` text,
	`phone` text,
	`first_name` text,
	`last_name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checklist_items_intake_id_idx` ON `checklist_items` (`intake_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_items_intake_id_item_key_unique` ON `checklist_items` (`intake_id`,`item_key`);--> statement-breakpoint
CREATE INDEX `client_contacts_client_id_idx` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE INDEX `clients_org_id_idx` ON `clients` (`org_id`);--> statement-breakpoint
CREATE INDEX `documents_org_id_idx` ON `documents` (`org_id`);--> statement-breakpoint
CREATE INDEX `documents_intake_id_idx` ON `documents` (`intake_id`);--> statement-breakpoint
CREATE INDEX `documents_property_id_idx` ON `documents` (`property_id`);--> statement-breakpoint
CREATE INDEX `documents_client_id_idx` ON `documents` (`client_id`);--> statement-breakpoint
CREATE INDEX `events_org_id_idx` ON `events` (`org_id`);--> statement-breakpoint
CREATE INDEX `events_aggregate_id_idx` ON `events` (`aggregate_id`);--> statement-breakpoint
CREATE INDEX `listing_intake_sections_intake_id_idx` ON `listing_intake_sections` (`intake_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `listing_intake_sections_intake_id_section_key_unique` ON `listing_intake_sections` (`intake_id`,`section_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `listing_intakes_intake_number_unique` ON `listing_intakes` (`intake_number`);--> statement-breakpoint
CREATE INDEX `listing_intakes_org_id_idx` ON `listing_intakes` (`org_id`);--> statement-breakpoint
CREATE INDEX `listing_intakes_property_id_idx` ON `listing_intakes` (`property_id`);--> statement-breakpoint
CREATE INDEX `listing_intakes_client_id_idx` ON `listing_intakes` (`client_id`);--> statement-breakpoint
CREATE INDEX `messages_org_id_idx` ON `messages` (`org_id`);--> statement-breakpoint
CREATE INDEX `messages_intake_id_idx` ON `messages` (`intake_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `properties_org_id_idx` ON `properties` (`org_id`);--> statement-breakpoint
CREATE INDEX `tasks_org_id_idx` ON `tasks` (`org_id`);--> statement-breakpoint
CREATE INDEX `tasks_intake_id_idx` ON `tasks` (`intake_id`);--> statement-breakpoint
CREATE INDEX `tasks_property_id_idx` ON `tasks` (`property_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_org_id_idx` ON `users` (`org_id`);