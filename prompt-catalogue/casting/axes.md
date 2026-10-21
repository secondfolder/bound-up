# Casting: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Stance (`stance`, structural, baseline `self`)

### stance = persona

No change.

### stance = absent

~~~~diff
@@ -26,6 +26,6 @@
 What it’s about: ⟦idea.premise⟧
 
-⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story.
+⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is not in the story: they watch it from outside.
 
-Say who this character is in this story: who they are to the user, in a few words, and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
+Say who this character is in this story: who they are to the user (or to the others, since the user only watches), in a few words, and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
 Answer as: {"relationship": "…", "part": "…"}
\ No newline at end of file
~~~~

## Part (`part`, structural, baseline `some`)

### part = none

~~~~diff
@@ -26,5 +26,5 @@
 What it’s about: ⟦idea.premise⟧
 
-⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story.
+⟦character1.name⟧ has no particular part in the idea. Nobody else is in the story. The user is in the story.
 
 Say who this character is in this story: who they are to the user, in a few words, and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
~~~~

## Others in it (`others`, structural, baseline `none`)

### others = some

~~~~diff
@@ -26,5 +26,5 @@
 What it’s about: ⟦idea.premise⟧
 
-⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story.
+⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Also in the story: ⟦character2.name⟧ (⟦part2.name⟧). The user is in the story.
 
 Say who this character is in this story: who they are to the user, in a few words, and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -13,5 +13,5 @@
 - Answer with JSON only: no other words before or after it.
 
-The user's limits, never to be crossed: none stated beyond the rules above
+The user's limits, never to be crossed: ⟦limits⟧
 
 ===== 2. user =====
~~~~
