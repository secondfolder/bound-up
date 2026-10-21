# Chips for a field: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Target (`target`, structural, baseline `character`)

### target = idea

Not a request any device could send from the baseline: field: Chips are for one field

## Field (`field`, structural, baseline `archetype`)

### field = personality

~~~~diff
@@ -26,5 +26,5 @@
 <character>
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+Personality: ⟦character1.personality⟧
 </character>
 
@@ -35,5 +35,5 @@
 # What to do
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field (the kind of person they are, in a few words) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "Personality" field (how they think and behave) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
 
 # Your answer
~~~~

### field = speech

~~~~diff
@@ -26,5 +26,5 @@
 <character>
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+How they talk: ⟦character1.speech⟧
 </character>
 
@@ -35,5 +35,5 @@
 # What to do
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field (the kind of person they are, in a few words) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "How they talk" field (their voice, their words, their habits) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
 
 # Your answer
~~~~

### field = appearance

~~~~diff
@@ -26,5 +26,5 @@
 <character>
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+Appearance: ⟦character1.appearance⟧
 </character>
 
@@ -35,5 +35,5 @@
 # What to do
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field (the kind of person they are, in a few words) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "Appearance" field (what you notice about them; "you" is the user) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
 
 # Your answer
~~~~

### field = likes

~~~~diff
@@ -26,5 +26,5 @@
 <character>
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+What they enjoy: ⟦character1.likes⟧
 </character>
 
@@ -35,5 +35,5 @@
 # What to do
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field (the kind of person they are, in a few words) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "What they enjoy" field (what they want, given the chance) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
 
 # Your answer
~~~~

### field = notes

~~~~diff
@@ -26,5 +26,5 @@
 <character>
 Name: ⟦character1.name⟧
-Type: ⟦character1.archetype⟧
+Anything else: ⟦character1.notes⟧
 </character>
 
@@ -35,5 +35,5 @@
 # What to do
 
-Suggest up to 12 short phrases the user could add to the character's "Type" field (the kind of person they are, in a few words) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
+Suggest up to 12 short phrases the user could add to the character's "Anything else" field (whatever the rest leaves out) — different from what is already there, varied, and fitting the rest of the character as written above. Each at most 80 characters, with no commas.
 
 # Your answer
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
@@ -18,4 +18,6 @@
 # The daydream around it
 
+It is told as a monologue: one voice speaking its mind, statement by statement, rather than a story. Its idea is what the voice says, not a plot, so it needs no events; its "Where" is where it is set, if anywhere, and the idea's notes are the sayings it builds on.
+
 No other characters yet.
~~~~

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

~~~~diff
@@ -20,5 +20,6 @@
 No other characters yet.
 
-No heat is set: keep to how sexual what is written already is.
+Heat: steamy: sex happens, written sensually rather than graphically.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
 
 # The character so far
~~~~

### rated = kink

~~~~diff
@@ -20,4 +20,5 @@
 No other characters yet.
 
+Kink: kinky: BDSM and power exchange.
 No heat is set: keep to how sexual what is written already is.
~~~~

### rated = both

~~~~diff
@@ -20,5 +20,7 @@
 No other characters yet.
 
-No heat is set: keep to how sexual what is written already is.
+Heat: steamy: sex happens, written sensually rather than graphically.
+Kink: kinky: BDSM and power exchange.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
 
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
 
 No heat is set: keep to how sexual what is written already is.
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -31,5 +31,8 @@
 # The user's limits
 
-None stated beyond the rules.
+Never to be crossed:
+<limits>
+⟦limits⟧
+</limits>
 
 # What to do
~~~~
