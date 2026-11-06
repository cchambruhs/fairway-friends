import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const rounds=sqliteTable('rounds',{id:text('id').primaryKey(),data:text('data').notNull(),fingerprint:text('fingerprint').unique()});
export const players=sqliteTable('players',{username:text('username').primaryKey(),data:text('data').notNull()});

export const importLimits=sqliteTable('import_limits',{id:text('id').primaryKey(),hits:integer('hits').notNull(),expires:integer('expires').notNull()});

export const playerGear=sqliteTable('player_gear',{username:text('username').primaryKey(),claimant:text('claimant').unique(),data:text('data').notNull(),updatedAt:text('updated_at').notNull()});
export const leagues=sqliteTable('leagues',{id:text('id').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const playerPhotos=sqliteTable('player_photos',{username:text('username').primaryKey(),objectKey:text('object_key').notNull(),contentType:text('content_type').notNull(),updatedAt:text('updated_at').notNull()});
export const seedRuns=sqliteTable('seed_runs',{version:text('version').primaryKey()});
export const clubhouses=sqliteTable('clubhouses',{id:text('id').primaryKey(),code:text('code').notNull().unique(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
