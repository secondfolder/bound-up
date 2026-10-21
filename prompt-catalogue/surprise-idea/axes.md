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
@@ -1,4 +1,4 @@
 ===== settings =====
-maxTokens: 800
+maxTokens: 1000
 temperature: 1
 pagesRead: null
@@ -18,4 +18,6 @@
 # The daydream around it
 
+It is told as a monologue: one voice speaking its mind, statement by statement, rather than a story. Its idea is what the voice says, not a plot, so it needs no events; its "Where" is where it is set, if anywhere, and the idea's notes are the sayings it builds on.
+
 No characters chosen yet.
 
@@ -32,14 +34,13 @@
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
+- Where it goes: from statements that set the ideas out to ones that go further or deeper, so they build rather than repeat.
+There is no plot, place or encounter to invent.
 
-Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
+The idea: "title", a short title naming what it is about, like "What good girls are for"; "premise", what the voice believes and keeps coming back to, in a sentence or two; "yourRole", who the user is to it — the one it speaks to, or, where it is their own thoughts, the one whose voice it is; "tone", in a few words; "setting", where it is set — where the voice speaks from — if anywhere, and empty otherwise; and "notes", the sayings it builds on, 8 to 12 statements in the voice's own words, one to a line, at most 1,000 characters in all. No parts, unless a named character is the one speaking: then one part, "the speaker".
 
 Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
@@ -49,9 +50,10 @@
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
+- "notes": the sayings it builds on, 8 to 12 statements in the voice's own words, one to a line, at most 1,000 characters in all
 - "parts": the parts for characters to play
   - "name": a short name for the part
@@ -60,3 +62,3 @@
 - "kink": how kinky it is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …, "kink": …}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …, "kink": …}
\ No newline at end of file
~~~~

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

~~~~diff
@@ -26,4 +26,7 @@
 </idea>
 
+Heat: steamy: sex happens, written sensually rather than graphically.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
+
 # The user's limits
 
@@ -32,5 +35,5 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this story that the user will not expect, fitting the heat and kink set above.
 
 What makes a story worth starting — weigh these before you answer, without writing the weighing out:
@@ -43,5 +46,5 @@
 Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
 
-Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
+Rate the idea's kink too, from what is written: an idea that says nothing sexual is not sexual.
 
 # Your answer
@@ -57,6 +60,5 @@
   - "name": a short name for the part
   - "description": what that part does in the idea, in a few words
-- "heat": how sexual it is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
 - "kink": how kinky it is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …, "kink": …}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "kink": …}
\ No newline at end of file
~~~~

### rated = kink

~~~~diff
@@ -26,4 +26,6 @@
 </idea>
 
+Kink: kinky: BDSM and power exchange.
+
 # The user's limits
 
@@ -32,5 +34,5 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this story that the user will not expect, fitting the heat and kink set above.
 
 What makes a story worth starting — weigh these before you answer, without writing the weighing out:
@@ -43,5 +45,5 @@
 Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
 
-Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
+Rate the idea's heat too, from what is written: an idea that says nothing sexual is not sexual.
 
 # Your answer
@@ -58,5 +60,4 @@
   - "description": what that part does in the idea, in a few words
 - "heat": how sexual it is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
-- "kink": how kinky it is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …, "kink": …}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …}
\ No newline at end of file
~~~~

### rated = both

~~~~diff
@@ -26,4 +26,8 @@
 </idea>
 
+Heat: steamy: sex happens, written sensually rather than graphically.
+Kink: kinky: BDSM and power exchange.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
+
 # The user's limits
 
@@ -32,5 +36,5 @@
 # What to do
 
-Invent an idea for this story that the user will not expect.
+Invent an idea for this story that the user will not expect, fitting the heat and kink set above.
 
 What makes a story worth starting — weigh these before you answer, without writing the weighing out:
@@ -43,6 +47,4 @@
 Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
 
-Rate the idea's heat and kink too, from what is written: an idea that says nothing sexual is not sexual.
-
 # Your answer
 
@@ -57,6 +59,4 @@
   - "name": a short name for the part
   - "description": what that part does in the idea, in a few words
-- "heat": how sexual it is, a whole number from 1 to 5 (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy)
-- "kink": how kinky it is, a whole number from 1 to 5 (1 vanilla, 3 BDSM and power exchange, 5 extreme)
 
-{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …], "heat": …, "kink": …}
\ No newline at end of file
+{"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}, …]}
\ No newline at end of file
~~~~

## Characters around it (`cast`, structural, baseline `none`)

### cast = some

~~~~diff
@@ -18,5 +18,5 @@
 # The daydream around it
 
-No characters chosen yet.
+Characters in the daydream: ⟦character1.name⟧ (⟦character1.archetype⟧), ⟦character2.name⟧
 
 # The idea so far
@@ -32,5 +32,5 @@
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
+Length of each passage: two or three short paragraphs.
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
