# Batch Creative

Upload **N product images** + **1–2 reference images** (setting/style/mood) → get
**N styled social posts**, one per product, all sharing a single visual style, each
rendering **as soon as it's ready**.

Built for a half-day take-home. The interesting parts are reliability (retries,
multi-provider failover, partial-failure isolation) and style consistency — not the
framework. See [DECISIONS.md](./DECISIONS.md) for what was built, cut, and why.

---

## Quick start

```bash
npm install
npm run build
npm start          # serves on http://localhost:3000
```

Then open http://localhost:3000, add product images + a reference, hit **Generate
posts**, and watch cards fill in progressively.

> **Runs out of the box with no API keys.** The primary image provider
> (Pollinations) is keyless. Without any keys you still get real generated images
> plus a working failover path (see below).

### Optional environment (`.env` — see `.env.example`)

| Var | Default | Effect |
|-----|---------|--------|
| `OPENROUTER_API_KEY` | _(unset)_ | Enables **vision** captioning of references + products (OpenRouter). Without it, a deterministic style template + generic product descriptor are used. |
| `OPENROUTER_VISION_MODEL` | `nvidia/nemotron-nano-12b-v2-vl:free` | Vision model id on OpenRouter. |
| `TOGETHER_API_KEY` | _(unset)_ | Adds Together AI FLUX as a second image provider for failover. |
| `ENABLE_MOCK_PROVIDER` | `false` | Appends an offline placeholder provider to the chain (demo / tests). |
| `MAX_PRODUCTS` / `MAX_FILE_BYTES` | `12` / `10 MB` | Upload limits. |
| `MAX_CONCURRENCY` | `3` | Max products generated at once (fan-out pool limit). |

Dev mode: `npm run dev`. Checks: `npm run check` (typecheck + lint + tests).

> **Run target is a single local process (`next start`).** State lives in memory and
> SSE streams are long-lived — this is **not** serverless-compatible (Vercel would
> break both). See DECISIONS.md.

---

## How it works

```
Browser ──POST /api/batch (multipart: products[], references[])──► API
                                                                    │
                          buildStyleFingerprint(references)  ◄──────┤  (ONCE per batch)
                                                                    │
                          fan-out: one job per product, pool limit 3
                            per job:  describeProduct(product)
                                      buildProductPrompt(fingerprint, desc)
                                      generatePost(prompt)  ── retry+backoff+failover
                                                                    │
Browser ◄──SSE /api/batch/[id]/stream (init → job* → done)──────────┘
   each card updates independently: pending → running → done | failed
```

- **Style consistency**: one `styleFingerprint` is derived from the reference(s)
  **once** and reused **verbatim** for every product. `describeProduct` supplies the
  per-product subject. Same style spine, different subject per card.
- **Reliability**: each product is generated via an ordered provider list
  (`pollinations → together? → mock?`); each provider gets retries with exponential
  backoff + jitter; on exhaustion it fails over to the next. One product (or
  provider) failing never stops the others — the batch always reaches `complete`.
- **Progressive delivery**: Server-Sent Events. The POST returns immediately with a
  `batchId`; the client subscribes to the stream and renders each result as its job
  flips to a terminal state.

---

## API

| Method | Route | Notes |
|--------|-------|-------|
| `POST` | `/api/batch` | `multipart/form-data`: `products` (≥1), `references` (1–2). → `{ batchId, productCount }`. `400 {error}` on validation failure. |
| `GET`  | `/api/batch/[id]/stream` | SSE. Events: `{type:"init",batch}`, `{type:"job",job}`, `{type:"done",batchId}`. |
| `GET`  | `/api/batch/[id]` | JSON snapshot of the `Batch` (debug / poll fallback). `404` if unknown. |

---

## Demonstrating reliability locally

Force a product to fail at the primary provider and watch it fail over:

```bash
GEN_FORCE_FAIL=bottle.jpg ENABLE_MOCK_PROVIDER=true npm start
# bottle.jpg fails fast on Pollinations (non-retryable) and fails over to the mock:
# its card shows provider=mock, attempts=2, while siblings complete normally.
# Without ENABLE_MOCK_PROVIDER the card is reported as failed instead.
```

---

## Project layout

```
src/
  app/
    page.tsx                      # upload UI + SSE-driven progressive render
    api/batch/route.ts            # POST: validate, fingerprint, fan-out
    api/batch/[id]/route.ts       # GET snapshot
    api/batch/[id]/stream/route.ts# GET SSE
  components/                     # UploadArea, ResultCard
  lib/
    types.ts                      # shared contract types
    store.ts                      # in-memory batch store + event emitter
    pool.ts                       # concurrency-limited fan-out
    style/                        # buildStyleFingerprint / describeProduct / buildProductPrompt
    generation/                   # generatePost + providers (pollinations, together, mock) + retry
```
