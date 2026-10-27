-- Spaces for everything that already exists, and a solo space for every
-- account from now on. See docs/spaces.md.
--
-- Custom (`drizzle-kit generate --custom`) because none of this is schema:
-- drizzle-kit made the tables in 0048 and cannot infer the rows that belong
-- in them. Nothing here rebuilds or drops anything.
--
-- An id is a v4 UUID made in SQL, the same shape as `crypto.randomUUID()`:
-- sixteen random bytes, with the version and variant nibbles set.

-- A trigger rather than a Better Auth hook, for the reason the first-account
-- admin is one (0018): it holds however the row gets here — sign-up, a test
-- fixture, the e2e suite's accounts, a raw `wrangler d1 execute`. The member
-- row finds its space by `last_insert_rowid()`, which inside a trigger is the
-- row the trigger itself just inserted.
CREATE TRIGGER `user_has_solo_space`
AFTER INSERT ON `user`
BEGIN
	INSERT INTO `spaces` (`id`, `kind`)
	VALUES (
		lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
		'solo'
	);
	INSERT INTO `space_members` (`id`, `space_id`, `user_id`, `can_manage`)
	SELECT
		lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
		`id`, NEW.`id`, 1
	FROM `spaces` WHERE `rowid` = last_insert_rowid();
END;
--> statement-breakpoint
-- One shared space per partnership, under the partnership's own id, so every
-- `partnership_id` already stored is the id of its space. Pending invites
-- included: the inviter is a member from the moment they invite.
INSERT INTO `spaces` (`id`, `kind`, `created_at`, `updated_at`)
SELECT `id`, 'shared', `created_at`, `created_at` FROM `partnerships`;
--> statement-breakpoint
-- `can_manage` says per member what `control` says per role.
INSERT INTO `space_members` (`id`, `space_id`, `user_id`, `can_manage`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`id`, `inviter_id`, `control` IN ('inviter', 'both'), `created_at`, `created_at`
FROM `partnerships`;
--> statement-breakpoint
INSERT INTO `space_members` (`id`, `space_id`, `user_id`, `can_manage`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`id`, `invitee_id`, `control` IN ('invitee', 'both'), coalesce(`accepted_at`, `created_at`), coalesce(`accepted_at`, `created_at`)
FROM `partnerships` WHERE `invitee_id` IS NOT NULL;
--> statement-breakpoint
-- A solo space for every account that existed before the trigger. A set of
-- inserts has no `last_insert_rowid()` per row, and a scratch table would
-- have to be dropped again, which migrations.test.ts refuses — so each user
-- is paired with the space made for them by position: the spaces are
-- inserted in user id order, are the only solo spaces there are, and so
-- take rowids in that order.
INSERT INTO `spaces` (`id`, `kind`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	'solo', `created_at`, `created_at`
FROM `user` ORDER BY `id`;
--> statement-breakpoint
INSERT INTO `space_members` (`id`, `space_id`, `user_id`, `can_manage`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`s`.`id`, `u`.`id`, 1, `u`.`created_at`, `u`.`created_at`
FROM (SELECT `id`, row_number() OVER (ORDER BY `rowid`) AS `n` FROM `spaces` WHERE `kind` = 'solo') AS `s`
JOIN (SELECT `id`, `created_at`, row_number() OVER (ORDER BY `id`) AS `n` FROM `user`) AS `u` ON `u`.`n` = `s`.`n`;
--> statement-breakpoint
-- Then every scoped row learns its space: a partnership's rows the
-- partnership's, a person's own rows their solo space.
UPDATE `vaults` SET `space_id` = coalesce(`partnership_id`, (
	SELECT `m`.`space_id` FROM `space_members` AS `m` JOIN `spaces` AS `s` ON `s`.`id` = `m`.`space_id`
	WHERE `s`.`kind` = 'solo' AND `m`.`user_id` = `vaults`.`owner_user_id`
));
--> statement-breakpoint
UPDATE `notebook_entries` SET `space_id` = coalesce(`partnership_id`, (
	SELECT `m`.`space_id` FROM `space_members` AS `m` JOIN `spaces` AS `s` ON `s`.`id` = `m`.`space_id`
	WHERE `s`.`kind` = 'solo' AND `m`.`user_id` = `notebook_entries`.`owner_id`
));
--> statement-breakpoint
UPDATE `kink_lists` SET `space_id` = coalesce(`partnership_id`, (
	SELECT `m`.`space_id` FROM `space_members` AS `m` JOIN `spaces` AS `s` ON `s`.`id` = `m`.`space_id`
	WHERE `s`.`kind` = 'solo' AND `m`.`user_id` = `kink_lists`.`owner_id`
));
--> statement-breakpoint
UPDATE `message_threads` SET `space_id` = `partnership_id`;
--> statement-breakpoint
UPDATE `message_tags` SET `space_id` = `partnership_id`;
--> statement-breakpoint
UPDATE `history_restore_requests` SET `space_id` = `partnership_id`;
--> statement-breakpoint
UPDATE `vault_escrows` SET `space_id` = `partnership_id`;
--> statement-breakpoint
UPDATE `daydreams` SET `space_id` = (
	SELECT `m`.`space_id` FROM `space_members` AS `m` JOIN `spaces` AS `s` ON `s`.`id` = `m`.`space_id`
	WHERE `s`.`kind` = 'solo' AND `m`.`user_id` = `daydreams`.`owner_id`
);
--> statement-breakpoint
UPDATE `daydream_characters` SET `space_id` = (
	SELECT `m`.`space_id` FROM `space_members` AS `m` JOIN `spaces` AS `s` ON `s`.`id` = `m`.`space_id`
	WHERE `s`.`kind` = 'solo' AND `m`.`user_id` = `daydream_characters`.`owner_id`
);
--> statement-breakpoint
UPDATE `daydream_scenes` SET `space_id` = (
	SELECT `m`.`space_id` FROM `space_members` AS `m` JOIN `spaces` AS `s` ON `s`.`id` = `m`.`space_id`
	WHERE `s`.`kind` = 'solo' AND `m`.`user_id` = `daydream_scenes`.`owner_id`
);
