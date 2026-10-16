-- Daydream turns become a tree (0033). Every daydream before it is a single
-- line of turns at positions 0, 1, 2…, so each turn's parent is the one just
-- before it, the branch being read ends at the highest position, and
-- `position` already equals depth. The role `character` becomes `story`: a
-- turn may now be written by a narrator with no character in it at all.
UPDATE `daydream_turns` SET `parent_id` = (
	SELECT `previous`.`id` FROM `daydream_turns` AS `previous`
	WHERE `previous`.`daydream_id` = `daydream_turns`.`daydream_id`
		AND `previous`.`position` = `daydream_turns`.`position` - 1
) WHERE `position` > 0;
--> statement-breakpoint
UPDATE `daydreams` SET `active_turn_id` = (
	SELECT `turn`.`id` FROM `daydream_turns` AS `turn`
	WHERE `turn`.`daydream_id` = `daydreams`.`id`
	ORDER BY `turn`.`position` DESC, `turn`.`id` DESC
	LIMIT 1
);
--> statement-breakpoint
UPDATE `daydream_turns` SET `role` = 'story' WHERE `role` = 'character';
