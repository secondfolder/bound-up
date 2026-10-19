-- The IQ test's answer button stopped being a feature of its own and became
-- part of debug mode (docs/debug-mode.md), so whoever held it holds debug mode
-- now. `OR IGNORE` leaves alone an account that already holds both, whose old
-- row the DELETE then clears, since (user_id, feature) is unique.
UPDATE OR IGNORE `user_features` SET `feature` = 'debugMode' WHERE `feature` = 'iqTestAnswerButton';
--> statement-breakpoint
DELETE FROM `user_features` WHERE `feature` = 'iqTestAnswerButton';
