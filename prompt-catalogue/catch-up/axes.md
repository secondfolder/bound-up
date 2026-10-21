# Update the idea: each axis against the baseline

One value changed at a time; see baseline.md for the prompt itself.

## Narrator (`narrator`, structural, baseline `none`)

### narrator = second-person

No change.

### narrator = third-person

No change.

### narrator = impersonal

No change.

### narrator = monologue

~~~~diff
@@ -23,7 +23,7 @@
 Where: ⟦idea.setting⟧
 What it's about: ⟦idea.premise⟧
-Your role in it: ⟦idea.yourRole⟧
+Who you are to it: ⟦idea.yourRole⟧
 Tone: ⟦idea.tone⟧
-Anything else: ⟦idea.notes⟧
+Sayings to build on: ⟦idea.notes⟧
 </idea>
 
@@ -57,5 +57,5 @@
 # What to do
 
-Bring the setup up to date with the story: rewrite only the fields the story has changed, so they say where it is now, and leave every other field out. Keep each about as long as it was, in the same kind of words. Only what the story has settled, never what a passing moment suggested. Never change a name or the title.
+Bring the setup up to date with the story: rewrite only the fields the story has changed, so they say where it is now, and leave every other field out. Keep each about as long as it was, in the same kind of words, and the sayings one to a line. Only what the story has settled, never what a passing moment suggested. Never change a name or the title.
 
 # Your answer
@@ -64,9 +64,9 @@
 
 - "idea": only the idea's fields that changed; leave the others out
-  - "setting": where it happens
-  - "premise": what is going on as it starts
-  - "yourRole": who the user is in it
-  - "tone": how it should feel
-  - "notes": anything the rest leaves out
+  - "setting": where it is set, if anywhere; empty otherwise
+  - "premise": what the voice believes and keeps coming back to
+  - "yourRole": who the user is to the voice
+  - "tone": how it sounds, in a few words
+  - "notes": the sayings it builds on, 8 to 12 statements in the voice's own words, one to a line, at most 1,000 characters in all
 - "characters": only the characters who changed, each by name, with only the fields that changed
   - "name": their name, exactly as above
~~~~

## Characters (`characters`, structural, baseline `1`)

### characters = 0

~~~~diff
@@ -28,12 +28,4 @@
 </idea>
 
-Who is in it:
-<characters>
-Name: ⟦character1.name⟧
-Personality: ⟦character1.personality⟧
-Who they are to the user: ⟦character1.relationship⟧
-What they are doing or want: ⟦character1.doing⟧
-</characters>
-
 # The story so far
~~~~

### characters = 2

~~~~diff
@@ -34,4 +34,9 @@
 Who they are to the user: ⟦character1.relationship⟧
 What they are doing or want: ⟦character1.doing⟧
+
+Name: ⟦character2.name⟧
+Personality: ⟦character2.personality⟧
+Who they are to the user: ⟦character2.relationship⟧
+What they are doing or want: ⟦character2.doing⟧
 </characters>
~~~~

## Passages sent (`passages`, descriptive, baseline `1`)

### passages = 3

~~~~diff
@@ -42,4 +42,12 @@
 <story>
 ⟦passage1⟧
+
+* * *
+
+⟦passage2⟧
+
+* * *
+
+⟦passage3⟧
 </story>
~~~~

## Limits (`limits`, descriptive, baseline `none`)

### limits = set

~~~~diff
@@ -53,5 +53,8 @@
 # The user's limits
 
-None stated beyond the rules.
+Never to be crossed:
+<limits>
+⟦limits⟧
+</limits>
 
 # What to do
~~~~
