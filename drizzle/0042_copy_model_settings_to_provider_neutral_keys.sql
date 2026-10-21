-- Model settings move to keys that name no provider, now that each names its
-- own (docs/server-settings.md, "Model providers"). Each old row is copied, not
-- renamed, with its provider added, so a rollback to an older build still
-- finds its rows. A cleared row ('') stays cleared, and a value that is not a
-- JSON object is copied as it is, to read as the default as it did before.
INSERT INTO `server_settings` (`key`, `value`, `source`, `created_at`, `updated_at`)
SELECT
	CASE `key`
		WHEN 'openrouterStoryModel' THEN 'storyModel'
		WHEN 'runwarePhotoModel' THEN 'photoModel'
		ELSE 'illustratedModel'
	END,
	CASE
		WHEN json_valid(`value`) AND json_type(`value`) = 'object' THEN json_set(
			`value`,
			'$.provider',
			CASE `key` WHEN 'openrouterStoryModel' THEN 'openrouter' ELSE 'runware' END
		)
		ELSE `value`
	END,
	`source`,
	`created_at`,
	`updated_at`
FROM `server_settings`
WHERE `key` IN ('openrouterStoryModel', 'runwarePhotoModel', 'runwareIllustratedModel')
ON CONFLICT (`key`) DO NOTHING;
