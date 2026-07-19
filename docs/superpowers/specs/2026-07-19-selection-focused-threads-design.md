# Selection-focused follow-up threads

## Goal

Allow users to select text inside an assistant response and open an AskAside
thread that focuses follow-up questions on exactly that passage. Removing the
passage from the thread changes subsequent questions back to the whole anchored
assistant response without discarding the thread.

## Scope

The feature applies only to non-empty text selections contained entirely within
one assistant response on ChatGPT or Gemini. Selections in user messages,
selections crossing message boundaries, and whitespace-only selections do not
activate the feature.

The existing question-mark button in each assistant response toolbar remains
available and continues to open a whole-response thread without a selected
passage.

## Interaction design

After a valid selection, a compact red circular question-mark button appears
above the end of the selection. Its placement is viewport-aware so it remains
visible near screen edges. The button disappears when the selection changes,
the user clicks elsewhere, presses Escape, scrolls, or resizes the viewport.

Clicking the button copies the selected plain text immediately and opens the
existing floating thread anchored to the assistant response that contains it.
The native selection may then disappear without losing the reference.

Above the thread input, a reference box contains:

- a right-pointing arrow on the left;
- the selected text in quotation marks in the middle; and
- an accessible close button on the right.

Long selections wrap inside the box without widening the panel. Activating the
close button removes only the selected-passage reference. It does not close the
panel, clear prior messages, or remove the anchored response. The input remains
focused, and future questions refer to the whole anchored response.

## State and data flow

The content script owns ephemeral selection state consisting of the anchored
assistant response, the copied selected text, and the trigger position. This
state is never persisted.

Each user turn in the side thread records the selected passage that was active
when that turn was submitted. The background request builder adds an explicit
passage-focus instruction to that user turn when a passage is present. A user
turn submitted after the reference box has been removed has no passage-focus
instruction and therefore refers to the whole anchored response.

This per-turn association preserves the meaning of earlier questions when the
reference is later removed. The API still receives the main conversation up to
and including the anchored assistant response, because the selected text is a
focus within that context rather than a replacement for it.

Threads, selected text, and per-turn references remain in memory only and are
discarded when the panel closes, matching current AskAside privacy behavior.

## Components and responsibilities

### Site adapters

Adapters identify whether a DOM node or range belongs to an assistant response
and resolve it to the same message object used for whole-response threads. Site
specific DOM knowledge remains in `adapters.js`.

### Content script

The content script validates selections, positions and manages the floating
question-mark trigger, renders the reference box, opens the thread with an
optional selected passage, and attaches the active passage to each submitted
user turn.

The selection trigger should live in the existing isolated overlay so host-page
styles cannot affect it. It must not modify the chat page's message markup.

### Background script

The background script serializes each user turn with its optional selected
passage into unambiguous prompt text. Both Anthropic and OpenRouter use the same
constructed message list, so their behavior stays equivalent.

## Failure and edge behavior

- Empty, whitespace-only, cross-message, and non-assistant selections are
  ignored.
- A new valid selection replaces the pending selection trigger.
- Selection text is copied before opening the thread so loss of the browser
  selection does not lose the reference.
- If the assistant response can no longer be resolved after a host-page DOM
  update, the thread is not opened.
- Removing a selected passage while a request is in flight affects only later
  user turns; the submitted turn retains its captured reference.
- Escape continues to close an open panel. When the panel is closed, Escape may
  dismiss a visible selection trigger.
- Existing whole-response behavior and thread clearing remain unchanged.

## Accessibility and presentation

The floating trigger and reference removal control are native buttons with
English accessible labels consistent with the current extension UI. Focus
styles remain visible. The trigger and reference box use existing theme tokens
for light and dark mode, while the trigger retains AskAside's red accent.

The reference box supports wrapped multiline text and constrains overflow within
resized and narrow panels. Reduced-motion preferences require no special
animation because the new controls do not animate.

## Verification

Manual verification covers Chrome and Firefox on ChatGPT and Gemini:

1. Select assistant text forward, backward, and across multiple visual lines.
2. Confirm the trigger appears at the selection end and remains in the viewport.
3. Confirm invalid selections do not show a trigger.
4. Open a thread and verify that the reference box displays the exact copied
   plain text in quotation marks.
5. Submit multiple focused questions and verify the selected passage is sent
   with each turn.
6. Remove the reference and verify the thread remains intact, input stays
   usable, and subsequent questions refer to the whole response.
7. Verify that earlier focused turns retain their passage association.
8. Open a thread from the existing toolbar button and verify unchanged
   whole-response behavior.
9. Exercise `/clear`, Escape, close, drag, resize, narrow viewports, and both
   light and dark themes for regressions.

Code-level checks should cover selection validation and request serialization
where practical. Syntax checks are run for all modified JavaScript files, and
the Chrome and Firefox implementations are compared to ensure they differ only
where browser APIs require it.
