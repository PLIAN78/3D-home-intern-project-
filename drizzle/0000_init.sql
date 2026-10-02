CREATE TABLE `catalog_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`page_url` text,
	`price_from` integer,
	`sqft` text,
	`bedrooms` text,
	`bathrooms` text,
	`parking` text,
	`image_url` text,
	`sort` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `catalog_communities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `catalog_collections_key_idx` ON `catalog_collections` (`community_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `catalog_communities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`city` text NOT NULL,
	`page_url` text NOT NULL,
	`site_plan_pdf` text,
	`blurb` text NOT NULL,
	`description` text,
	`hero_url` text,
	`logo_url` text,
	`sales_centre` text,
	`collection_names` text NOT NULL,
	`sort` integer NOT NULL,
	`scraped_at` text
);
--> statement-breakpoint
CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`region` text,
	`url` text,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `community_imports_community_idx` ON `community_imports` (`community_id`);--> statement-breakpoint
CREATE TABLE `drawings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drawings_project_idx` ON `drawings` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `home_designs` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`model_home` integer NOT NULL,
	`sold_out` integer NOT NULL,
	`sqft` integer,
	`sqft_note` text,
	`bedrooms` text,
	`bathrooms` text,
	`parking` text,
	`floorplan_pdf` text,
	`feature_sheet_pdf` text,
	`brochure_pdf` text,
	`virtual_tour_url` text,
	`page_url` text NOT NULL,
	`sort` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `catalog_communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `catalog_collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `home_designs_collection_idx` ON `home_designs` (`collection_id`);--> statement-breakpoint
CREATE TABLE `house_models` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lot_progress` (
	`community_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`stage` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`community_id`, `lot_id`)
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`community_id` text NOT NULL,
	`id` text NOT NULL,
	`number` text NOT NULL,
	`status` text,
	`collection` text,
	`lat` real,
	`lng` real,
	`sort` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`community_id`, `id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lots_collection_idx` ON `lots` (`community_id`,`collection`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` text NOT NULL,
	`collection_id` text,
	`design_id` text,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`caption` text,
	`link_url` text,
	`source_url` text NOT NULL,
	`sort` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `catalog_communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `catalog_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`design_id`) REFERENCES `home_designs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_community_design_url_uq` ON `photos` (`community_id`,`design_id`,`url`);--> statement-breakpoint
CREATE INDEX `photos_design_idx` ON `photos` (`design_id`);--> statement-breakpoint
CREATE INDEX `photos_collection_idx` ON `photos` (`collection_id`);--> statement-breakpoint
CREATE TABLE `plan_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_sets_project_idx` ON `plan_sets` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`community_id` text NOT NULL,
	`community_name` text NOT NULL,
	`lot_id` text NOT NULL,
	`lot_number` text NOT NULL,
	`model_name` text NOT NULL,
	`floor_count` integer NOT NULL,
	`house_model_id` text NOT NULL,
	`plan_set_id` text,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_uq` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_community_idx` ON `projects` (`community_id`,`lot_id`);