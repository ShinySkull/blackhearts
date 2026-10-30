# The Blackhearts

Player documents for **The Blackhearts**, a grimdark D&D campaign set in the Gloombough.

The site is plain HTML hosted on GitHub Pages. There is no build step.

## Layout

| Folder | What's in it |
| --- | --- |
| `docs/lore/` | Campaign overview, the faction guide, the regional gazetteer |
| `docs/mechanics/` | House rules: character creation, combat, crafting, durability, Ranger Arts |
| `docs/backstories/` | Player backstories as Markdown |
| `backstories/` | The web page for each backstory |
| `assets/` | Stylesheet, PDF cover images, the Gloombough map |

## Adding a document

1. Put the PDF in the right folder under `docs/`, using a lowercase file name with dashes, like `docs/lore/house-ardane.pdf`.
2. Copy one of the cards in `index.html` into the matching section and change the links, title, description and page count. Add a cover image to `assets/covers/` (a JPEG of the first page, about 520 pixels wide) and point the card's `<img>` at it.
3. Commit and push. The site updates within a couple of minutes.

Everything here is public. Keep DM-only material out of this repository.
