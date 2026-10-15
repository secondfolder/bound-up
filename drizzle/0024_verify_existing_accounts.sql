-- Accounts made before sign-in required a confirmed address. They were all
-- made by people who could sign in the day before, so they are treated as
-- confirmed rather than locked out until each finds a link. See docs/email.md.
UPDATE `user` SET `email_verified` = 1 WHERE `email_verified` = 0;
