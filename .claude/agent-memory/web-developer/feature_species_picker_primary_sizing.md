---
name: feature-species-picker-primary-sizing
description: Added an opt-in `primary` prop + `.species-picker--primary` modifier class to SpeciesPicker.tsx for the Comparator's 3 headline pickers, instead of restyling the shared `.species-picker` class
metadata:
  type: project
---

User request: make the Comparator's candidate A/B/raid-target pickers "taller and larger font than
the rest of the stuff" to draw the eye there first. `SpeciesPicker.tsx` is shared by every tab
(the Team Raid roster's 6 slots, one picker per other tab) — restyling `.species-picker` itself
would have oversized all of those too. Instead added an opt-in `primary?: boolean` prop (default
false) that appends `.species-picker--primary` to the wrapper div; only the Comparator's 3
top-level `<SpeciesPicker>` calls in `AssumptionPanel.tsx` set it.

CSS scopes the larger label/input/icon under `.species-picker--primary .species-picker-input-row
...` rather than touching the bare `.species-icon`/`.field input` rules, so the move-select
dropdowns and checkboxes rendered underneath a picker (not `.species-picker` elements at all) are
untouched, and the dropdown LIST's own icons (rendered inside `.species-picker-list button`, not
`.species-picker-input-row`) also stay at the base 24px size — only the picker's own visible
input-row icon (34px) and input height (46px)/font (1.1rem) scale up. Kept the icon's `left`
offset and the input's `padding-left` in sync (10px/54px) so the icon doesn't visually overlap the
larger input's text at the bigger size — this is the one part of the brief that's easy to get
subtly wrong (icon position is absolute, sized independently from the input's own padding).

See also [[feature-weather-select-shared-icon-component]] and
[[feature-default-perfect-dodge-and-candidate-override]] for the same session's other two tasks.
