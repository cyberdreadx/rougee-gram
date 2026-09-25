# RougeChain social — content indexes for discovery (hashtags, locations, Explore)

A node-side request surfaced by real RouGee usage. Today the node exposes only a
global timeline + per-user posts; there is **no content index**, so RouGee builds
hashtag pages, location pages, and Explore by fetching the recent global timeline
(~50 posts) and filtering **client-side**. That means:

- Tag/location pages show only *recent* matches, never full history.
- Explore can't rank or paginate real discovery — it just re-shows the newest N.
- It gets slower and less complete as total post volume grows.

The fix is server-side indexes populated when a post is created, plus query
endpoints. Grounding: `quantum-vault core/storage/src/social_store.rs` —
`create_post` (~L383) already writes the `social_posts`, `social_user_posts_idx`,
and `social_global_timeline` sled trees; these new indexes follow the same
pattern.

Post text/metadata to index (RouGee's envelope, see `src/lib/envelope.ts`):
- **Hashtags**: `#tag` tokens in the post's caption (media envelope `cap`) or in a
  plain-text post `body`. Case-insensitive, unicode letters/digits/underscore.
- **Location**: media envelope `loc` field (free-text place label).

---

## 1. Hashtag index + query

### Index (on create_post / delete)
- New tree `social_hashtag_idx`, keys `"<tag_lower>:<inv_ts>:<post_id>"` where
  `inv_ts` is a fixed-width, reverse-sortable timestamp (so a prefix scan of
  `"<tag_lower>:"` yields newest-first). Parse tags from caption/body at
  create-time; remove entries on delete_post.
- Optional `social_hashtag_counts` (`<tag_lower>` → count) for trending.

### Query
```
GET /api/social/hashtag/:tag?limit=50&offset=0   -> { posts: [...], total }
```
Prefix-scan the tag, page by limit/offset, hydrate posts from `social_posts`.

## 2. Location index + query

### Index
- New tree `social_location_idx`, keys `"<loc_norm>:<inv_ts>:<post_id>"`, where
  `loc_norm` = lowercased, whitespace-collapsed location label. Populate from the
  envelope `loc` at create-time; remove on delete.

### Query
```
GET /api/social/location/:loc?limit=50&offset=0  -> { posts: [...], total }
```

## 3. Explore / discovery feed

Client-side "recent 50" isn't a real Explore. Provide a paginated discovery feed,
ideally with a light ranking signal (recency + like/repost counts, which the node
already tracks in `social_like_counts` / `social_repost_counts`).

```
GET /api/social/explore?type=media|all&limit=50&offset=0&sort=recent|top
   -> { posts: [...], total }
```
- `type=media` → only photo/video/carousel envelopes (for the grid); `all` for a
  mixed feed. `sort=top` uses engagement counts; `recent` is timeline order.
- Even just `recent` + `type` + real pagination is a big win over the current
  client filter; ranking can come later.

---

## Acceptance criteria
- A post with `#foo` (in caption or text body) is returned by
  `/social/hashtag/foo`, newest-first, across all history — not just the recent
  window; deleting the post removes it from the index.
- A post with location "Miami, Florida" is returned by
  `/social/location/miami%2C%20florida` (case/space-insensitive match).
- `/social/explore?type=media` returns paginated media posts; `type=all` includes
  text posts. Pagination is stable.
- No client change required beyond swapping the timeline-filter for these
  endpoints (RouGee will adopt them behind its existing tag/location/Explore UI).

## Notes
- Indexes are derived data — safe to rebuild by replaying `social_posts` if the
  parse rules change (worth a one-time backfill migration when this ships so
  existing posts are searchable).
- Parsing lives at the node so it's consistent for every client, not just RouGee.

Filed from RouGee (github.com/cyberdreadx/rougee-gram). RouGee already implements
the client-side halves (hashtag linkify, tag/location pages, Explore text feed)
and will switch them to these endpoints when available.
