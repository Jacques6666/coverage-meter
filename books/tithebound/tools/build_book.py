#!/usr/bin/env python3
"""Build the KDP files for a Tithebound book: cover JPG and EPUB.

Usage:
    python3 build_book.py --author "Pen Name" [--book book-1-a-tithe-of-hours] [--fonts DIR]

Writes <book>/dist/cover.jpg and <book>/dist/<book>.epub.
The cover is rendered from tools/cover.html with headless Chromium (Playwright).
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

TOOLS = Path(__file__).resolve().parent
SERIES = TOOLS.parent

NUMBER_WORDS = {
    "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen", "Twenty",
}

BOOKS = {
    "book-1-a-tithe-of-hours": {
        "title": "A Tithe of Hours",
        "series": "The Tithebound",
        "position": 1,
        "description": (
            "In the city of Lanthorn, your life is written on your wrist, and the rich "
            "are buying it by the year. Tamsin Fenn's count has read seventy-one years "
            "since she was nine. It never goes down."
        ),
    },
}


def render_cover(author, fonts_dir, out_jpg):
    html = (TOOLS / "cover.html").read_text()
    html = html.replace("{{FONTDIR}}", Path(fonts_dir).resolve().as_uri())
    html = html.replace("{{AUTHOR}}", author.upper())
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "cover.html"
        page.write_text(html)
        png = Path(tmp) / "cover.png"
        script = Path(tmp) / "render.js"
        script.write_text(
            "const { chromium } = require('playwright');\n"
            "(async () => {\n"
            "  const browser = await chromium.launch();\n"
            "  const page = await browser.newPage({ viewport: { width: 1600, height: 2560 } });\n"
            f"  await page.goto({page.as_uri()!r});\n"
            "  await page.evaluate(() => document.fonts.ready);\n"
            "  await page.waitForTimeout(300);\n"
            f"  await page.screenshot({{ path: {str(png)!r} }});\n"
            "  await browser.close();\n"
            "})();\n"
        )
        env = dict(os.environ)
        npm_root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()
        env["NODE_PATH"] = npm_root + os.pathsep + env.get("NODE_PATH", "")
        subprocess.run(["node", str(script)], check=True, env=env)
        Image.open(png).convert("RGB").save(out_jpg, "JPEG", quality=92, optimize=True)


def chapter_heading(lines):
    """Merge '# Chapter One' + '## Title' into one H1 so the contents list shows both."""
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^# (Chapter (\w+(?:-\w+)?)|Epilogue)\s*$", line)
        if m:
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and lines[j].startswith("## "):
                sub = lines[j][3:].strip()
                out.append(f"# {m.group(1)}[:]{{.sep}} [{sub}]{{.chaptitle}}")
                i = j + 1
                continue
        out.append(line)
        i += 1
    return out


def build_epub(book_dir, meta, author, cover_jpg, out_epub):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        sources = [book_dir / "00-front-matter.md"]
        sources += sorted((book_dir / "chapters").glob("*.md"))
        sources += [book_dir / "99-back-matter.md"]
        staged = []
        for n, src in enumerate(sources):
            text = src.read_text().replace("{{AUTHOR}}", author)
            lines = chapter_heading(text.splitlines())
            lines = ['<p class="scenebreak">* * *</p>' if l.strip() == "---" else l for l in lines]
            dst = tmp / f"{n:03d}.md"
            dst.write_text("\n".join(lines) + "\n")
            staged.append(str(dst))

        metadata = tmp / "metadata.yaml"
        metadata.write_text(
            "---\n"
            f"title: \"{meta['title']}\"\n"
            f"author: \"{author}\"\n"
            "lang: en-US\n"
            f"rights: \"Copyright © 2026 {author}. All rights reserved.\"\n"
            f"belongs-to-collection: \"{meta['series']}\"\n"
            f"group-position: {meta['position']}\n"
            f"description: \"{meta['description']}\"\n"
            "...\n"
        )
        cmd = [
            "pandoc", *staged,
            "-f", "markdown+smart",
            "-o", str(out_epub),
            "--metadata-file", str(metadata),
            "--css", str(TOOLS / "epub.css"),
            "--epub-cover-image", str(cover_jpg),
            "--toc", "--toc-depth=1",
            "--split-level=1",
        ]
        subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--author", required=True)
    ap.add_argument("--book", default="book-1-a-tithe-of-hours")
    ap.add_argument("--fonts", required=True, help="folder with Cinzel and Cormorant Garamond woff2 files")
    args = ap.parse_args()

    book_dir = SERIES / args.book
    meta = BOOKS[args.book]
    dist = book_dir / "dist"
    dist.mkdir(exist_ok=True)
    cover = dist / "cover.jpg"
    epub = dist / f"{args.book}.epub"

    render_cover(args.author, args.fonts, cover)
    build_epub(book_dir, meta, args.author, cover, epub)
    print(f"cover: {cover} ({cover.stat().st_size // 1024} KB)")
    print(f"epub:  {epub} ({epub.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
