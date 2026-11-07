CREATE TABLE `weights` (
	`date` text PRIMARY KEY NOT NULL,
	`kg` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "weights_kg_range" CHECK("weights"."kg" BETWEEN 20 AND 400)
);
