CREATE TABLE `batch_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`food_id` text,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`grams` real NOT NULL,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`position` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `batch_ingredients_batch_id_position_idx` ON `batch_ingredients` (`batch_id`,`position`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text,
	`name` text NOT NULL,
	`cooked_on` text NOT NULL,
	`portions` real NOT NULL,
	`cooked_weight_g` real,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`finished_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "batches_portions_positive" CHECK("batches"."portions" > 0),
	CONSTRAINT "batches_cooked_weight_positive" CHECK("batches"."cooked_weight_g" IS NULL OR "batches"."cooked_weight_g" > 0)
);
--> statement-breakpoint
CREATE INDEX `batches_finished_at_idx` ON `batches` (`finished_at`);--> statement-breakpoint
CREATE TABLE `containers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tare_g` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "containers_tare_positive" CHECK("containers"."tare_g" > 0)
);
--> statement-breakpoint
-- Hand edited: drizzle-kit wrote `PRAGMA foreign_keys=OFF` here and `=ON` after the rename. D1 runs a migration in
-- one transaction, where SQLite ignores `foreign_keys`, so keys stay enforced. Deferring the checks to the commit
-- is what D1 supports. Nothing references log_entries, so the drop and rename break no key; every row is copied.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_log_entries` (
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
	`deleted_at` text,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_log_entries`("id", "date", "logged_at", "kind", "food_id", "batch_id", "amount", "unit", "grams", "label", "kcal", "protein", "carbs", "fat", "fiber", "deleted_at") SELECT "id", "date", "logged_at", "kind", "food_id", "batch_id", "amount", "unit", "grams", "label", "kcal", "protein", "carbs", "fat", "fiber", "deleted_at" FROM `log_entries`;--> statement-breakpoint
DROP TABLE `log_entries`;--> statement-breakpoint
ALTER TABLE `__new_log_entries` RENAME TO `log_entries`;--> statement-breakpoint
CREATE INDEX `log_entries_date_idx` ON `log_entries` (`date`);--> statement-breakpoint
CREATE INDEX `log_entries_food_id_logged_at_idx` ON `log_entries` (`food_id`,`logged_at`);--> statement-breakpoint
CREATE INDEX `log_entries_batch_id_idx` ON `log_entries` (`batch_id`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_food_id_idx` ON `recipe_ingredients` (`food_id`);