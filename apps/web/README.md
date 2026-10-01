# @canvasflow/web

Next.js 15 application — marketing site, authentication, and the hand-off into the
editor. Boards themselves are browsed inside the editor's board switcher; this app has
no board list page.

## Run locally

Two terminals:

```bash
# Terminal 1 — start the api-gateway (must be running)
cd services/api-gateway
pnpm dev

# Terminal 2 — start the web app
cd apps/web
pnpm dev
```

Then visit:

- `http://localhost:3000/` — landing page
- `http://localhost:3000/open` — resolves your most recent board (creating a first one
  if you have none) and redirects into the editor with a short-lived token
- `http://localhost:3000/api/healthz` — frontend health check

## Stack

- **Next.js 15** with App Router and Server Components
- **TanStack Query** for client-side data fetching with caching
- **Tailwind v4** via `@canvasflow/ui`'s shared design tokens
- **Zod-validated environment** via `lib/env.ts`

## Architecture

- `src/app/` — App Router pages and route handlers
  - `open/` — the way into the app: picks a board, mints an editor token, redirects
  - `invite/[token]/` — share-link landing page, public by design
  - `api/` — route handlers. `editor-token`, `boards/*` and `workspaces/*` are called
    by the editor cross-origin with the session cookie, so they carry CORS headers and
    authenticate in the handler rather than in the middleware
- `src/lib/` — app-level utilities (env, auth, board access, CORS)

## Search discovery

Next.js serves `src/app/sitemap.ts` as `/sitemap.xml` and `src/app/robots.ts` as
`/robots.txt`. Both routes are public in `src/middleware.ts`, so a crawler can
fetch them without being redirected into sign-in. Do not also add files with
these names to `public/`; the metadata routes already serve them.

The sitemap lists the production URLs for the homepage, whiteboard guide, Terms, and Privacy.
Add future standalone public pages to `sitemap.ts` when they launch. Keep account
flows, board and invite URLs, APIs, query parameters, and homepage section
anchors out of this list. Omission from a sitemap does not prevent indexing;
authentication still protects private data, and `noindex` is a separate control
for any public page that should not appear in search.

The URLs always use `https://canvasflowapp.com`, including on preview deployments.
There are no automatic `lastModified` dates: add one only when it tracks a real
content update, rather than every build. Google ignores sitemap `priority` and
`changefreq`, so they are omitted too.

After deploying the web app:

1. Open `https://canvasflowapp.com/sitemap.xml` and
   `https://canvasflowapp.com/robots.txt` while signed out. Both should return
   HTTP 200 directly, as XML and plain text respectively.
2. In the site's Google Search Console property, open **Indexing → Sitemaps**.
   Submit `https://canvasflowapp.com/sitemap.xml` (or just `sitemap.xml` if the
   form already shows the site's URL prefix).
3. Check the submission status for fetch or parsing errors. Use **URL inspection**
   on the homepage to request indexing after a significant page or favicon update.

A sitemap helps discovery; it does not guarantee indexing or higher rankings.
See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

### Metadata and public pages

`src/lib/seo.ts` provides `publicPageMetadata` for each indexable page. It sets a
self-referencing production canonical, title, description, social preview and
`index, follow`. The root layout defaults to `noindex, nofollow`, so account,
invite and utility pages do not accidentally opt into search. When adding a
public content page, use this helper, add its exact route to `PUBLIC_PATHS` in
middleware, add it to the sitemap, and link to it from an existing public page.

Invite pages remain crawlable so search engines can read their `noindex` tag.
Do not use `robots.txt` as an access control or block pages whose `noindex` you
need crawlers to see. API and board authorization remain responsible for data access.

The homepage includes `WebSite` structured data for the CanvasFlow site name.
`/opengraph-image` generates a branded social preview; it is separate from the
favicon. Keep the existing custom favicon URL stable unless the image changes.

### Deploying both hosts

This SEO change spans **both** the web and editor Vercel projects. Deploy the web
project for the new guide/social image, and the editor project for its public
entry and board rewrites. The main sitemap contains only main-site pages; the
editor serves its own sitemap containing only `https://app.canvasflowapp.com/`.

After deployment, submit both sitemap URLs in a Search Console Domain property
covering `canvasflowapp.com`, or use separate URL-prefix properties for the two
hosts. Inspect the homepage, guide and app root and request indexing. Check that
public roots have no `X-Robots-Tag: noindex` header and that board pages do have
`noindex` in their initial HTML. Check the actual production responses; preview
deployments may intentionally send `noindex` headers.

Track impressions, clicks and queries in Search Console after Google recrawls.
Use relevant questions from users to expand the guide over time. Titles,
sitemaps and structured data help search engines understand the site but do
not guarantee a particular result, position or favicon refresh time.

## What's next

- Board rename / delete
- Workspace member management
