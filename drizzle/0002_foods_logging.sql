CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`nutrition_basis` text DEFAULT 'g' NOT NULL,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`serving_g` real,
	`source_ref` text,
	`search_text` text NOT NULL,
	`fetched_at` text,
	`edited_at` text,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foods_barcode_unique` ON `foods` (`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `foods_source_source_ref_unique` ON `foods` (`source`,`source_ref`);--> statement-breakpoint
CREATE INDEX `foods_search_text_idx` ON `foods` (`search_text`);--> statement-breakpoint
CREATE TABLE `log_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`logged_at` text NOT NULL,
	`kind` text NOT NULL,
	`food_id` text,
	`batch_id` text,
	`amount` real,
	`unit` text,
	`grams` real,
	`label` text,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `log_entries_date_idx` ON `log_entries` (`date`);--> statement-breakpoint
CREATE INDEX `log_entries_food_id_logged_at_idx` ON `log_entries` (`food_id`,`logged_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`timezone` text DEFAULT 'Europe/Zurich' NOT NULL,
	`manual_target_kcal` real,
	`manual_weight_kg` real,
	CONSTRAINT "settings_single_row" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_manual_target_pair" CHECK(("settings"."manual_target_kcal" IS NULL) = ("settings"."manual_weight_kg" IS NULL))
);
