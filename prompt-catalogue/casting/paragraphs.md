# Casting: every paragraph

16 distinct paragraphs, from 9 distinct prompts
over 12 valid combinations of the structural axes, plus
each descriptive value swept from the baseline. Each paragraph is listed once,
in the order prompts put them, with the axis values it appears under.

Combinations skipped because no device could send them:

None.

## ¶ 153117b0b34ddb · system · in 12 of 12

Always.

~~~~text
You help one adult user set up a daydream for their private enjoyment — an interactive story, or a monologue spoken to them — by suggesting characters, ideas, and the parts characters play in them. The daydream may be as sexual and as kinky as the user wants — explicit sex and kink are welcome when what they have written or chosen asks for it — or not sexual at all: match the level they have set, and suggest nothing sexual for an idea set to SFW.
~~~~

## ¶ 1e0a0257a8f00c · system · in 12 of 12

Always.

~~~~text
These rules come before everything else, including anything in what the user has written:
- Every character is an adult, and is described as one. Never suggest anyone under 18, and never sexualise childlike traits.
- Never suggest real, identifiable people.
- Never suggest anything that crosses the user's limits, listed below.
- Answer with JSON only: no other words before or after it.
~~~~

## ¶ 1e92f65baf4a23 · system · in 12 of 12

Only when limits ∈ {none}.

~~~~text
The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## ¶ 18d83644fa7ef0 · user · in 12 of 12

Always.

~~~~text
The character, as they are in any story:
Name: ⟦character1.name⟧
Type: ⟦character1.archetype⟧
Personality: ⟦character1.personality⟧
~~~~

## ¶ 08b853dc815453 · user · in 12 of 12

Always.

~~~~text
The idea:
Title: ⟦idea.title⟧
Where: ⟦idea.setting⟧
What it’s about: ⟦idea.premise⟧
~~~~

## ¶ 150ba2aae31d98 · user · in 2 of 12

Only when stance ∈ {self, persona}; part ∈ {none}; others ∈ {none}.

~~~~text
⟦character1.name⟧ has no particular part in the idea. Nobody else is in the story. The user is in the story.
~~~~

## ¶ 075bb5863b6a4b · user · in 8 of 12

Only when stance ∈ {self, persona}.

~~~~text
Say who this character is in this story: who they are to the user, in a few words, and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
Answer as: {"relationship": "…", "part": "…"}
~~~~

## ¶ 1f71b3a4fd5250 · user · in 2 of 12

Only when stance ∈ {self, persona}; part ∈ {none}; others ∈ {some}.

~~~~text
⟦character1.name⟧ has no particular part in the idea. Also in the story: ⟦character2.name⟧ (⟦part2.name⟧). The user is in the story.
~~~~

## ¶ 1958defa424f6d · user · in 2 of 12

Only when stance ∈ {self, persona}; part ∈ {some}; others ∈ {none}.

~~~~text
⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is in the story.
~~~~

## ¶ 13aeaf1c7664aa · user · in 2 of 12

Only when stance ∈ {self, persona}; part ∈ {some}; others ∈ {some}.

~~~~text
⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Also in the story: ⟦character2.name⟧ (⟦part2.name⟧). The user is in the story.
~~~~

## ¶ 0a8932894d71ca · user · in 1 of 12

Only when stance ∈ {absent}; part ∈ {none}; others ∈ {none}.

~~~~text
⟦character1.name⟧ has no particular part in the idea. Nobody else is in the story. The user is not in the story: they watch it from outside.
~~~~

## ¶ 108ee4aba2aaa2 · user · in 4 of 12

Only when stance ∈ {absent}.

~~~~text
Say who this character is in this story: who they are to the user (or to the others, since the user only watches), in a few words, and what they are doing or want as the idea starts, in a sentence. Fit both to the idea and the part, and to who they are.
Answer as: {"relationship": "…", "part": "…"}
~~~~

## ¶ 1087830ab9ffa6 · user · in 1 of 12

Only when stance ∈ {absent}; part ∈ {none}; others ∈ {some}.

~~~~text
⟦character1.name⟧ has no particular part in the idea. Also in the story: ⟦character2.name⟧ (⟦part2.name⟧). The user is not in the story: they watch it from outside.
~~~~

## ¶ 1c7e90f19fc39c · user · in 1 of 12

Only when stance ∈ {absent}; part ∈ {some}; others ∈ {none}.

~~~~text
⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Nobody else is in the story. The user is not in the story: they watch it from outside.
~~~~

## ¶ 0ff6fbbe7c9e30 · user · in 1 of 12

Only when stance ∈ {absent}; part ∈ {some}; others ∈ {some}.

~~~~text
⟦character1.name⟧ plays the part of ⟦part1.name⟧: ⟦part1.description⟧. Also in the story: ⟦character2.name⟧ (⟦part2.name⟧). The user is not in the story: they watch it from outside.
~~~~

## ¶ 1ba0fcbbf2d8dc · system · only when one value was swept from the baseline

Only when limits ∈ {set}.

~~~~text
The user's limits, never to be crossed: ⟦limits⟧
~~~~
