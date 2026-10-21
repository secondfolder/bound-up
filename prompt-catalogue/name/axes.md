# Naming: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Characters (`characters`, structural, baseline `some`)

### characters = none

~~~~diff
@@ -23,5 +23,4 @@
 Title: ⟦idea.title⟧
 What it is about: ⟦idea.premise⟧
-With: ⟦character1.name⟧, ⟦character2.name⟧
 </idea>
~~~~

## Titles already used (`taken`, structural, baseline `none`)

### taken = some

~~~~diff
@@ -34,4 +34,8 @@
 </opening>
 
+# Titles already used
+
+The user's other daydreams from the same idea are already called: "⟦taken1⟧", "⟦taken2⟧". This one's title must differ from all of them.
+
 # The user's limits
 
@@ -40,5 +44,5 @@
 # What to do
 
-Name this daydream, the kind of title someone gives a favourite story they mean to come back to: two to five evocative words, at most 80 characters, with no quotation marks inside the title itself. Borrowing words from the idea's title is fine.
+Name this daydream, the kind of title someone gives a favourite story they mean to come back to: two to five evocative words, at most 80 characters, with no quotation marks inside the title itself. Borrowing words from the idea's title is fine, and so is the idea's title, where it is short, with something added that sets this one apart.
 
 # Your answer
~~~~

## Idea dials already set (`rated`, structural, baseline `none`)

### rated = heat

~~~~diff
@@ -26,5 +26,6 @@
 </idea>
 
-No heat is set: keep to how sexual what is written already is.
+Heat: steamy: sex happens, written sensually rather than graphically.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
 
 # How it opens
~~~~

### rated = kink

~~~~diff
@@ -26,4 +26,5 @@
 </idea>
 
+Kink: kinky: BDSM and power exchange.
 No heat is set: keep to how sexual what is written already is.
~~~~

### rated = both

~~~~diff
@@ -26,5 +26,7 @@
 </idea>
 
-No heat is set: keep to how sexual what is written already is.
+Heat: steamy: sex happens, written sensually rather than graphically.
+Kink: kinky: BDSM and power exchange.
+Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
 
 # How it opens
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -36,5 +36,8 @@
 # The user's limits
 
-None stated beyond the rules.
+Never to be crossed:
+<limits>
+⟦limits⟧
+</limits>
 
 # What to do
~~~~
