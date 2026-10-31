"""Build the backstory web pages from the Markdown files in docs/backstories/.

Each docs/backstories/<name>.md becomes backstories/<name>.html. If the file has
an "## At the Table" section, it is moved up to sit right under the character's
name and opening quote, so readers get the summary before the full story.

Usage:  python build_backstories.py   (needs: pip install markdown)
"""

import html
import re
from pathlib import Path

import markdown

ROOT = Path(__file__).parent
SOURCE_DIR = ROOT / "docs" / "backstories"
OUTPUT_DIR = ROOT / "backstories"

SUMMARY_HEADING = re.compile(r"^##\s+At the Table\s*$", re.IGNORECASE)
ANY_H2 = re.compile(r"^##\s+")
RULE = re.compile(r"^\s*(---|\*\*\*|___)\s*$")
LIST_ITEM = re.compile(r"^\s*([-*+]|\d+\.)\s+")

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} · The Blackhearts</title>
  <meta name="description" content="Player backstory for {title}, a Blackhearts recruit.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>

<header class="topbar">
  <div class="wrap">
    <a class="brand" href="../index.html">The <span>Blackhearts</span></a>
    <nav>
      <a href="../index.html#lore">Lore</a>
      <a href="../index.html#mechanics">Mechanics</a>
      <a href="../index.html#backstories">Backstories</a>
      <a href="../index.html#map">Map</a>
      <a href="../tools/">Tools</a>
    </nav>
  </div>
</header>

<article class="reading">
  <a class="back" href="../index.html#backstories">&larr; All backstories</a>
  <p class="kicker">Player Backstory</p>
{body}
  <p class="source">Original file: <a href="../docs/backstories/{slug}.md" download>{slug}.md</a></p>
</article>

<footer>
  <div class="wrap">
    <p class="closing">Welcome to the Blackhearts.</p>
  </div>
</footer>

</body>
</html>
"""


def render(md_text):
    # Python-Markdown only starts a list after a blank line, but most editors
    # don't need one, so add it where a list directly follows a paragraph.
    lines = []
    for line in md_text.splitlines():
        prev = lines[-1] if lines else ""
        if LIST_ITEM.match(line) and prev.strip() and not LIST_ITEM.match(prev):
            lines.append("")
        lines.append(line)
    return markdown.markdown("\n".join(lines), extensions=["extra", "smarty"])


def split_summary(lines):
    """Pull the "At the Table" section out of the lines, along with the
    horizontal rule that usually sits just above it. Returns (summary, rest)."""
    start = next((i for i, line in enumerate(lines) if SUMMARY_HEADING.match(line)), None)
    if start is None:
        return [], lines
    end = next((i for i in range(start + 1, len(lines)) if ANY_H2.match(lines[i])), len(lines))
    summary = lines[start:end]

    # Drop the rule (and blank lines) left dangling above the moved section.
    cut = start
    while cut > 0 and not lines[cut - 1].strip():
        cut -= 1
    if cut > 0 and RULE.match(lines[cut - 1]):
        start = cut - 1
    return summary, lines[:start] + lines[end:]


def build_page(md_path):
    lines = md_path.read_text(encoding="utf-8").splitlines()
    summary, rest = split_summary(lines)

    # The header is the name and opening quote: everything before the first
    # "## " heading, minus any trailing rule, which goes after the summary.
    first_h2 = next((i for i, line in enumerate(rest) if ANY_H2.match(line)), len(rest))
    header, story = rest[:first_h2], rest[first_h2:]
    while header and not header[-1].strip():
        header.pop()
    if header and RULE.match(header[-1]):
        header.pop()

    parts = [render("\n".join(header))]
    if summary:
        parts.append('<section class="at-the-table">\n' + render("\n".join(summary)) + "\n</section>")
    parts.append("<hr />")
    parts.append(render("\n".join(story)))
    body = "\n".join(parts)

    title_line = next((line for line in lines if line.startswith("# ")), md_path.stem)
    title = html.escape(title_line.lstrip("# ").strip())
    out = OUTPUT_DIR / f"{md_path.stem}.html"
    out.write_text(PAGE.format(title=title, body=body, slug=md_path.stem), encoding="utf-8")
    return out, bool(summary)


if __name__ == "__main__":
    OUTPUT_DIR.mkdir(exist_ok=True)
    for md_path in sorted(SOURCE_DIR.glob("*.md")):
        out, moved = build_page(md_path)
        note = "At the Table moved to top" if moved else "no At the Table section"
        print(f"{out.relative_to(ROOT)}  ({note})")
