CREATE TABLE `clubhouses` (
 `id` text PRIMARY KEY NOT NULL,
 `code` text NOT NULL UNIQUE,
 `data` text NOT NULL,
 `revision` integer DEFAULT 0 NOT NULL
);
