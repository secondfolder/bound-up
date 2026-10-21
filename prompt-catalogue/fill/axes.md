# Fill in the rest: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Target (`target`, structural, baseline `character`)

### target = idea

~~~~diff
@@ -18,14 +18,12 @@
 # The daydream around it
 
-No other characters yet.
+No characters chosen yet.
 
-The idea's heat is not set: keep to how sexual what is written already is.
+# The idea so far
 
-# The character so far
+<idea>
+Title: ⟦idea.title⟧
+</idea>
 
-<character>
-Name: ⟦character1.name⟧
-</character>
-
 # The user's limits
 
@@ -34,16 +32,24 @@
 # What to do
 
-Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1,000 characters. Do not change the fields already written.
+Fill in the idea's empty fields — Where, What it's about, Your role in it, Tone, Anything else, the parts it has for characters, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1,000 characters. Do not change the fields already written.
 
+Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
+
+Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
+
 # Your answer
 
 Answer with this JSON and nothing else. Every … is yours to fill in; write a line break inside a string as \n.
 
-- "archetype": their type, in a few words
-- "personality": how they think and behave
-- "speech": how they talk
-- "appearance": what you notice about them
-- "likes": what they enjoy
+- "setting": where it happens
+- "premise": what is going on as it starts
+- "yourRole": who the user is in it
+- "tone": how it should feel
 - "notes": anything the rest leaves out
+- "parts": the parts for characters to play
+  - "name": a short name for the part
+  - "description": what that part does in the idea, in a few words
+- "heat": how sexual the idea is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
+- "kink": how kinky the idea is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 
-{"archetype": "…", "personality": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
\ No newline at end of file
+{"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …, "kink": …}
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
@@ -18,4 +18,6 @@
 # The daydream around it
 
+It is told as a monologue: one voice speaking its mind, statement by statement, rather than a story. Its idea is what the voice says, not a plot, so it needs no events; its "Where" is where it is set, if anywhere, and the idea's notes are the sayings it builds on.
+
 No other characters yet.
~~~~

## Fields written (`written`, structural, baseline `name only`)

### written = half

~~~~diff
@@ -26,4 +26,5 @@
 <character>
 Name: ⟦character1.name⟧
+Personality: ⟦character1.personality⟧
 </character>
 
@@ -34,5 +35,5 @@
 # What to do
 
-Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1,000 characters. Do not change the fields already written.
+Fill in the character's empty fields — Type, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1,000 characters. Do not change the fields already written.
 
 # Your answer
@@ -41,5 +42,4 @@
 
 - "archetype": their type, in a few words
-- "personality": how they think and behave
 - "speech": how they talk
 - "appearance": what you notice about them
@@ -47,3 +47,3 @@
 - "notes": anything the rest leaves out
 
-{"archetype": "…", "personality": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
\ No newline at end of file
+{"archetype": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
\ No newline at end of file
~~~~

## Idea parts (`parts`, structural, baseline `none`)

### parts = some

No change.

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

~~~~diff
@@ -20,5 +20,6 @@
 No other characters yet.
 
-The idea's heat is not set: keep to how sexual what is written already is.
+The idea's heat: steamy: sex happens, written sensually rather than graphically.
+The idea's heat is the ceiling for everyone in it: each character's own libido and kink dials say how eager and how kinky they are within it, never past it.
 
 # The character so far
~~~~

### rated = kink

~~~~diff
@@ -20,4 +20,5 @@
 No other characters yet.
 
+The idea's kink: kinky: BDSM and power exchange.
 The idea's heat is not set: keep to how sexual what is written already is.
~~~~

### rated = both

~~~~diff
@@ -20,5 +20,7 @@
 No other characters yet.
 
-The idea's heat is not set: keep to how sexual what is written already is.
+The idea's heat: steamy: sex happens, written sensually rather than graphically.
+The idea's kink: kinky: BDSM and power exchange.
+The idea's heat is the ceiling for everyone in it: each character's own libido and kink dials say how eager and how kinky they are within it, never past it.
 
 # The character so far
~~~~

## Characters around it (`cast`, structural, baseline `none`)

### cast = some

~~~~diff
@@ -18,5 +18,8 @@
 # The daydream around it
 
-No other characters yet.
+Other characters in the daydream:
+<characters>
+⟦character2.name⟧
+</characters>
 
 The idea's heat is not set: keep to how sexual what is written already is.
~~~~

## Story dials sent (`story`, descriptive, baseline `no`)

### story = yes

~~~~diff
@@ -22,4 +22,9 @@
 The idea's heat is not set: keep to how sexual what is written already is.
 
+How the daydream will be told, for context — these are not lengths for the fields:
+Intensity: moderate.
+Pace: steady.
+Passage length: no preference. Let each moment set its passage's length: some run long, some are a line or two.
+
 # The character so far
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -30,5 +30,8 @@
 # The user's limits
 
-None stated beyond the rules.
+Never to be crossed:
+<limits>
+⟦limits⟧
+</limits>
 
 # What to do
~~~~

## Character tone (`char.tone`, descriptive, baseline `unset`)

### char.tone = warm

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ comes across as warm and affectionate.
+
 # The user's limits
~~~~

### char.tone = teasing

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ comes across as playful and teasing.
+
 # The user's limits
~~~~

### char.tone = cold

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ comes across as cool and distant.
+
 # The user's limits
~~~~

### char.tone = clinical

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ comes across as detached and clinical.
+
 # The user's limits
~~~~

## Character control (`char.control`, descriptive, baseline `unset`)

### char.control = 1

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ follows the user’s lead.
+
 # The user's limits
~~~~

### char.control = 2

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ mostly lets the user decide.
+
 # The user's limits
~~~~

### char.control = 3

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ shares control evenly.
+
 # The user's limits
~~~~

### char.control = 4

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ usually takes the lead.
+
 # The user's limits
~~~~

### char.control = 5

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is in complete control.
+
 # The user's limits
~~~~

## Character strictness (`char.strictness`, descriptive, baseline `unset`)

### char.strictness = 1

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ lets almost anything slide.
+
 # The user's limits
~~~~

### char.strictness = 2

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is lenient.
+
 # The user's limits
~~~~

### char.strictness = 3

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is firm but fair.
+
 # The user's limits
~~~~

### char.strictness = 4

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is strict about rules.
+
 # The user's limits
~~~~

### char.strictness = 5

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is unbending: every rule, every time.
+
 # The user's limits
~~~~

## Character edge (`char.edge`, descriptive, baseline `unset`)

### char.edge = 1

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is tender and gentle.
+
 # The user's limits
~~~~

### char.edge = 2

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is mostly kind.
+
 # The user's limits
~~~~

### char.edge = 3

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ mixes kindness with a bite.
+
 # The user's limits
~~~~

### char.edge = 4

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is harsh.
+
 # The user's limits
~~~~

### char.edge = 5

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is cruel, and enjoys it.
+
 # The user's limits
~~~~

## Character talk (`char.talk`, descriptive, baseline `unset`)

### char.talk = 1

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ says as little as possible.
+
 # The user's limits
~~~~

### char.talk = 2

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ speaks briefly.
+
 # The user's limits
~~~~

### char.talk = 3

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ talks naturally.
+
 # The user's limits
~~~~

### char.talk = 4

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ talks a lot.
+
 # The user's limits
~~~~

### char.talk = 5

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ keeps up a constant stream of talk.
+
 # The user's limits
~~~~

## Character libido (`char.libido`, descriptive, baseline `unset`)

### char.libido = 1

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is not interested in sex.
+
 # The user's limits
~~~~

### char.libido = 2

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is shy about sex and needs coaxing.
+
 # The user's limits
~~~~

### char.libido = 3

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is interested in sex when the moment is right.
+
 # The user's limits
~~~~

### char.libido = 4

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is horny, eager, and says what they want.
+
 # The user's limits
~~~~

### char.libido = 5

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is slutty: insatiable, shameless, and always up for it.
+
 # The user's limits
~~~~

## Character kink (`char.kink`, descriptive, baseline `unset`)

### char.kink = 1

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ has vanilla tastes.
+
 # The user's limits
~~~~

### char.kink = 2

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is curious about light kink.
+
 # The user's limits
~~~~

### char.kink = 3

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is kinky.
+
 # The user's limits
~~~~

### char.kink = 4

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is very kinky, into heavy play.
+
 # The user's limits
~~~~

### char.kink = 5

~~~~diff
@@ -28,4 +28,6 @@
 </character>
 
+⟦character1.name⟧ is depraved: into anything the user’s limits allow, taboo included.
+
 # The user's limits
~~~~
