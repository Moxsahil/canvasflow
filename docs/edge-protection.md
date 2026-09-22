# Edge protection for the API gateway

The gateway enforces its own rate limits. This document covers the layer in
front of it, which exists to absorb volumetric abuse before it costs us a
database round trip, a bcrypt hash, or an outbound email.

The edge is defence in depth, not the only defence. Nothing here is required
for the limits below to hold — they hold in the application already. What the
edge buys is that a flood never reaches the application at all.

## Where this stands today

There is no edge in front of the API. Cloudflare is the nameserver for
`canvasflowapp.com`, which is easy to mistake for protection, but the record
that matters is not proxied:

```
canvasflowapp.com      NS  jillian.ns.cloudflare.com, jermaine.ns.cloudflare.com
api.canvasflowapp.com  A   66.241.124.56
canvasflow-api.fly.dev A   66.241.124.56
```

The custom hostname resolves to the same address as the origin, which is how
you can tell the proxy is off. A proxied record answers with the proxy's own
address instead. Every request to the API therefore reaches Fly directly, and
no rule written in Cloudflare has any effect on it.

Confirm this the same way before and after any change: resolve
`api.canvasflowapp.com` and compare it with `canvasflow-api.fly.dev`. Equal
means direct; different means proxied.

## Turning it on

Three changes, and the order matters.

1. **Enable the proxy** for the `api.canvasflowapp.com` record. Traffic then
   terminates at the edge and is forwarded to Fly.
2. **Add the rules** below.
3. **Set `TRUST_PROXY_HOPS` to `2`** in `fly.api-gateway.toml` and deploy.

Step three belongs with step one, not before and not long after. Set it early
and the gateway trusts a hop that is not there yet, which lets a caller forge
their own address through `X-Forwarded-For` and walk past every per-IP limit.
Leave it late and every caller appears to be the proxy, so the limits count the
whole internet as one person and throttle everybody together the first time
anyone trips one.

After deploying, make a request from a known address and confirm the gateway
attributes it to that address rather than to a proxy.

## Rules to configure

Each is per client IP.

| Path                 | Method | Rule              |
| -------------------- | ------ | ----------------- |
| `/auth/signup`       | POST   | 20 per minute     |
| `/auth/email/verify` | POST   | 60 per minute     |
| `/auth/email/resend` | POST   | 30 per 10 minutes |
| `/auth/*`            | any    | 300 per minute    |

The first three are deliberately looser than the application's own. The
application should be the thing that answers a person who is simply clicking
too fast, because it can say how long to wait; the edge should only catch
traffic that is not a person at all. The last is a ceiling for anything under
`/auth` that is not named above.

Also enable the provider's managed bot and common-attack rulesets. Nothing
under `/auth` is a browser-less integration point, so challenging obvious
automation costs real users nothing.

## What the application already enforces

| Operation | Limit                    | Scope       |
| --------- | ------------------------ | ----------- |
| Signup    | 10 per minute            | per IP      |
| Verify    | 30 per minute            | per IP      |
| Resend    | 10 per 10 minutes        | per IP      |
| Resend    | 1/minute, 5/hour, 10/day | per account |

The per-account limit is counted from rows in `email_verification_tokens`, so
it survives restarts and holds across instances. The per-IP limits are counted
in the process's memory and reset on deploy, which is acceptable for abuse
control and is the main reason an edge layer is worth having.

## Sign-in

Sign-in lives in the gateway, so the rules above reach it: `/auth/signin`,
`/auth/refresh`, `/auth/resume` and the OAuth routes all sit under the `/auth/*`
ceiling, and the application limits them per IP — 30 sign-ins, 60 refreshes and
30 resumes a minute.

The web app's old sign-in endpoint, `/api/auth/callback/credentials`, checked
passwords with no limit at all and was reachable directly even after the login
page stopped using it. It has been removed along with the rest of Auth.js, so
there is no longer a way to test a password that goes around these limits.

Still missing, and wanted: a limit per account as well as per IP. It has to be
keyed on the address as submitted, not on whether it matches an account, or the
limiter itself would reveal which addresses exist.

## The origin stays reachable

Proxying the custom hostname does not hide the origin. `canvasflow-api.fly.dev`
keeps answering on the same address, so anyone who knows it can send traffic
straight past every rule above.

This is worth knowing rather than worrying about. The application's own limits
still apply on that path, which is the reason they were built first and the
reason they are not merely a duplicate of the edge. Closing it properly means
refusing requests at the origin that did not come through the edge, and that is
a separate change with its own failure mode: get it wrong and the service is
unreachable rather than merely unprotected.

## The header that decides who a caller is

Every per-IP limit counts `req.ip`, which Express derives from
`X-Forwarded-For` and the `TRUST_PROXY_HOPS` setting.

**The edge must overwrite `X-Forwarded-For`, not append to a client-supplied
one.** A caller who can prepend their own entry can invent a fresh address per
request. Most providers do the right thing by default; confirm it rather than
assume it.

**`TRUST_PROXY_HOPS` must equal the number of proxies actually in front.** It
is `1` today, for Fly's own proxy. Nothing else counts until step one above is
done.

## What is deliberately not here

No edge caching for `/auth`. These responses are per-caller and some of them
spend a single-use token; a cached one would be wrong at best.

No IP allowlisting. Signup and verification are reached by people we have never
seen before, which is the point of them.
