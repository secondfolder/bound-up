-- Each member's colour for a space (`space_members.colour`), moved from the
-- old palette (teal, violet, blue, pink, green, lime) to the signature hues
-- (green, pink, purple, teal, red, yellow; docs/contexts.md#colours), so
-- nobody's choice is lost.
--
-- Custom (`drizzle-kit generate --custom`) because there is no schema change:
-- the column is plain text holding a name from `SPACE_COLOURS`, and only the
-- names change. Each old name goes to the nearest new hue family. Blue is now
-- your own space's colour and not a partner's, so a partner who was blue
-- becomes purple, beside violet's. Lime is nearest yellow. Teal, pink and
-- green keep their names. NULL (never chosen) stays NULL, and anything else
-- is left alone: the app reads an unknown name as not chosen.
UPDATE `space_members`
SET `colour` = CASE `colour`
	WHEN 'violet' THEN 'purple'
	WHEN 'blue' THEN 'purple'
	WHEN 'lime' THEN 'yellow'
	ELSE `colour`
END
WHERE `colour` IN ('violet', 'blue', 'lime');
