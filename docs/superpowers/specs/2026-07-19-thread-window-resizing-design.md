# Thread Window Resizing

## Goal

Allow users to resize the floating follow-up thread horizontally and vertically while preserving its existing drag behavior. Dragging the window must show the normal arrow cursor instead of a move or cross cursor.

## Interaction Design

- The panel can be resized from all four edges.
- A visible resize grip in the bottom-right corner makes the feature discoverable and supports diagonal resizing.
- Edge zones use the matching horizontal or vertical resize cursor. The corner grip uses a diagonal resize cursor.
- The header remains the drag handle, but uses the normal arrow cursor.
- The close button is excluded from dragging as it is today.
- Opening a thread resets the panel to its default size and automatic position, consistent with the current behavior.

## Size and Viewport Constraints

- The default width remains 420 pixels, capped to 92 percent of the viewport width.
- Until the user resizes it, the panel retains its current content-driven height and 72 percent viewport maximum height.
- The minimum resized dimensions are 300 by 220 pixels, reduced only when the viewport itself is too small to accommodate them with the existing 8-pixel outer margin.
- Resizing cannot move any panel edge beyond the 8-pixel viewport margin.
- Resizing from the top or left changes both the panel position and its size. Resizing from the bottom or right changes only its size.

## Implementation Structure

Each browser content script receives the same shadow-DOM markup, styles, and interaction logic:

1. Add four transparent edge handles and a visible bottom-right corner handle inside the panel.
2. Start a resize session on primary-button `mousedown`, capturing the initial pointer position and panel rectangle.
3. On document `mousemove`, calculate the new rectangle for the active edge or corner and clamp it to the minimum dimensions and viewport margin.
4. End dragging or resizing on document `mouseup` and when the panel closes.
5. Reset inline width and height before positioning the panel on each open.

Dragging and resizing are mutually exclusive states so the header drag behavior cannot interfere with an active resize.

## Error and Edge Handling

- Ignore non-primary mouse-button interactions.
- Prevent text selection while a drag or resize session is active.
- Keep the close button and form controls above resize hit areas where needed.
- If the viewport changes after the panel has been resized, subsequent movement and resizing continue to clamp the panel inside the current viewport.

## Verification

For both Chrome and Firefox implementations:

- Check syntax with the JavaScript parser.
- Verify that all edge handles and the bottom-right grip exist and use the intended cursors.
- Verify horizontal, vertical, and diagonal resizing in both growth and shrink directions.
- Verify top and left resizing updates panel position correctly.
- Verify minimum-size and viewport-boundary clamping.
- Verify header dragging still works and retains the normal arrow cursor.
- Verify the close button, input, send action, outside click, and Escape behavior remain unchanged.
