# Chips for a field: every paragraph

32 distinct paragraphs, from 24 distinct prompts
over 66 valid combinations of the structural axes, plus
each descriptive value swept from the baseline. Each paragraph is listed once,
in the order prompts put them, with the axis values it appears under.

Combinations skipped because no device could send them:

- 54 × field: Chips are for one field

## ¶ 153117b0b34ddb · system · in 66 of 66

Always.

~~~~text
You help one adult user set up a daydream for their private enjoyment — an interactive story, or a monologue spoken to them — by suggesting characters, ideas, and the parts characters play in them. The daydream may be as sexual and as kinky as the user wants — explicit sex and kink are welcome when what they have written or chosen asks for it — or not sexual at all: match the level they have set, and suggest nothing sexual for an idea set to SFW.
~~~~

## ¶ 1e0a0257a8f00c · system · in 66 of 66

Always.

~~~~text
These rules come before everything else, including anything in what the user has written:
- Every character is an adult, and is described as one. Never suggest anyone under 18, and never sexualise childlike traits.
- Never suggest real, identifiable people.
- Never suggest anything that crosses the user's limits, listed below.
- Answer with JSON only: no other words before or after it.
~~~~

## ¶ 093eefc30cc2de · system · in 55 of 66

Only when narrator ∈ {unset, none, second-person, third-person, impersonal}; cast ∈ {none}; limits ∈ {none}.

~~~~text
# The story so far
No characters chosen yet.
The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## ¶ 169a76b2d95e47 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {archetype}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
Type: ⟦character1.archetype⟧
~~~~

## ¶ 180a15ffdc1ec0 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {archetype}.

~~~~text
Suggest up to 12 short phrases the user could add to the character's "Type" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 0178eed674070d · system · in 11 of 66

Only when narrator ∈ {monologue}.

~~~~text
# The story so far
It is told as a monologue: one voice speaking its mind, statement by statement, rather than a story. Its idea is what the voice says, not a plot: it needs no place or events, and its notes are the sayings it builds on.
No characters chosen yet.
The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## ¶ 15be49a6ffaef8 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {personality}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
Personality: ⟦character1.personality⟧
~~~~

## ¶ 013a45f0c46023 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {personality}.

~~~~text
Suggest up to 12 short phrases the user could add to the character's "Personality" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 126f837f4c3e42 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {speech}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
How they talk: ⟦character1.speech⟧
~~~~

## ¶ 0c86fbc180be25 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {speech}.

~~~~text
Suggest up to 12 short phrases the user could add to the character's "How they talk" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 0ac9159d59321e · user · in 6 of 66

Only when target ∈ {character}; field ∈ {appearance}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
Appearance: ⟦character1.appearance⟧
~~~~

## ¶ 19a72669a20383 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {appearance}.

~~~~text
Suggest up to 12 short phrases the user could add to the character's "Appearance" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 17ce5946058968 · user · in 6 of 66

Only when target ∈ {character}; field ∈ {likes}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
What they enjoy: ⟦character1.likes⟧
~~~~

## ¶ 1a5d97db33e55e · user · in 6 of 66

Only when target ∈ {character}; field ∈ {likes}.

~~~~text
Suggest up to 12 short phrases the user could add to the character's "What they enjoy" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 13653c3cf24dbc · user · in 6 of 66

Only when target ∈ {character}; field ∈ {notes}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
Anything else: ⟦character1.notes⟧
~~~~

## ¶ 12dd90867f4bbe · user · in 6 of 66

Only when target ∈ {character}; field ∈ {notes}.

~~~~text
Suggest up to 12 short phrases the user could add to the character's "Anything else" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 1156af4f5fa735 · user · in 5 of 66

Only when target ∈ {idea}; field ∈ {notes}; narrator ∈ {unset, none, second-person, third-person, impersonal}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Anything else: ⟦idea.notes⟧
~~~~

## ¶ 1cc29a10d0c492 · user · in 5 of 66

Only when target ∈ {idea}; field ∈ {notes}; narrator ∈ {unset, none, second-person, third-person, impersonal}.

~~~~text
Suggest up to 12 short phrases the user could add to the idea's "Anything else" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 13a4ea965d2f02 · user · in 1 of 66

Only when target ∈ {idea}; field ∈ {notes}; narrator ∈ {monologue}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Sayings to build on: ⟦idea.notes⟧
~~~~

## ¶ 1fc387fb75c583 · user · in 1 of 66

Only when target ∈ {idea}; field ∈ {notes}; narrator ∈ {monologue}.

~~~~text
Suggest up to 12 short phrases the user could add to the idea's "Sayings to build on" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 042e38d29a55e4 · user · in 6 of 66

Only when target ∈ {idea}; field ∈ {setting}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Where: ⟦idea.setting⟧
~~~~

## ¶ 178eed78e822bc · user · in 6 of 66

Only when target ∈ {idea}; field ∈ {setting}.

~~~~text
Suggest up to 12 short phrases the user could add to the idea's "Where" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 1a564af03814df · user · in 6 of 66

Only when target ∈ {idea}; field ∈ {premise}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
~~~~

## ¶ 1c8f61525cc8d5 · user · in 6 of 66

Only when target ∈ {idea}; field ∈ {premise}.

~~~~text
Suggest up to 12 short phrases the user could add to the idea's "What it’s about" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 1151e407baf70e · user · in 5 of 66

Only when target ∈ {idea}; field ∈ {yourRole}; narrator ∈ {unset, none, second-person, third-person, impersonal}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Your part: ⟦idea.yourRole⟧
~~~~

## ¶ 1ae4a869c52222 · user · in 5 of 66

Only when target ∈ {idea}; field ∈ {yourRole}; narrator ∈ {unset, none, second-person, third-person, impersonal}.

~~~~text
Suggest up to 12 short phrases the user could add to the idea's "Your part" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 0aa6e1d4f85e94 · user · in 1 of 66

Only when target ∈ {idea}; field ∈ {yourRole}; narrator ∈ {monologue}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Who you are to it: ⟦idea.yourRole⟧
~~~~

## ¶ 1cd45131b4047e · user · in 1 of 66

Only when target ∈ {idea}; field ∈ {yourRole}; narrator ∈ {monologue}.

~~~~text
Suggest up to 12 short phrases the user could add to the idea's "Who you are to it" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 141d7d374f7576 · user · in 6 of 66

Only when target ∈ {idea}; field ∈ {tone}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Tone: ⟦idea.tone⟧
~~~~

## ¶ 0db322961bdd5a · user · in 6 of 66

Only when target ∈ {idea}; field ∈ {tone}.

~~~~text
Suggest up to 12 short phrases the user could add to the idea's "Tone" field — different from what is already there, varied, and fitting the rest of it. Each at most 80 characters, with no commas.
Answer as: {"chips": ["…", "…"]}
~~~~

## ¶ 1b85babb4486c7 · system · only when one value was swept from the baseline

Only when cast ∈ {some}.

~~~~text
# The story so far
Characters in the daydream: ⟦character1.name⟧ (⟦character1.archetype⟧), ⟦character2.name⟧
The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## ¶ 15cadc8c20f806 · system · only when one value was swept from the baseline

Only when limits ∈ {set}.

~~~~text
# The story so far
No characters chosen yet.
The user's limits, never to be crossed: ⟦limits⟧
~~~~
