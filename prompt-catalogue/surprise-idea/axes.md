# Surprise idea: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Narrator (`narrator`, structural, baseline `unset`)

### narrator = none

No change.

### narrator = second-person

No change.

### narrator = third-person

No change.

### narrator = impersonal

No change.

### narrator = monologue

~~~~diff
@@ -18,4 +18,6 @@
 # The daydream around it
 
+It is told as a monologue: one voice speaking its mind rather than telling a story. Its idea is what the voice says, not a plot, so it needs no events; its "Where" is where it is set, if anywhere, and the idea's notes are the sayings it builds on.
+
 No characters chosen yet.
 
@@ -32,17 +34,14 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this monologue that the user will not expect.
 
-What makes a story worth starting — weigh these before you answer, without writing the weighing out:
-- Who the people are to each other: strangers thrown together by chance, people who have known each other a while without being close (co-workers from different departments, a neighbour, the courier who always delivers), or people already intimate, together for years or still discovering each other.
-- Where it happens: somewhere with a charge of its own, like the back room at work, deep in an old library, a late train, a mansion with a dungeon in the basement.
-- Why it happens now: a dare, a debt, a bet, blackmail, a job, money, a craving someone finally admits.
-- When it is sexual, which dynamic, acts and kinks suit it, picked to fit the rest rather than listed.
-Draw on the kinds of story people love in erotica and fan fiction, and make it hang together as one story. Tropes are loved for a reason: a familiar one the user would enjoy is a good choice. Be inventive where a fresh angle makes the story better, not for its own sake.
+What makes a monologue worth listening to — weigh these before you answer, without writing the weighing out:
+- The ideas it is built on: the beliefs, rules, tropes and sayings of a kink or dynamic that fits what is set above — the things people into it say to each other and to themselves.
+- Who speaks, and to whom: a voice of its own, speaking to the user, unnamed or a named character.
+- Where it goes: from what sets the ideas out to what goes further or deeper, so it builds rather than repeats.
+There is no plot, place or encounter to invent.
 
-Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
+The idea: "title", a short title naming what it is about, like "What good girls are for"; "premise", what the voice believes and keeps coming back to, in a sentence or two; "yourRole", who the user is to it — the one it speaks to, or, where it is their own thoughts, the one whose voice it is; "tone", in a few words; "setting", where it is set — where the voice speaks from — if anywhere, and empty otherwise; and "notes", the sayings it builds on, 8 to 12 sayings in the voice's own words, one to a line, at most 1,000 characters in all. No parts, unless a named character is the one speaking: then one part, "the speaker".
 
-Give it 2 to 4 openings: other places its story can start, each a short name ("Three weeks in", "The morning after") and a sentence or two on where the story picks up — a later point in it, a gentler or hotter way in, the same people somewhere else.
-
 Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
 
@@ -53,15 +52,13 @@
 Answer with this JSON and nothing else. Every … is yours to fill in; write a line break inside a string as \n.
 
-- "title": a short title
-- "setting": where it happens
-- "premise": what is going on as it starts
-- "yourRole": who the user is in it
-- "tone": how it should feel
+- "title": a short title naming what it is about
+- "setting": where it is set, if anywhere; empty otherwise
+- "premise": what the voice believes and keeps coming back to
+- "yourRole": who the user is to the voice
+- "tone": how it sounds, in a few words
+- "notes": the sayings it builds on, 8 to 12 sayings in the voice's own words, one to a line, at most 1,000 characters in all
 - "parts": the parts for characters to play
   - "name": a short name for the part
   - "description": what that part does in the idea, in a few words
-- "openings": other places its story can start; an empty list for a monologue
-  - "label": a short name for where it starts
-  - "situation": where the story picks up, in a sentence or two
 - "heat": how sexual the idea is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
 - "kink": how kinky the idea is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
@@ -71,3 +68,3 @@
   - "spoiler": true for a twist kept from the user, otherwise false
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "openings": [{"label": "…", "situation": "…"}, …], "heat": …, "kink": …, "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …, "kink": …, "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
~~~~

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

~~~~diff
@@ -26,4 +26,7 @@
 </idea>
 
+The idea's heat: steamy: sex happens, written sensually rather than graphically.
+The idea's heat is the ceiling for everyone in it: each character's own libido and kink dials say how eager and how kinky they are within it, never past it.
+
 # The user's limits
 
@@ -32,5 +35,5 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this story that the user will not expect, fitting the idea's heat and kink set above.
 
 What makes a story worth starting — weigh these before you answer, without writing the weighing out:
@@ -45,5 +48,5 @@
 Give it 2 to 4 openings: other places its story can start, each a short name ("Three weeks in", "The morning after") and a sentence or two on where the story picks up — a later point in it, a gentler or hotter way in, the same people somewhere else.
 
-Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
+Rate the idea's kink too, from what is written: an idea that says nothing sexual is not sexual.
 
 Where it would make the idea better, add a field or two it does not have yet, each named in a few words — like a secret at its heart, a rule everyone follows, a twist — and fill any field above that the user named and left empty. Mark a field "spoiler" when it is a twist the user should only find out in play. Only fields that earn their place; none is fine.
@@ -64,5 +67,4 @@
   - "label": a short name for where it starts
   - "situation": where the story picks up, in a sentence or two
-- "heat": how sexual the idea is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
 - "kink": how kinky the idea is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 - "fields": fields to add or fill, if any; an empty list for none
@@ -71,3 +73,3 @@
   - "spoiler": true for a twist kept from the user, otherwise false
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "openings": [{"label": "…", "situation": "…"}, …], "heat": …, "kink": …, "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "openings": [{"label": "…", "situation": "…"}, …], "kink": …, "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
~~~~

### rated = kink

~~~~diff
@@ -26,4 +26,6 @@
 </idea>
 
+The idea's kink: kinky: BDSM and power exchange.
+
 # The user's limits
 
@@ -32,5 +34,5 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this story that the user will not expect, fitting the idea's heat and kink set above.
 
 What makes a story worth starting — weigh these before you answer, without writing the weighing out:
@@ -45,5 +47,5 @@
 Give it 2 to 4 openings: other places its story can start, each a short name ("Three weeks in", "The morning after") and a sentence or two on where the story picks up — a later point in it, a gentler or hotter way in, the same people somewhere else.
 
-Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
+Rate the idea's heat too, from what is written: an idea that says nothing sexual is not sexual.
 
 Where it would make the idea better, add a field or two it does not have yet, each named in a few words — like a secret at its heart, a rule everyone follows, a twist — and fill any field above that the user named and left empty. Mark a field "spoiler" when it is a twist the user should only find out in play. Only fields that earn their place; none is fine.
@@ -65,5 +67,4 @@
   - "situation": where the story picks up, in a sentence or two
 - "heat": how sexual the idea is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
-- "kink": how kinky the idea is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 - "fields": fields to add or fill, if any; an empty list for none
   - "label": the field's name, in a few words
@@ -71,3 +72,3 @@
   - "spoiler": true for a twist kept from the user, otherwise false
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "openings": [{"label": "…", "situation": "…"}, …], "heat": …, "kink": …, "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "openings": [{"label": "…", "situation": "…"}, …], "heat": …, "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
~~~~

### rated = both

~~~~diff
@@ -26,4 +26,8 @@
 </idea>
 
+The idea's heat: steamy: sex happens, written sensually rather than graphically.
+The idea's kink: kinky: BDSM and power exchange.
+The idea's heat is the ceiling for everyone in it: each character's own libido and kink dials say how eager and how kinky they are within it, never past it.
+
 # The user's limits
 
@@ -32,5 +36,5 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this story that the user will not expect, fitting the idea's heat and kink set above.
 
 What makes a story worth starting — weigh these before you answer, without writing the weighing out:
@@ -45,6 +49,4 @@
 Give it 2 to 4 openings: other places its story can start, each a short name ("Three weeks in", "The morning after") and a sentence or two on where the story picks up — a later point in it, a gentler or hotter way in, the same people somewhere else.
 
-Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
-
 Where it would make the idea better, add a field or two it does not have yet, each named in a few words — like a secret at its heart, a rule everyone follows, a twist — and fill any field above that the user named and left empty. Mark a field "spoiler" when it is a twist the user should only find out in play. Only fields that earn their place; none is fine.
 
@@ -64,6 +66,4 @@
   - "label": a short name for where it starts
   - "situation": where the story picks up, in a sentence or two
-- "heat": how sexual the idea is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
-- "kink": how kinky the idea is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 - "fields": fields to add or fill, if any; an empty list for none
   - "label": the field's name, in a few words
@@ -71,3 +71,3 @@
   - "spoiler": true for a twist kept from the user, otherwise false
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "openings": [{"label": "…", "situation": "…"}, …], "heat": …, "kink": …, "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "openings": [{"label": "…", "situation": "…"}, …], "fields": [{"label": "…", "value": "…", "spoiler": …}, …]}
\ No newline at end of file
~~~~

## Characters around it (`cast`, structural, baseline `none`)

### cast = some

~~~~diff
@@ -18,5 +18,9 @@
 # The daydream around it
 
-No characters chosen yet.
+Characters in the daydream:
+<characters>
+⟦character1.name⟧ (⟦character1.archetype⟧)
+⟦character2.name⟧
+</characters>
 
 # The idea so far
@@ -32,5 +36,5 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this story that the user will not expect, built around the characters above, each playing one of its parts.
 
 What makes a story worth starting — weigh these before you answer, without writing the weighing out:
~~~~

## Story dials sent (`story`, descriptive, baseline `no`)

### story = yes

~~~~diff
@@ -20,4 +20,9 @@
 No characters chosen yet.
 
+How the daydream will be told, for context — these are not lengths for the fields:
+Intensity: moderate.
+Pace: steady.
+Passage length: no preference. Let each moment set its passage's length: some run long, some are a line or two.
+
 # The idea so far
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -28,5 +28,8 @@
 # The user's limits
 
-None stated beyond the rules.
+Never to be crossed:
+<limits>
+⟦limits⟧
+</limits>
 
 # What to do
~~~~
