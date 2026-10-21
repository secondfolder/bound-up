# Casting: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Stance (`stance`, structural, baseline `self`)

### stance = persona

~~~~diff
@@ -38,5 +38,5 @@
 # Their place in it
 
-⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story, as themselves.
+⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story, playing a character of their own.
 
 # The user's limits
@@ -46,5 +46,5 @@
 # What to do
 
-Say who ⟦character1.name⟧ is in this daydream: who they are to the user, in a few words; and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
+Say who ⟦character1.name⟧ is in this daydream: who they are to the character the user plays in it, in a few words; and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
 
 # Your answer
@@ -52,5 +52,5 @@
 Answer with this JSON and nothing else. Every … is yours to fill in; write a line break inside a string as \n.
 
-- "relationship": who they are to the user
+- "relationship": who they are to the character the user plays in it
 - "doing": what they are doing or want as the idea starts
~~~~

### stance = absent

~~~~diff
@@ -38,5 +38,5 @@
 # Their place in it
 
-⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story, as themselves.
+⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is not in the story: they watch it from outside.
 
 # The user's limits
@@ -46,5 +46,5 @@
 # What to do
 
-Say who ⟦character1.name⟧ is in this daydream: who they are to the user, in a few words; and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
+Say who ⟦character1.name⟧ is in this daydream: who they are in the idea's world, since the user only watches, in a few words; and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
 
 # Your answer
@@ -52,5 +52,5 @@
 Answer with this JSON and nothing else. Every … is yours to fill in; write a line break inside a string as \n.
 
-- "relationship": who they are to the user
+- "relationship": who they are in the idea's world, since the user only watches
 - "doing": what they are doing or want as the idea starts
~~~~

## Part (`part`, structural, baseline `some`)

### part = none

~~~~diff
@@ -38,5 +38,5 @@
 # Their place in it
 
-⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story, as themselves.
+⟦character1.name⟧ need not hold any particular role in the idea. Nobody else is in the story. The user is in the story, as themselves.
 
 # The user's limits
@@ -46,5 +46,5 @@
 # What to do
 
-Say who ⟦character1.name⟧ is in this daydream: who they are to the user, in a few words; and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
+Say who ⟦character1.name⟧ is in this daydream: who they are to the user, in a few words; and what they are doing or want as the idea starts, in a sentence. Fit both to the idea, and to who they are.
 
 # Your answer
~~~~

## Others in it (`others`, structural, baseline `none`)

### others = some

~~~~diff
@@ -38,5 +38,5 @@
 # Their place in it
 
-⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story, as themselves.
+⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Also in the story: ⟦character2.name⟧ (⟦part2.name⟧). The user is in the story, as themselves.
 
 # The user's limits
~~~~

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

~~~~diff
@@ -34,5 +34,6 @@
 </idea>
 
-The idea's heat is not set: keep to how sexual what is written already is.
+The idea's heat: steamy: sex happens, written sensually rather than graphically.
+The idea's heat is the ceiling for everyone in it: each character's own libido and kink dials say how eager and how kinky they are within it, never past it.
 
 # Their place in it
~~~~

### rated = kink

~~~~diff
@@ -34,4 +34,5 @@
 </idea>
 
+The idea's kink: kinky: BDSM and power exchange.
 The idea's heat is not set: keep to how sexual what is written already is.
~~~~

### rated = both

~~~~diff
@@ -34,5 +34,7 @@
 </idea>
 
-The idea's heat is not set: keep to how sexual what is written already is.
+The idea's heat: steamy: sex happens, written sensually rather than graphically.
+The idea's kink: kinky: BDSM and power exchange.
+The idea's heat is the ceiling for everyone in it: each character's own libido and kink dials say how eager and how kinky they are within it, never past it.
 
 # Their place in it
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -42,5 +42,8 @@
 # The user's limits
 
-None stated beyond the rules.
+Never to be crossed:
+<limits>
+⟦limits⟧
+</limits>
 
 # What to do
~~~~
