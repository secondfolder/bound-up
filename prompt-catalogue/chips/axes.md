# Chips for a field: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Target (`target`, structural, baseline `character`)

### target = idea

Not a request any device could send from the baseline: field: Chips are for one field

## Field (`field`, structural, baseline `archetype`)

### field = personality

~~~~diff
@@ -20,6 +20,6 @@
 The character as written so far:
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+Personality: ⟦character1.personality⟧
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "Personality" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
 Answer as: {"chips": ["…", "…"]}
\ No newline at end of file
~~~~

### field = speech

~~~~diff
@@ -20,6 +20,6 @@
 The character as written so far:
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+How they talk: ⟦character1.speech⟧
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "How they talk" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
 Answer as: {"chips": ["…", "…"]}
\ No newline at end of file
~~~~

### field = appearance

~~~~diff
@@ -20,6 +20,6 @@
 The character as written so far:
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+Appearance: ⟦character1.appearance⟧
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "Appearance" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
 Answer as: {"chips": ["…", "…"]}
\ No newline at end of file
~~~~

### field = likes

~~~~diff
@@ -20,6 +20,6 @@
 The character as written so far:
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+What they enjoy: ⟦character1.likes⟧
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "What they enjoy" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
 Answer as: {"chips": ["…", "…"]}
\ No newline at end of file
~~~~

### field = notes

~~~~diff
@@ -20,6 +20,6 @@
 The character as written so far:
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+Anything else: ⟦character1.notes⟧
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "Anything else" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
 Answer as: {"chips": ["…", "…"]}
\ No newline at end of file
~~~~

### field = setting

Not a request any device could send from the baseline: field: Chips are for one field

### field = premise

Not a request any device could send from the baseline: field: Chips are for one field

### field = yourRole

Not a request any device could send from the baseline: field: Chips are for one field

### field = tone

Not a request any device could send from the baseline: field: Chips are for one field

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

## Characters around it (`cast`, descriptive, baseline `none`)

### cast = some

~~~~diff
@@ -14,5 +14,5 @@
 
 # The story so far
-No characters chosen yet.
+Characters in the daydream: ⟦character1.name⟧ (⟦character1.archetype⟧), ⟦character2.name⟧
 The user's limits, never to be crossed: none stated beyond the rules above
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
