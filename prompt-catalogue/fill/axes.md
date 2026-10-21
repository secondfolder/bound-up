# Fill in the rest: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Target (`target`, structural, baseline `character`)

### target = idea

~~~~diff
@@ -18,7 +18,7 @@
 
 ===== 2. user =====
-The character as written so far:
-Name: ⟦character1.name⟧
+The idea as written so far:
+Title: ⟦idea.title⟧
 
-Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
-Answer as: {"archetype": "…", "personality": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
\ No newline at end of file
+Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, the parts it has for characters, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
+Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5, "kink": 1-5}
\ No newline at end of file
~~~~

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
@@ -14,4 +14,5 @@
 
 # The story so far
+It is told as a monologue: one voice speaking its mind, statement by statement, rather than a story. Its idea is what the voice says, not a plot: it needs no place or events, and its notes are the sayings it builds on.
 No characters chosen yet.
 The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## Fields written (`written`, structural, baseline `name only`)

### written = half

~~~~diff
@@ -20,5 +20,6 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+Personality: ⟦character1.personality⟧
 
-Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
-Answer as: {"archetype": "…", "personality": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
\ No newline at end of file
+Fill in the character's empty fields — Type, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
+Answer as: {"archetype": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
\ No newline at end of file
~~~~

## Idea parts (`parts`, structural, baseline `none`)

### parts = some

No change.

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

No change.

### rated = kink

No change.

### rated = both

No change.

## Characters around it (`cast`, descriptive, baseline `none`)

### cast = some

~~~~diff
@@ -14,5 +14,5 @@
 
 # The story so far
-No characters chosen yet.
+Characters in the daydream: ⟦character1.name⟧ (⟦character1.archetype⟧), ⟦character2.name⟧
 The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## Story dials sent (`story`, descriptive, baseline `no`)

### story = yes

~~~~diff
@@ -16,4 +16,7 @@
 No characters chosen yet.
 The user's limits, never to be crossed: none stated beyond the rules above
+Intensity: moderate.
+Pace: steady.
+Length of each passage: two or three short paragraphs.
 
 ===== 2. user =====
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -15,5 +15,5 @@
 # The story so far
 No characters chosen yet.
-The user's limits, never to be crossed: none stated beyond the rules above
+The user's limits, never to be crossed: ⟦limits⟧
 
 ===== 2. user =====
~~~~

## Character tone (`char.tone`, descriptive, baseline `unset`)

### char.tone = warm

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they comes across as warm and affectionate.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.tone = teasing

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they comes across as playful and teasing.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.tone = cold

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they comes across as cool and distant.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.tone = clinical

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they comes across as detached and clinical.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

## Character control (`char.control`, descriptive, baseline `unset`)

### char.control = 1

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they follows the user’s lead.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.control = 2

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they mostly lets the user decide.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.control = 3

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they shares control evenly.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.control = 4

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they usually takes the lead.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.control = 5

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is in complete control.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

## Character strictness (`char.strictness`, descriptive, baseline `unset`)

### char.strictness = 1

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they lets almost anything slide.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.strictness = 2

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is lenient.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.strictness = 3

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is firm but fair.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.strictness = 4

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is strict about rules.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.strictness = 5

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is unbending: every rule, every time.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

## Character edge (`char.edge`, descriptive, baseline `unset`)

### char.edge = 1

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is tender and gentle.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.edge = 2

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is mostly kind.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.edge = 3

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they mixes kindness with a bite.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.edge = 4

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is harsh.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.edge = 5

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is cruel, and enjoys it.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

## Character talk (`char.talk`, descriptive, baseline `unset`)

### char.talk = 1

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they says as little as possible.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.talk = 2

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they speaks briefly.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.talk = 3

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they talks naturally.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.talk = 4

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they talks a lot.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.talk = 5

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they keeps up a constant stream of talk.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

## Character libido (`char.libido`, descriptive, baseline `unset`)

### char.libido = 1

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is not interested in sex.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.libido = 2

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is shy about sex and needs coaxing.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.libido = 3

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is interested in sex when the moment is right.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.libido = 4

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is horny, eager, and says what they want.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.libido = 5

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is slutty: insatiable, shameless, and always up for it.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

## Character kink (`char.kink`, descriptive, baseline `unset`)

### char.kink = 1

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they has vanilla tastes.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.kink = 2

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is curious about light kink.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.kink = 3

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is kinky.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.kink = 4

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is very kinky, into heavy play.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~

### char.kink = 5

~~~~diff
@@ -20,4 +20,5 @@
 The character as written so far:
 Name: ⟦character1.name⟧
+In short, they is depraved: into anything the user’s limits allow, taboo included.
 
 Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
~~~~
