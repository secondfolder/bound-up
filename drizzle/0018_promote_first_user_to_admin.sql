-- The first account is an admin. That is how the first admin comes to exist:
-- every later one is made from the admin page. See docs/features-and-admin.md.
--
-- A trigger rather than a Better Auth hook so it holds however the row gets
-- here: signup, a test fixture, or a raw `wrangler d1 execute`. It runs after
-- the admin plugin's own create hook has written `role = 'user'`, and replaces
-- it. Known gap: on a brand new deployment, whoever signs up first is admin,
-- so sign up straight after the first deploy.
CREATE TRIGGER `user_first_account_is_admin`
AFTER INSERT ON `user`
WHEN (SELECT count(*) FROM `user`) = 1
BEGIN
	UPDATE `user` SET `role` = 'admin' WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- A database that already has accounts had its first signup before the trigger
-- existed, so promote that account now. A no-op on an empty database, and when
-- an admin already exists.
UPDATE `user` SET `role` = 'admin'
WHERE `id` = (SELECT `id` FROM `user` ORDER BY `created_at`, `id` LIMIT 1)
AND NOT EXISTS (SELECT 1 FROM `user` WHERE `role` = 'admin');
