CREATE TABLE `exchange_config` (
	`id` text PRIMARY KEY NOT NULL,
	`exchange` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`api_key_enc` text,
	`api_secret_enc` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_config` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text NOT NULL,
	`model_id` text NOT NULL,
	`api_key_enc` text DEFAULT '' NOT NULL,
	`temperature` real DEFAULT 0.2 NOT NULL,
	`max_output_tokens` integer DEFAULT 4096 NOT NULL,
	`timeout_ms` integer DEFAULT 60000 NOT NULL,
	`supports_tools` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol_id` text NOT NULL,
	`exchange` text NOT NULL,
	`market_type` text NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`raw_symbol` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_item_symbol_id_uidx` ON `watchlist_item` (`symbol_id`);
--> statement-breakpoint
CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
