# README Showcase Design

## Goal

Present AskAside's core interaction to prospective users immediately after the
README introduction. The showcase should explain the workflow visually without
making the README feel like an unstructured image dump.

## Placement

Add a `Showcase` section after the introductory product description and before
`Repository layout`. This keeps the product demonstration prominent while
leaving installation and implementation details in their existing order.

## Layout

Use GitHub-compatible HTML inside the Markdown document so image widths,
alignment, and paired screenshots remain predictable:

1. Show `5.png` at full available width as the hero image. It demonstrates the
   complete experience: the main chat remains visible while AskAside contains a
   detailed follow-up answer beside it.
2. Place `1.png` and `2.png` in a two-column row. Their captions explain the two
   entry points: starting from an answer and starting from selected text.
3. Show `3.png` at full available width. Its caption highlights focused
   follow-ups with the selected passage retained as context.
4. Place `4.png` and `6.png` in a two-column row. Their captions describe the
   in-thread response state and the persistent pastel accent choices.

Use short English captions to match the README's existing language. Give every
image a descriptive `alt` attribute. Reference the committed files with relative
paths under `images-for-github-readme/` so they render on GitHub and on forks.

## Scope and Verification

Only the main `README.md` is changed during implementation; the source images
remain untouched. Verify that all six paths resolve, the sequence matches the
design above, the HTML structure is balanced, and the surrounding README
sections retain their current content and order.
