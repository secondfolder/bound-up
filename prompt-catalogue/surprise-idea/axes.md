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
 readLinks: false
@@ -14,4 +14,5 @@
 
 # The story so far
+It is told as a monologue: one voice speaking its mind, statement by statement, rather than a story. Its idea is what the voice says, not a plot: it needs no place or events, and its notes are the sayings it builds on.
 No characters chosen yet.
 The user's limits, never to be crossed: none stated beyond the rules above
@@ -21,11 +22,10 @@
 Title: ⟦idea.title⟧
 
-Invent an idea for this story that the user will not expect, fitting the characters and the dials.
-What makes a story worth starting — think it through before writing:
-- Who the people are to each other: strangers thrown together by chance, people who have known each other a while without being close (co-workers from different departments, a neighbour, the courier who always delivers), or people already intimate, together for years or still discovering each other.
-- Where it happens: somewhere with a charge of its own, like the back room at work, deep in an old library, a late train, a mansion with a dungeon in the basement.
-- Why it happens now: a dare, a debt, a bet, blackmail, a job, money, a craving someone finally admits.
-- When it is sexual, which dynamic, acts and kinks suit it, picked to fit the rest rather than listed.
-Draw on the kinds of story people love in erotica and fan fiction, and make it hang together as one story. Tropes are loved for a reason: a familiar one the user would enjoy is a good choice. Be inventive where a fresh angle makes the story better, not for its own sake.
-Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
-Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5, "kink": 1-5}
\ No newline at end of file
+Invent an idea for this monologue that the user will not expect, fitting the characters and the dials.
+What makes a monologue worth listening to — think it through before writing:
+- The ideas it is built on: the beliefs, rules, tropes and sayings of what the user is into — the things people into it say to each other and to themselves. Start from any they named or pointed to, in their own words where they gave some, and add the ones that go with them.
+- Who speaks, and to whom: a voice of its own, speaking to the user — unnamed, or a named character where they asked for a person. That is the default, and a brief being about what someone is or is for, what people believe, or the sayings of a kink or a community is no reason to leave it: a separate voice can say all of those to the user. Where the ideas are those of the user's own side — a dominant's for a dominant user, a submissive's for a submissive one — it says them alongside the user, as one of that side to another, never casting the user as the other side. Only where the brief asks for the ideas in the user's own inner voice is it theirs.
+- Where it goes: from statements that set the ideas out to ones that go further or deeper, so they build rather than repeat.
+There is no plot, place or encounter to invent, unless they asked for one.
+Give it a short title naming what it is about, like "What good girls are for"; the premise: what the voice believes and keeps coming back to, in a sentence or two; your role: who the user is to it — the one it speaks to, or, where it is their own thoughts, the one whose voice it is; its tone, in a few words; the setting empty, unless it is said somewhere in particular; and the notes: the sayings it builds on, 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. No parts, unless a named character is the one speaking. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
+Answer as: {"title": "…", "setting": "", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [], "heat": 1-5, "kink": 1-5}
\ No newline at end of file
~~~~

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

~~~~diff
@@ -20,4 +20,6 @@
 The idea as written so far:
 Title: ⟦idea.title⟧
+Heat: steamy: sex happens, written sensually rather than graphically.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
 
 Invent an idea for this story that the user will not expect, fitting the characters and the dials.
@@ -28,4 +30,4 @@
 - When it is sexual, which dynamic, acts and kinks suit it, picked to fit the rest rather than listed.
 Draw on the kinds of story people love in erotica and fan fiction, and make it hang together as one story. Tropes are loved for a reason: a familiar one the user would enjoy is a good choice. Be inventive where a fresh angle makes the story better, not for its own sake.
-Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
-Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5, "kink": 1-5}
\ No newline at end of file
+Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
+Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}], "kink": 1-5}
\ No newline at end of file
~~~~

### rated = kink

~~~~diff
@@ -20,4 +20,5 @@
 The idea as written so far:
 Title: ⟦idea.title⟧
+Kink: kinky: BDSM and power exchange.
 
 Invent an idea for this story that the user will not expect, fitting the characters and the dials.
@@ -28,4 +29,4 @@
 - When it is sexual, which dynamic, acts and kinks suit it, picked to fit the rest rather than listed.
 Draw on the kinds of story people love in erotica and fan fiction, and make it hang together as one story. Tropes are loved for a reason: a familiar one the user would enjoy is a good choice. Be inventive where a fresh angle makes the story better, not for its own sake.
-Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
-Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5, "kink": 1-5}
\ No newline at end of file
+Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy).
+Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5}
\ No newline at end of file
~~~~

### rated = both

~~~~diff
@@ -20,4 +20,7 @@
 The idea as written so far:
 Title: ⟦idea.title⟧
+Heat: steamy: sex happens, written sensually rather than graphically.
+Kink: kinky: BDSM and power exchange.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
 
 Invent an idea for this story that the user will not expect, fitting the characters and the dials.
@@ -28,4 +31,4 @@
 - When it is sexual, which dynamic, acts and kinks suit it, picked to fit the rest rather than listed.
 Draw on the kinds of story people love in erotica and fan fiction, and make it hang together as one story. Tropes are loved for a reason: a familiar one the user would enjoy is a good choice. Be inventive where a fresh angle makes the story better, not for its own sake.
-Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
-Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5, "kink": 1-5}
\ No newline at end of file
+Give it a short title; say where it happens, what is going on as it starts, who the user is in it, and its tone, each in a sentence or two. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
+Answer as: {"title": "…", "setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "parts": [{"name": "…", "description": "…"}]}
\ No newline at end of file
~~~~

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
