ALTER TABLE `rounds` ADD `fingerprint` text;--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_fingerprint_unique` ON `rounds` (`fingerprint`);