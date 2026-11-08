CREATE TABLE `weekly_targets` (
	`week_start` text PRIMARY KEY NOT NULL,
	`tdee_formula` real NOT NULL,
	`tdee_adaptive` real,
	`tdee_used` real NOT NULL,
	`target_kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`carbs_floored` integer NOT NULL,
	`trend_kg` real NOT NULL,
	`rate_kg_per_week` real,
	`valid_days` integer NOT NULL,
	`weigh_ins` integer NOT NULL,
	`computed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "weekly_targets_week_start_monday" CHECK(date("weekly_targets"."week_start") IS "weekly_targets"."week_start" AND strftime('%w', "weekly_targets"."week_start") = '1')
);
--> statement-breakpoint
-- Hand edited: drizzle-kit wrote `PRAGMA foreign_keys=OFF` here and `=ON` after the rename. D1 runs a migration in
-- one transaction, where SQLite ignores `foreign_keys`, so keys stay enforced. Deferring the checks to the commit
-- is what D1 supports. Nothing references settings, so the drop and rename break no key.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`timezone` text DEFAULT 'Europe/Zurich' NOT NULL,
	`sex` text,
	`birth_date` text,
	`height_cm` real,
	`activity_level` text,
	`goal_rate_pct` real DEFAULT 0.35 NOT NULL,
	`protein_g_per_kg` real DEFAULT 1.8 NOT NULL,
	`fat_pct` real DEFAULT 0.25 NOT NULL,
	`energy_density_kcal_per_kg` real DEFAULT 5000 NOT NULL,
	CONSTRAINT "settings_single_row" CHECK("id" = 1),
	CONSTRAINT "settings_sex" CHECK("sex" IS NULL OR "sex" IN ('male', 'female')),
	CONSTRAINT "settings_activity_level" CHECK("activity_level" IS NULL OR "activity_level" IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "settings_height_cm_range" CHECK("height_cm" IS NULL OR "height_cm" BETWEEN 100 AND 250),
	CONSTRAINT "settings_goal_rate" CHECK("goal_rate_pct" IN (0.25, 0.35, 0.5)),
	CONSTRAINT "settings_protein_g_per_kg_range" CHECK("protein_g_per_kg" BETWEEN 1.2 AND 3),
	CONSTRAINT "settings_fat_pct_range" CHECK("fat_pct" BETWEEN 0.15 AND 0.4),
	CONSTRAINT "settings_energy_density_range" CHECK("energy_density_kcal_per_kg" BETWEEN 3000 AND 7700)
);
--> statement-breakpoint
-- Hand edited: drizzle-kit copied every new column from the old table, where SQLite reads the unknown double quoted
-- names as text ('sex' into sex). Only id and timezone exist before; the rest take their defaults, and the manual
-- target columns are dropped.
INSERT INTO `__new_settings`("id", "timezone") SELECT "id", "timezone" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;