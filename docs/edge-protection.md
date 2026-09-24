# Edge protection for the API gateway

The gateway enforces its own rate limits. This document covers the layer in
front of it, which exists to absorb volumetric abuse before it costs us a
database round trip, a bcrypt hash, or an outbound email.

The edge is defence in depth, not the only defence. What it buys is that a
flood never reaches the application at all.

## Where this stands today

Cloudflare proxies `api.canvasflowapp.com`, and Fly's own proxy sits behind it:

```
browser → Cloudflare → Fly proxy → gateway      TRUST_PROXY_HOPS = 2
```

Confirm the proxy is on by resolving `api.canvasflowapp.com` and comparing it
with `canvasflow-api.fly.dev`. Different addresses, and a `cf-ray` header on
the response, mean proxied; equal means direct.

## The direct address, and the origin lock

Proxying the custom hostname does not hide the origin. `canvasflow-api.fly.dev`
answers on Fly's address, and a request sent there passes through one proxy
instead of two:

```
Through the edge:  X-Forwarded-For: <client>, <cloudflare>   → req.ip = client
Direct:            X-Forwarded-For: <anything>, <client>     → req.ip = anything
```

`TRUST_PROXY_HOPS = 2` believes two entries from the right. On the direct path
the second one is the caller's own, so the entry before it is whatever they
wrote. They can name a fresh address per request and start every per-IP limit
from zero, and no rule configured at the edge applies to them. The per-account
sign-in limit still holds, because it does not look at the address.

The origin lock closes that path. Cloudflare adds a secret header to every
request it forwards, and the gateway refuses anything without it
(`services/api-gateway/src/common/origin-lock.ts`):

| Where      | What                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare | Rules → Overview → Create rule → Request Header Transform Rule. Custom filter: Hostname equals `api.canvasflowapp.com`. **Set static** `X-Origin-Auth` to the secret |
| Fly        | `fly secrets set ORIGIN_AUTH_SECRET=<same secret> -a canvasflow-api`                                                                                                 |
| Exempt     | `/health` and `/healthz`, which Fly's own checks call directly                                                                                                       |

**Order matters.** The Cloudflare rule goes in first, the Fly secret second.
The secret turns enforcement on the moment the machines restart, and without
the rule already in place every real request is refused along with the direct
ones.

To rotate: add the new value to the Cloudflare rule, set it on Fly, and only
then retire the old one. There is a short window during the Fly restart where
requests carrying the old value are refused; do it at a quiet hour.

Check after any change:

```
curl -s -o /dev/null -w '%{http_code}\n' https://canvasflow-api.fly.dev/auth/signin -X POST   # 403
curl -s -o /dev/null -w '%{http_code}\n' https://api.canvasflowapp.com/auth/signin -X POST    # 400
curl -s -o /dev/null -w '%{http_code}\n' https://canvasflow-api.fly.dev/healthz               # 200
```

The gateway logs a warning at startup when it trusts an edge hop but has no
secret, which is the state that leaves the direct path forgeable.

## Rules to configure

Each is per client IP, under Security → WAF → Rate limiting rules.

| Path                         | Method | Rule              |
| ---------------------------- | ------ | ----------------- |
| `/auth/signup`               | POST   | 20 per minute     |
| `/auth/email/verify`         | POST   | 60 per minute     |
| `/auth/email/resend`         | POST   | 30 per 10 minutes |
| `/auth/password/forgot`      | POST   | 30 per 10 minutes |
| `/auth/password/reset`       | POST   | 60 per minute     |
| `/auth/password/reset/check` | POST   | 60 per minute     |
| `/auth/*`                    | any    | 300 per minute    |

The named routes are deliberately looser than the application's own. The
application should be the thing that answers a person who is simply clicking
too fast, because it can say how long to wait; the edge should only catch
traffic that is not a person at all. The last is a ceiling for anything under
`/auth` that is not named above.

**On the Free plan** Cloudflare allows a single rate-limiting rule with a short
counting window, so the table above is the target for a paid plan rather than
something to enter today. With one rule, spend it on the ceiling: requests
whose path starts with `/auth/`, counted per IP, blocked for the rule's
timeout once exceeded. Every limit in the next section still holds without it.

Also enable the provider's managed bot and common-attack rulesets. Nothing
under `/auth` is a browser-less integration point, so challenging obvious
automation costs real users nothing.

## What the application already enforces

| Operation        | Limit                    | Scope       |
| ---------------- | ------------------------ | ----------- |
| Signup           | 10 per minute            | per IP      |
| Sign-in          | 30 per minute            | per IP      |
| Sign-in          | 10 failures / 15 minutes | per address |
| Verify           | 30 per minute            | per IP      |
| Resend           | 10 per 10 minutes        | per IP      |
| Resend           | 1/minute, 5/hour, 10/day | per account |
| Forgot password  | 10 per 10 minutes        | per IP      |
| Forgot password  | 1/minute, 5/hour         | per address |
| Reset link check | 30 per minute            | per IP      |
| Reset password   | 10 per minute            | per IP      |

The per-account and per-address limits are counted from database rows, so they
survive restarts and hold across instances. The per-IP limits are counted in the
process's memory and reset on deploy, which is acceptable for abuse control and
is the main reason an edge layer is worth having.

The sign-in and forgot-password limits per address are keyed on the address as
submitted, account or no account, so being refused for pace does not reveal
which addresses exist. The forgot-password limit has no daily cap on purpose:
anyone can trip it for somebody else's address, and a day-long window would
let them block that person's recovery for a whole day.

A reset link is 256 random bits, so its routes need no limit of their own to
stay unguessable; the per-IP limits there only bound the work a caller can
cause. Spending a link runs bcrypt, and only for a link that is real, unused
and unexpired.

## Sign-in

Sign-in lives in the gateway, so the rules above reach it: `/auth/signin`,
`/auth/refresh`, `/auth/resume` and the OAuth routes all sit under the `/auth/*`
ceiling, and the application limits them per IP — 30 sign-ins, 60 refreshes and
30 resumes a minute.

The web app's old sign-in endpoint, `/api/auth/callback/credentials`, checked
passwords with no limit at all and was reachable directly even after the login
page stopped using it. It has been removed along with the rest of Auth.js, so
there is no longer a way to test a password that goes around these limits.

## The header that decides who a caller is

Every per-IP limit counts `req.ip`, which Express derives from
`X-Forwarded-For` and the `TRUST_PROXY_HOPS` setting, counting from the right.

**`TRUST_PROXY_HOPS` must equal the number of proxies actually in front.** Too
low and every caller looks like the proxy, so one person tripping a limit
throttles everybody. Too high and a caller's own entry is believed. Cloudflare
appending to a client-supplied `X-Forwarded-For` is fine: whatever the client
wrote sits to the left of the entries being counted.

## What is deliberately not here

No edge caching for `/auth`. These responses are per-caller and some of them
spend a single-use token; a cached one would be wrong at best.

No IP allowlisting of callers. Signup and verification are reached by people we
have never seen before, which is the point of them. (Allowlisting Cloudflare's
ranges at the origin would be an alternative to the secret header, but the
ranges change and the list would need keeping current.)
