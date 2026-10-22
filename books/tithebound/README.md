# The Tithebound

A five-book dark academy romantasy series for Kindle.

| File | What it is |
|---|---|
| `00-series-bible.md` | The world, magic rules, characters, five-book arc and style guide |
| `book-1-a-tithe-of-hours/outline.md` | Chapter-by-chapter plan for Book 1 (30 chapters plus an epilogue) |
| `book-1-a-tithe-of-hours/chapters/` | The manuscript, one file per chapter |
| `book-1-a-tithe-of-hours/kdp-listing.md` | Everything to paste into KDP: description, keywords, categories, pricing, AI disclosure |
| `book-1-a-tithe-of-hours/dist/` | The files you upload: the EPUB manuscript and the cover JPG |
| `book-2-a-debt-of-years/outline.md` | Chapter-by-chapter plan for Book 2, including the new clock rules |
| `book-2-a-debt-of-years/chapters/` | The Book 2 manuscript: a prologue, 30 chapters and an epilogue |
| `book-2-a-debt-of-years/kdp-listing.md` | The Book 2 KDP sheet: description, keywords, categories, pricing |
| `book-2-a-debt-of-years/dist/` | The Book 2 upload files: EPUB and cover JPG |
| `tools/` | The build script, cover design and ebook stylesheet |

## Status — Book 1

- [x] Series bible
- [x] Book 1 outline
- [x] Full first draft: 30 chapters and an epilogue (about 91,000 words)
- [x] Front matter (copyright, epigraph) and back matter (review request, Book 2 teaser)
- [x] EPUB build and cover (`book-1-a-tithe-of-hours/dist/`)
- [ ] Pen name chosen, then rebuild: `python3 tools/build_book.py --author "Pen Name" --fonts <font folder>`
- [ ] Full read-through and edit (by you)
- [ ] Upload to KDP (by you)

## Status — Book 2

- [x] Outline, with the clock's rules (the Stay, the Renewal, the Settlement at midnight)
- [x] Full first draft: a prologue, 30 chapters and an epilogue (about 93,500 words)
- [x] Front matter (copyright, epigraph) and back matter (review request, Book 3 teaser)
- [x] EPUB build and cover (`book-2-a-debt-of-years/dist/`); both books' EPUBs pass EPUBCheck with no errors or warnings
- [ ] Pen name chosen, then rebuild: `python3 tools/build_book.py --author "Pen Name" --book book-2-a-debt-of-years --fonts <font folder>`
- [ ] Full read-through and edit (by you)
- [ ] Upload to KDP, two to six weeks after Book 1 (by you)

The cover fonts are Cinzel and Cormorant Garamond from Google Fonts (SIL Open Font License, free for commercial use). The build script expects their Latin `.woff2` files in the folder passed as `--fonts`.
