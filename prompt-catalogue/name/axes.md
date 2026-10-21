# Naming: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Characters (`characters`, structural, baseline `some`)

### characters = none

~~~~diff
@@ -17,5 +17,4 @@
 ===== 2. user =====
 A daydream has just begun. Its idea is "⟦idea.title⟧": ⟦idea.premise⟧
-With: ⟦character1.name⟧, ⟦character2.name⟧.
 
 How it opens:
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
