# A Debt of Years — KDP Listing Sheet

Copy each field into KDP. Publish Book 1 first; KDP links the two books into a series page once both have the same series name.

---

## Book details

| KDP field | Value |
|---|---|
| Language | English |
| Book title | A Debt of Years |
| Subtitle | *(leave blank — the series line does this job)* |
| Series name | The Tithebound *(type it exactly as on Book 1, or pick it from the list if KDP offers it)* |
| Series number | 2 |
| Edition number | *(leave blank)* |
| Author | **The same pen name as Book 1.** |
| Publishing rights | "I own the copyright and I hold the necessary publishing rights." |
| Primary audience | Adult (one closed-door love scene; no sexually explicit content; nothing needs to be flagged) |

## Description

*(KDP lets you use bold and italics in the description box.)*

> **The clock that stole a city's years has started to move. When it strikes twelve, every hour goes home.**
>
> Tamsin Fenn has found her mother. She's alive, chained in silver beneath the great clock of Lanthorn, where the rich have drunk her years for a decade.
>
> And Tam is next.
>
> Bound by a thread to the Keeper of the Ledger, the two-hundred-and-forty-seven-year-old woman who hunted her family for ten years, Tam lives in a gilded cage at the top of the city. Every morning at breakfast, the Keeper drinks a year from her over tea. Every night, her mother whispers to her down a thread no one else can see. And at the Turning of the Year, the Keeper means to chain Tam under the clock beside her, forever.
>
> Across the river, **Severin Thane** has four years left to live. Hunted and hiding in the Wick, he is learning the one skill that could free them: how to cut a thread without killing both ends. His teacher is a laundress whose daughter died because of him.
>
> To stop the clock, they'll need a stolen charter, a heist under the Ledger House, a rope long enough to reach the bottom of the world, and someone willing to pay for the cut with their whole life.
>
> But the Founders hid one page of that charter for a reason. Free the well, and the clock starts walking toward midnight. And when it strikes, the debts come due for everyone, including the people Tam loves most.
>
> *A Debt of Years is the second book in the Tithebound series: a dark romantasy with a slow-burn romance, a found family worth bleeding for, and a magic system where every spell costs someone their life. Start with Book One, A Tithe of Hours.*

## Keywords (7 boxes)

1. dark romantasy series
2. enemies to lovers fantasy romance
3. found family fantasy
4. slow burn fantasy romance
5. heist fantasy romance
6. time magic fantasy book
7. new adult fantasy romance

*(No other authors' names, no other book titles, no "Harry Potter" and nothing like it — those break KDP's rules.)*

## Categories (pick 3)

Use the same three as Book 1, so the two books sit together in the store:
1. Romance › Fantasy
2. Science Fiction & Fantasy › Fantasy › Romantic
3. Science Fiction & Fantasy › Fantasy › Coming of Age *(or › Dark Fantasy)*

## Content step

- **Manuscript:** `dist/book-2-a-debt-of-years.epub`. It passes EPUBCheck, the standard EPUB validator, with no errors or warnings.
- **Cover:** `dist/cover.jpg`, 1600 × 2560. Same design as Book 1, in wine red instead of navy. The clock's hand has moved just past eleven, with six of the sixty minutes to midnight lit.
- **DRM:** your choice. Match whatever you picked for Book 1.
- **AI disclosure — required.** Answer **Yes** for text and **Yes** for images, the same as Book 1. Pick the option that matches how much you edited the text.

## Pricing step

- **KDP Select (Kindle Unlimited): enroll**, as with Book 1.
- **Territories:** worldwide.
- **Royalty:** 70% (needs a price from $2.99 to $9.99).
- **Price:** $3.99, the same as Book 1. Once Book 1 is selling and readers are finishing it, you can raise Book 2 to $4.99; readers who reach Book 2 are already hooked.
- **Pre-orders:** skip.

## Release plan

1. Publish Book 1 first.
2. Publish Book 2 two to six weeks later. A new book gets extra visibility on Amazon for about 30 days, so spacing them out gives you two launch windows instead of one.
3. Once Book 2 is live, I can change the last page of Book 1 from "Coming soon" to "Available now", and you re-upload Book 1's EPUB. Re-uploading doesn't affect its reviews or rank.
4. Book 3, *A Vault of Seconds*, picks up the 54-day countdown.

---

## Upload, step by step (about 20 minutes)

**Files:** `dist/book-2-a-debt-of-years.epub` (manuscript) and `dist/cover.jpg` (cover). Rebuild both with your pen name first. The current ones say "Pen Name":

```
python3 tools/build_book.py --author "Your Pen Name" --book book-2-a-debt-of-years --fonts <font folder>
```

1. Go to kdp.amazon.com, sign in, and choose **+ Create → Kindle eBook**.
2. **Kindle eBook Details:** fill in language, title, series (The Tithebound, #2), author (your pen name), the description above, publishing rights, keywords and categories. Leave pre-order off. Click **Save and Continue**.
3. **Kindle eBook Content:**
   - Manuscript: upload the `.epub`.
   - Cover: choose "Upload a cover you already have" and upload `cover.jpg`.
   - AI-generated content: **Yes** for text, **Yes** for images.
   - Click **Launch Previewer** and page through the contents list, the prologue, a chapter with scene breaks, and the last page.
   - Click **Save and Continue**.
4. **Kindle eBook Pricing:** enroll in KDP Select, choose all territories and the 70% royalty, and set $3.99. Click **Publish Your Kindle eBook**.
5. Amazon reviews it, which usually takes a few hours and can take up to 72. Within a few days of both books being live, they should appear together on a Tithebound series page. If they don't, use KDP's "Contact Us" → "Series page" to ask for them to be linked.
