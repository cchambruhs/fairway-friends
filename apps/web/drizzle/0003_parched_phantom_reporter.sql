CREATE TABLE `player_gear` (
	`username` text PRIMARY KEY NOT NULL,
	`claimant` text,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_gear_claimant_unique` ON `player_gear` (`claimant`);