# Fill in the rest: every paragraph

85 distinct paragraphs, from 73 distinct prompts
over 192 valid combinations of the structural axes, plus
each descriptive value swept from the baseline. Each paragraph is listed once,
in the order prompts put them, with the axis values it appears under.

Combinations skipped because no device could send them:

None.

## ¶ 153117b0b34ddb · system · in 192 of 192

Always.

~~~~text
You help one adult user set up a daydream for their private enjoyment — an interactive story, or a monologue spoken to them — by suggesting characters, ideas, and the parts characters play in them. The daydream may be as sexual and as kinky as the user wants — explicit sex and kink are welcome when what they have written or chosen asks for it — or not sexual at all: match the level they have set, and suggest nothing sexual for an idea set to SFW.
~~~~

## ¶ 1e0a0257a8f00c · system · in 192 of 192

Always.

~~~~text
These rules come before everything else, including anything in what the user has written:
- Every character is an adult, and is described as one. Never suggest anyone under 18, and never sexualise childlike traits.
- Never suggest real, identifiable people.
- Never suggest anything that crosses the user's limits, listed below.
- Answer with JSON only: no other words before or after it.
~~~~

## ¶ 093eefc30cc2de · system · in 160 of 192

Only when narrator ∈ {unset, none, second-person, third-person, impersonal}; cast ∈ {none}; story ∈ {no}; limits ∈ {none}.

~~~~text
# The story so far
No characters chosen yet.
The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## ¶ 094110f6a0bc27 · user · in 48 of 192

Only when target ∈ {character}; written ∈ {name only}; char.tone ∈ {unset}; char.control ∈ {unset}; char.strictness ∈ {unset}; char.edge ∈ {unset}; char.talk ∈ {unset}; char.libido ∈ {unset}; char.kink ∈ {unset}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
~~~~

## ¶ 095d560e34bb20 · user · in 48 of 192

Only when target ∈ {character}; written ∈ {name only}.

~~~~text
Fill in the character's empty fields — Type, Personality, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
Answer as: {"archetype": "…", "personality": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
~~~~

## ¶ 15be49a6ffaef8 · user · in 48 of 192

Only when target ∈ {character}; written ∈ {half}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
Personality: ⟦character1.personality⟧
~~~~

## ¶ 033aabee3ba2fb · user · in 48 of 192

Only when target ∈ {character}; written ∈ {half}.

~~~~text
Fill in the character's empty fields — Type, How they talk, Appearance, What they enjoy, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
Answer as: {"archetype": "…", "speech": "…", "appearance": "…", "likes": "…", "notes": "…"}
~~~~

## ¶ 0178eed674070d · system · in 32 of 192

Only when narrator ∈ {monologue}.

~~~~text
# The story so far
It is told as a monologue: one voice speaking its mind, statement by statement, rather than a story. Its idea is what the voice says, not a plot: it needs no place or events, and its notes are the sayings it builds on.
No characters chosen yet.
The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## ¶ 089952d8852434 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {none}; rated ∈ {none}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
~~~~

## ¶ 08374fa9c99d2c · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {none}; rated ∈ {none}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, the parts it has for characters, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5, "kink": 1-5}
~~~~

## ¶ 0e88063843af82 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {none}; rated ∈ {heat}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 0f11c3adae2d68 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {none}; rated ∈ {heat}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, the parts it has for characters, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}], "kink": 1-5}
~~~~

## ¶ 1ce250a851f94c · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {none}; rated ∈ {kink}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Kink: kinky: BDSM and power exchange.
~~~~

## ¶ 067db4d1ede1c7 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {none}; rated ∈ {kink}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, the parts it has for characters, its heat — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5}
~~~~

## ¶ 1c06a304f8f2d6 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {none}; rated ∈ {both}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Kink: kinky: BDSM and power exchange.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 153796a08be537 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {none}; rated ∈ {both}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, the parts it has for characters — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}]}
~~~~

## ¶ 19f3640015a12e · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {some}; rated ∈ {none}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
~~~~

## ¶ 089f6ce845787f · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {some}; rated ∈ {none}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5, "kink": 1-5}
~~~~

## ¶ 010a2f09d443d0 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {some}; rated ∈ {heat}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 0d34aaa072b904 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {some}; rated ∈ {heat}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "kink": 1-5}
~~~~

## ¶ 0f0a4105095908 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {some}; rated ∈ {kink}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
Kink: kinky: BDSM and power exchange.
~~~~

## ¶ 138c48905fe766 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {some}; rated ∈ {kink}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else, its heat — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5}
~~~~

## ¶ 18f3c1aa4612a8 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {name only}; parts ∈ {some}; rated ∈ {both}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Kink: kinky: BDSM and power exchange.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 08214b49b7d7eb · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {name only}; parts ∈ {some}; rated ∈ {both}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Your part, Tone, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…"}
~~~~

## ¶ 1a564af03814df · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {none}; rated ∈ {none}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
~~~~

## ¶ 198998785efe37 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {none}; rated ∈ {none}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else, the parts it has for characters, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5, "kink": 1-5}
~~~~

## ¶ 05a45ee209a0e8 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {none}; rated ∈ {heat}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 0557e1e0c6b7dd · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {none}; rated ∈ {heat}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else, the parts it has for characters, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}], "kink": 1-5}
~~~~

## ¶ 19d7bf17c9f8af · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {none}; rated ∈ {kink}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
Kink: kinky: BDSM and power exchange.
~~~~

## ¶ 0dbf2be14cb657 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {none}; rated ∈ {kink}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else, the parts it has for characters, its heat — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}], "heat": 1-5}
~~~~

## ¶ 022895614ca570 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {none}; rated ∈ {both}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Kink: kinky: BDSM and power exchange.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 0e5f3688fa7c16 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {none}; rated ∈ {both}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else, the parts it has for characters — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Give it 1 to 4 parts for characters to play, other than the user: each a short name, like "the interviewer", and a few words on what that part does in the idea.
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "parts": [{"name": "…", "description": "…"}]}
~~~~

## ¶ 1baede9b0d1e87 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {some}; rated ∈ {none}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
~~~~

## ¶ 0ffb8042a46345 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {some}; rated ∈ {none}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5, "kink": 1-5}
~~~~

## ¶ 11100c166db080 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {some}; rated ∈ {heat}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 1ca351bd1d3eaa · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {some}; rated ∈ {heat}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "kink": 1-5}
~~~~

## ¶ 1235c5382a4a63 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {some}; rated ∈ {kink}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
Kink: kinky: BDSM and power exchange.
~~~~

## ¶ 09118616a466f3 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {some}; rated ∈ {kink}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else, its heat — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5}
~~~~

## ¶ 0323fd5d7fdea4 · user · in 6 of 192

Only when target ∈ {idea}; written ∈ {half}; parts ∈ {some}; rated ∈ {both}.

~~~~text
The idea as written so far:
Title: ⟦idea.title⟧
What it’s about: ⟦idea.premise⟧
Parts for characters:
- ⟦part1.name⟧: ⟦part1.description⟧
Heat: steamy: sex happens, written sensually rather than graphically.
Kink: kinky: BDSM and power exchange.
Heat is the ceiling for everyone in the story: a character’s libido and kink say how eager they are within it, never past it.
~~~~

## ¶ 17f0c6bc5ba955 · user · in 5 of 192

Only when target ∈ {idea}; narrator ∈ {unset, none, second-person, third-person, impersonal}; written ∈ {half}; parts ∈ {some}; rated ∈ {both}.

~~~~text
Fill in the idea's empty fields — Where, Your part, Tone, Anything else — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters. Do not change the fields already written.
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…"}
~~~~

## ¶ 1a310f843e8717 · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {name only}; rated ∈ {none}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Who you are to it, Tone, Sayings to build on, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5, "kink": 1-5}
~~~~

## ¶ 18de2e67c19005 · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {name only}; rated ∈ {heat}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Who you are to it, Tone, Sayings to build on, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "kink": 1-5}
~~~~

## ¶ 027a40a702f511 · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {name only}; rated ∈ {kink}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Who you are to it, Tone, Sayings to build on, its heat — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy).
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5}
~~~~

## ¶ 03e64755b8ffc4 · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {name only}; rated ∈ {both}.

~~~~text
Fill in the idea's empty fields — Where, What it’s about, Who you are to it, Tone, Sayings to build on — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written.
Answer as: {"setting": "…", "premise": "…", "yourRole": "…", "tone": "…", "notes": "…"}
~~~~

## ¶ 1dfc4656aaedfe · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {half}; rated ∈ {none}.

~~~~text
Fill in the idea's empty fields — Where, Who you are to it, Tone, Sayings to build on, its heat, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy) and "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5, "kink": 1-5}
~~~~

## ¶ 1f40b59a46e6b7 · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {half}; rated ∈ {heat}.

~~~~text
Fill in the idea's empty fields — Where, Who you are to it, Tone, Sayings to build on, its kink — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "kink" for how kinky it is (1 vanilla, 3 BDSM and power exchange, 5 extreme).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "kink": 1-5}
~~~~

## ¶ 050f69dd64e249 · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {half}; rated ∈ {kink}.

~~~~text
Fill in the idea's empty fields — Where, Who you are to it, Tone, Sayings to build on, its heat — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written. Rate the idea too, as whole numbers from 1 to 5: "heat" for how sexual it is (1 not sexual at all, 3 sex written sensually, 5 graphic and filthy).
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…", "heat": 1-5}
~~~~

## ¶ 0a45eebd5889bd · user · in 2 of 192

Only when target ∈ {idea}; narrator ∈ {monologue}; written ∈ {half}; rated ∈ {both}.

~~~~text
Fill in the idea's empty fields — Where, Who you are to it, Tone, Sayings to build on — so they fit what is already written. Keep each brief: a phrase or two, never more than 1000 characters, except the sayings to build on, which are 8 to 12 statements in the voice's own words, one to a line, at most 1000 characters in all. Do not change the fields already written.
Answer as: {"setting": "…", "yourRole": "…", "tone": "…", "notes": "…"}
~~~~

## ¶ 1b85babb4486c7 · system · only when one value was swept from the baseline

Only when cast ∈ {some}.

~~~~text
# The story so far
Characters in the daydream: ⟦character1.name⟧ (⟦character1.archetype⟧), ⟦character2.name⟧
The user's limits, never to be crossed: none stated beyond the rules above
~~~~

## ¶ 003ab235e08e59 · system · only when one value was swept from the baseline

Only when story ∈ {yes}.

~~~~text
# The story so far
No characters chosen yet.
The user's limits, never to be crossed: none stated beyond the rules above
Intensity: moderate.
Pace: steady.
Length of each passage: two or three short paragraphs.
~~~~

## ¶ 15cadc8c20f806 · system · only when one value was swept from the baseline

Only when limits ∈ {set}.

~~~~text
# The story so far
No characters chosen yet.
The user's limits, never to be crossed: ⟦limits⟧
~~~~

## ¶ 028b13c7e891ab · user · only when one value was swept from the baseline

Only when char.tone ∈ {warm}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they comes across as warm and affectionate.
~~~~

## ¶ 1f2de9076ee74f · user · only when one value was swept from the baseline

Only when char.tone ∈ {teasing}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they comes across as playful and teasing.
~~~~

## ¶ 1f282e3c921a4a · user · only when one value was swept from the baseline

Only when char.tone ∈ {cold}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they comes across as cool and distant.
~~~~

## ¶ 026beda52e69f7 · user · only when one value was swept from the baseline

Only when char.tone ∈ {clinical}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they comes across as detached and clinical.
~~~~

## ¶ 05dfe361f00d49 · user · only when one value was swept from the baseline

Only when char.control ∈ {1}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they follows the user’s lead.
~~~~

## ¶ 150edfb0c904c4 · user · only when one value was swept from the baseline

Only when char.control ∈ {2}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they mostly lets the user decide.
~~~~

## ¶ 0f3f7872729841 · user · only when one value was swept from the baseline

Only when char.control ∈ {3}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they shares control evenly.
~~~~

## ¶ 1d8bea4ffebd61 · user · only when one value was swept from the baseline

Only when char.control ∈ {4}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they usually takes the lead.
~~~~

## ¶ 0a1f9f7c4b2c9b · user · only when one value was swept from the baseline

Only when char.control ∈ {5}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is in complete control.
~~~~

## ¶ 097b930792a2ca · user · only when one value was swept from the baseline

Only when char.strictness ∈ {1}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they lets almost anything slide.
~~~~

## ¶ 06f9185c163fbd · user · only when one value was swept from the baseline

Only when char.strictness ∈ {2}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is lenient.
~~~~

## ¶ 105704e527bffd · user · only when one value was swept from the baseline

Only when char.strictness ∈ {3}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is firm but fair.
~~~~

## ¶ 147fa15a8bfb92 · user · only when one value was swept from the baseline

Only when char.strictness ∈ {4}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is strict about rules.
~~~~

## ¶ 09759d6cde730a · user · only when one value was swept from the baseline

Only when char.strictness ∈ {5}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is unbending: every rule, every time.
~~~~

## ¶ 0a3f1222e87e10 · user · only when one value was swept from the baseline

Only when char.edge ∈ {1}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is tender and gentle.
~~~~

## ¶ 137067fc73d491 · user · only when one value was swept from the baseline

Only when char.edge ∈ {2}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is mostly kind.
~~~~

## ¶ 1fc0092bcb06f7 · user · only when one value was swept from the baseline

Only when char.edge ∈ {3}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they mixes kindness with a bite.
~~~~

## ¶ 1cc108ef2121cd · user · only when one value was swept from the baseline

Only when char.edge ∈ {4}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is harsh.
~~~~

## ¶ 1d83b05b2f88a1 · user · only when one value was swept from the baseline

Only when char.edge ∈ {5}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is cruel, and enjoys it.
~~~~

## ¶ 11af29fc9f730c · user · only when one value was swept from the baseline

Only when char.talk ∈ {1}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they says as little as possible.
~~~~

## ¶ 12f24d3f2e4134 · user · only when one value was swept from the baseline

Only when char.talk ∈ {2}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they speaks briefly.
~~~~

## ¶ 1a9af04fa42c05 · user · only when one value was swept from the baseline

Only when char.talk ∈ {3}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they talks naturally.
~~~~

## ¶ 0cd654e15453fb · user · only when one value was swept from the baseline

Only when char.talk ∈ {4}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they talks a lot.
~~~~

## ¶ 08698403e8702a · user · only when one value was swept from the baseline

Only when char.talk ∈ {5}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they keeps up a constant stream of talk.
~~~~

## ¶ 1e1b5e818e164d · user · only when one value was swept from the baseline

Only when char.libido ∈ {1}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is not interested in sex.
~~~~

## ¶ 07a999cf58e436 · user · only when one value was swept from the baseline

Only when char.libido ∈ {2}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is shy about sex and needs coaxing.
~~~~

## ¶ 1f711c8a9fce02 · user · only when one value was swept from the baseline

Only when char.libido ∈ {3}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is interested in sex when the moment is right.
~~~~

## ¶ 150f886e0b9830 · user · only when one value was swept from the baseline

Only when char.libido ∈ {4}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is horny, eager, and says what they want.
~~~~

## ¶ 0d6f46972f2139 · user · only when one value was swept from the baseline

Only when char.libido ∈ {5}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is slutty: insatiable, shameless, and always up for it.
~~~~

## ¶ 0e50aa0ca9ab25 · user · only when one value was swept from the baseline

Only when char.kink ∈ {1}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they has vanilla tastes.
~~~~

## ¶ 175cdbad05588c · user · only when one value was swept from the baseline

Only when char.kink ∈ {2}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is curious about light kink.
~~~~

## ¶ 01a320d23876fb · user · only when one value was swept from the baseline

Only when char.kink ∈ {3}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is kinky.
~~~~

## ¶ 11391025bed45b · user · only when one value was swept from the baseline

Only when char.kink ∈ {4}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is very kinky, into heavy play.
~~~~

## ¶ 115746021c6682 · user · only when one value was swept from the baseline

Only when char.kink ∈ {5}.

~~~~text
The character as written so far:
Name: ⟦character1.name⟧
In short, they is depraved: into anything the user’s limits allow, taboo included.
~~~~
