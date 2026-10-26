# Sliders

Every slider in Bound Up is
[`Slider.svelte`](../src/lib/components/Slider.svelte), or a component built
on it. Nothing renders `wa-slider` itself. Web Awesome's slider does several
things this app wants done differently everywhere, and fixing them once, in
one place, is the point: a feature's slider is the base slider plus whatever
only makes sense for that feature.

| Slider                                                               | What it adds                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`OptionalSlider`](../src/lib/components/OptionalSlider.svelte)      | The level in words beside the base slider's Clear, following the knob; `titleHidden` for one titled by its row |
| [`IntensitySlider`](../src/lib/components/iq-test/IntensitySlider.svelte) | The IQ test's level, changing as the knob passes each notch, and a compact form for the dock |
| [`SoundControl`](../src/lib/components/iq-test/SoundControl.svelte)  | A volume: continuous, beside a mute toggle                       |
| [`ListFilters`](../src/lib/components/kink-list/ListFilters.svelte)  | The kink list's two limits, each with its reading                |
| `DaydreamDials`                                                      | A story's intensity and pace, with their readings                |

The one range input that is not one is `iq-test/ClipScrubber.svelte`: a
clip's progress bar, scrubbed, which is a different control from a setting
and is styled as part of the clip.

## What the base slider does

**Notched**, the default, for values that are steps on a scale:

- **The knob moves freely while dragged** (a step of a hundredth of a notch)
  and **springs onto the nearest notch when let go**, quickly, with a slight
  overshoot, or jumps there under `prefers-reduced-motion`. Web Awesome's
  notched slider jumps notch to notch under the finger instead, which reads as
  stuck rather than stepped.
- `oninput` tells of each notch the knob passes, once; `onchange` tells of
  the notch it settled on: let go, a click on the track, or a key.
- **The keyboard moves a whole notch.** The arrow keys and Page Up/Down are
  caught on the host ahead of the slider's own handler, which would move by
  the drag step.
- **The notches are drawn by us**, as dots over the track, light on the
  filled part and dark on the rest, shaded by where the knob is right now.
  Web Awesome's `with-markers` would put one at every drag step, and its own
  dots, in the surface colour, all but vanish on the unfilled track. They are
  a stylesheet adopted into the slider's shadow root, since the track is in
  there. Past 20 notches none are drawn.

**Continuous** (`notched={false}`): Web Awesome's slider at `step`, with
`oninput` on every move and `onchange` when let go. For a volume.

**Unset** (`value={null}`): a slider that may say nothing, rather than
something middling. The bare knob sits at `restingValue` (the middle notch
unless said) with no filled track; greyed out instead, it looked disabled.
The fill shows once it is held or moved, and pressing it without moving it
sets the level it rests at, since it already looks like a level. The slider
sends no `change` for a press that did not move it, so the base slider does,
a task after the pointer comes up.

**Clearable** (`onclear`): an unset slider that can go back to unset once
set. A row above the track holds the title at the left and, at the right,
Clear while there is a value, after any `status` (the level in words, in
`OptionalSlider`). The row is drawn by the base slider rather than put in
the slider's label, which is a `<label>`, and a button must not go in one:
the slider keeps its label for its accessible name, out of sight, and the
row's title is hidden from assistive tech instead. Clear's name ends in
hidden text ("Clear heat"), so two on a page are told apart. `labelHidden`
leaves the title out of the row and keeps Clear. The menu item's rating
(docs/scenes.md) and every `OptionalSlider` use it.

**Everything else:**

- **Controlled.** `value` is the level; a new one is asked for through
  `onchange`. A value set from outside moves the knob, unless it is held or
  springing.
- `format` is what a screen reader announces instead of a bare number.
- `labelHidden` keeps the slider named to a screen reader but not shown, for
  one named some other way on screen, and takes away the room Web Awesome
  leaves above the track for the label, so the track sits in the middle of its
  row.
- `low` and `high` are the words under the track's two ends.
- `ondrag` says when a drag begins and ends, from the pointer going down on it
  to it coming up anywhere; the IQ test's dock holds still for it.
- Its events are wired by hand, not with `oninput=`: they come from inside a
  shadow root, which Svelte's delegated handlers do not reliably see
  (AGENTS.md).

## Extending it

A behaviour any slider could want goes in the base slider. One that only
makes sense for one feature goes in a component wrapping it, as the table
above does. Style the slider inside a wrapper with `:global(wa-slider)` from
the wrapper's own class, since the slider's scoped styles are its own.

## Tests

`components/Slider.svelte.test.ts`: dragging freely and telling of each notch
once, springing onto the nearest notch, a whole notch from the keyboard, an
unset slider set by a press, continuous, a value set from outside, and Clear
on a clearable one, there only while it has a value. The
features' own tests cover what each adds.
