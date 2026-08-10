# Pak Maps — Mobile App Integration Guide

Everything the mobile app needs to talk to the Pak Maps backend: authentication, every proxy endpoint (tiles, autocomplete, search, reverse geocoding, routing), and turn-by-turn map matching. Request/response shapes below are read directly from the current backend source, not from memory.

## Base URL & conventions

All routes are mounted under `/api`. Two response families exist:

**Everything except `/navigation/map-match`:**
```json
// success
{ "success": true, "message": "OK", "data": { /* ... */ } }
// failure
{ "success": false, "message": "...", "errors": null }
```

**`/navigation/map-match` only** — its own envelope and content type, documented in its own section below.

Auth is a JWT **bearer token in a header** — the mobile app never uses cookies (cookies are the web admin panel's mechanism only; see below for why). There are **two tokens**, not one:

```
Authorization: Bearer <accessToken>
```

- **`accessToken`** — short-lived (currently 15 minutes). Send this on every request. Because it's used constantly, it's also the one most likely to leak somewhere (logs, crash reports, etc.), which is exactly why it's kept short-lived.
- **`refreshToken`** — long-lived (currently a 90-day *sliding* window - every time it's used, the clock resets, so anyone opening the app at all within 90 days never sees a login screen). Never sent on ordinary API calls - it has exactly one job: `POST /auth/refresh` to silently mint a new `accessToken` (and a new `refreshToken` - it rotates every time it's used, see below).

**This is what makes the app feel like it "never logs out"** while nothing actually lives forever: your app tracks the access token's ~15-minute lifetime (or just reacts to a `401`), silently calls `/auth/refresh` in the background before/when it expires, and retries whatever call was in flight - invisibly, no login screen. You only ever hit a real sign-in screen if the *refresh* call itself fails (see [Refresh](#refresh--post-authrefresh) below).

**Refresh token rotation, and why it matters for you:** every successful refresh returns a *brand new* `refreshToken` and invalidates the old one immediately. **Store the new one and discard the old one every single time** - if you keep reusing an old refresh token after a newer one was issued, the server treats that as a stolen/replayed token and kills the whole session outright (you'll get a `401` and have to sign in again, even though nothing was actually wrong on your end other than not updating your stored token). This is also why you should avoid firing two refresh calls back-to-back/in parallel - queue/guard it so only one is ever in flight (see the checklist at the bottom for the recommended interceptor pattern).

### Why cookies for web but not mobile

The backend supports both at once — `extractToken()` checks a cookie first, then falls back to the `Authorization` header, so the same middleware serves both client types. Web gets an `httpOnly` cookie because that's immune to XSS (injected JS on a web page can't read it); mobile has no such attack surface and native HTTP clients don't manage cookies as cleanly, so it just gets the raw token to store and attach itself.

### Optional: send location on every call

Two headers, valid on **any** request (auth, proxy, whatever) — entirely optional and best-effort:

```
X-Client-Lat: 24.8607
X-Client-Lon: 67.0011
```

Missing or malformed values are silently ignored — never a failed request. This is separate from the `lat`/`lon` *query params* some proxy endpoints take (those bias search results or are the actual reverse-geocode target); the headers are purely "where did this call come from," used for the admin's activity/audit trail.

### Optional: device metadata at sign up / sign in

Both `POST /auth/signup` and `POST /auth/login` accept these optional fields in the body, merged into the session's device info:

```json
{ "deviceId": "string", "platform": "android|ios", "model": "string", "brand": "string", "appVersion": "string" }
```

---

## 1. Authentication

### Sign up — `POST /auth/signup`

Public, no token needed.

```json
{
  "name": "Sana Khan",
  "email": "sana@example.com",
  "phone": "+923001234567",
  "gender": "female",
  "password": "min 8 characters",
  "confirmPassword": "must match password",

  "deviceId": "optional", "platform": "optional", "model": "optional",
  "brand": "optional", "appVersion": "optional"
}
```

- `phone`: `+` optional, then 7–15 digits.
- `gender`: one of `male`, `female`, `other`.
- New accounts are created with the built-in **Mobile User** role automatically — no admin-panel access, no email verification step, active immediately.

**201 response:**
```json
{
  "success": true,
  "message": "Account created.",
  "data": { "accessToken": "<jwt>", "refreshToken": "<opaque string>", "user": { /* see User shape below */ } }
}
```

Errors: `409` if the email or phone is already registered · `400` if `password`/`confirmPassword` don't match · `422` for anything else invalid (see [Errors](#errors) below).

### Sign in — `POST /auth/login`

Public.

```json
{
  "email": "sana@example.com",
  "password": "...",
  "clientType": "mobile",

  "deviceId": "optional", "platform": "optional", "model": "optional",
  "brand": "optional", "appVersion": "optional"
}
```

> **`clientType: "mobile"` is required — don't omit it.** It defaults to `"web"` if left out, which sets an admin-panel cookie you don't need and mislabels the login as a web session everywhere it shows up in the admin's Audit Logs. It's also the flag that enforces "does this account actually have mobile access" — a staff account without mobile access correctly gets rejected only when `clientType` is `mobile`.

**200 response:** identical shape to sign up (`{ accessToken, refreshToken, user }`), `message: "Logged in successfully."`

Errors: `401` wrong email/password · `403` account disabled, or `403 "This account does not have mobile app access."` if a non-mobile role tries to sign in with `clientType: "mobile"`.

### Refresh — `POST /auth/refresh`

Public (no `Authorization` header needed or expected - the whole reason you're calling this is that the access token may already be dead).

```json
{ "refreshToken": "<the refresh token from your last login/signup/refresh>" }
```

**200 response:**
```json
{ "success": true, "message": "Session refreshed.", "data": { "accessToken": "<new jwt>", "refreshToken": "<new opaque string>" } }
```

Replace **both** stored tokens with the new ones - the old `refreshToken` is invalidated the instant this succeeds. Call this proactively (track the access token's ~15 min lifetime client-side) or reactively (on any `401` from another endpoint) - either way, guard it so only one refresh is ever in flight at a time (see the checklist).

`401` means the refresh token itself is invalid, expired (>90 days unused), or was already superseded by a newer one - in every case, the session is gone server-side too, and the only way forward is a fresh sign-in. Don't retry a failed refresh; clear both stored tokens and route to sign-in immediately.

### Current user — `GET /auth/me`

Requires the access token header. Returns the same `user` object as sign in. Use it on cold app start to validate a stored token is still good and to refresh the profile/permissions.

### Change password — `PATCH /auth/password`

Requires the header.
```json
{ "currentPassword": "...", "newPassword": "min 8 chars" }
```
`200`, `data: null`. `400` if `currentPassword` is wrong.

### Sessions (devices)

- `GET /auth/sessions?page=1&pageSize=10` — paginated list of this user's active sessions.
  ```json
  { "data": { "rows": [ { "id":"...", "deviceInfo": {...}, "ipAddress":"...", "lastActive":"...", "isCurrent": true } ], "page":1, "pageSize":10, "total":3, "totalPages":1 } }
  ```
- `DELETE /auth/sessions/:id` — revoke one specific session (e.g. "log out that other phone").
- `DELETE /auth/sessions/other` — revoke every session except the one making the call.

### Sign out — `POST /auth/logout`

Requires the access token header. Destroys the session server-side, so both the access token and the refresh token stop working immediately. **The app must also delete both stored tokens from its own secure storage** — the server can't reach into your device.

### User object shape (sign up, sign in, `/auth/me` all return this)

```json
{
  "id": "uuid",
  "name": "Sana Khan",
  "email": "sana@example.com",
  "phone": "+923001234567",
  "gender": "female",
  "isActive": true,
  "lastLoginAt": "2026-08-06T09:30:00.000Z",
  "role": { "id": "uuid", "name": "Mobile User", "canAccessMobileApp": true },
  "permissions": []
}
```
`permissions` is always empty for a mobile account — it's an admin-panel-only concept.

---

## Errors

Every endpoint below (except map-match) fails the same way:
```json
{ "success": false, "message": "human-readable reason", "errors": null }
```

| Status | Meaning |
|---|---|
| 401 | missing/invalid/expired access token (normal - silently refresh and retry), or the refresh itself failed because the session was revoked/expired (signed out, an admin revoked that device, or >90 days unused) |
| 403 | forbidden — disabled account, wrong client type for the role, etc. |
| 404 | not found |
| 409 | conflict — duplicate email/phone on sign up |
| 422 | validation failed — `errors` is populated: `{ formErrors: [...], fieldErrors: { field: ["..."] } }` |
| 429 | rate limited — see [Rate limits](#rate-limits) |
| 5xx | server or upstream error |

---

## 2. Proxy endpoints — base path `/v1/proxy`

All require `Authorization: Bearer <token>` (same token, checked by the same `authMiddleware`). All return the standard `{success, message, data}` envelope except tile images, which return the raw PNG.

### Tiles — `GET /v1/proxy/tiles/:style`

One route, two forms (the `/z/x/y` part is optional):

- `GET /v1/proxy/tiles/:style` → a small style-descriptor JSON (used by web/MapLibre to auto-derive tile URLs).
- `GET /v1/proxy/tiles/:style/:z/:x/:y` → the actual raster PNG tile for that z/x/y.

`:style` is one of `dark`, `bright`, `satellite`.

**For `flutter_map` on mobile, you don't need the style-descriptor call at all** — just point a `TileLayer`'s URL template directly at the z/x/y form and attach the header through a tile provider that supports custom headers:

```dart
TileLayer(
  urlTemplate: '$baseUrl/v1/proxy/tiles/dark/{z}/{x}/{y}',
  tileProvider: NetworkTileProvider(
    headers: {'Authorization': 'Bearer $token'},
  ),
)
```

(This is why `flutter_map` was chosen over `maplibre_gl` for this app — `flutter_map`'s pure-Dart networking reliably sends custom headers on every platform; `maplibre_gl`'s native tile engine has a documented history of silently dropping them on iOS.)

Tiles are cached server-side per `style:z:x:y`.

### Autocomplete — `GET /v1/proxy/autocomplete`

Call this on every keystroke of a search box.

| Param | Required | Notes |
|---|---|---|
| `q` | yes | 1–200 chars |
| `lat`, `lon` | no | biases/ranks results near this point |
| `boundary_country` | no | e.g. `PK`, restricts results to a country |
| `size` | no | 1–40, default 10 |

```json
{ "data": { "results": [
  { "label": "Dolmen Mall, Clifton, Karachi", "lat": 24.8138, "lon": 67.0301, "type": "venue", "confidence": 0.92 }
] } }
```

### Search — `GET /v1/proxy/search`

Same params and response shape as autocomplete. Use this on an explicit submit (search button / Enter), not per-keystroke — it hits a more thorough, slower upstream endpoint than autocomplete does.

### Reverse geocoding — `GET /v1/proxy/reverse_geocoding`

"What's the address at this point" — e.g. after a map tap or from a GPS fix.

| Param | Required | Notes |
|---|---|---|
| `lat` | yes | |
| `lon` | yes | |
| `size` | no | 1–20, default 1 |

Same `results[]` shape as above, but each result also carries a `distance` (meters from the queried point):
```json
{ "data": { "results": [
  { "label": "Shahrah-e-Faisal, Karachi", "lat": 24.8600, "lon": 67.0100, "type": "street", "confidence": 0.8, "distance": 12.4 }
] } }
```

### Routing — `POST /v1/proxy/routing`

```json
{
  "locations": [ { "lat": 24.8607, "lon": 67.0011 }, { "lat": 24.9056, "lon": 67.0822 } ],
  "costing": "auto",
  "alternates": 0,
  "units": "kilometers",
  "costing_options": {}
}
```
- `locations`: 2 or more waypoints, in order.
- `costing`: `auto` | `bus` | `bicycle` | `pedestrian` | `motorcycle`.
- `alternates`: 0–3 alternate routes, default 0.
- `units`: `kilometers` | `miles`, default `kilometers`.
- `costing_options`: optional passthrough to the routing engine.

```json
{ "data": {
  "units": "kilometers",
  "distance": 12.4,
  "duration": 980,
  "legs": [ { "distance": 12.4, "duration": 980, "encodedPolyline": "..." } ],
  "alternates": []
} }
```
`encodedPolyline` is a standard precision-6 encoded polyline — decode it with any off-the-shelf polyline decoder to draw the route line.

---

## 3. Turn-by-turn map matching — `POST /navigation/map-match`

Not under `/v1/proxy` — mounted directly at `/api/navigation/map-match`. Same bearer token, but **its own response envelope and its own content type** (`application/vnd.mapifyit.navigation.v1+json`), so don't reuse your generic API client's success/error parsing for this one call.

**Purpose:** snap a short burst of raw GPS samples onto the actual road network, with per-point road bearing — this is what keeps the navigation puck tracking smoothly through curves instead of cutting corners or lagging.

```json
{
  "requestId": "your own idempotency id, 1-128 chars",
  "sessionGeneration": "stable id for this nav session - bump only if navigation restarts from scratch",
  "routeId": "the route this trace belongs to",
  "sequenceId": 0,
  "costing": "auto",
  "gpsAccuracyMeters": 8,
  "searchRadiusMeters": 20,
  "samples": [
    {
      "id": "unique within this request",
      "latitude": 24.8607, "longitude": 67.0011,
      "timestamp": 1690000000000,
      "accuracyMeters": 8,
      "speedMps": 5.2,
      "headingDegrees": 178.4,
      "headingAccuracyDegrees": 15
    }
  ]
}
```

Field bounds: `costing` must literally be `"auto"` (nothing else is accepted yet) · `samples` needs 2–20 entries, `timestamp` strictly increasing across them · `headingDegrees` 0–359.999999 · `gpsAccuracyMeters`/`accuracyMeters` 1–100 · `searchRadiusMeters` 5–100 · `speedMps` 0–100 · `headingAccuracyDegrees` 0–180.

**Success (200):**
```json
{
  "requestId": "...", "sessionGeneration": "...", "routeId": "...", "sequenceId": 0,
  "status": "matched",
  "matchedPoints": [
    {
      "sampleId": "...", "latitude": 24.8608, "longitude": 67.0012,
      "matchType": "matched", "distanceFromRawMeters": 3.2,
      "edgeIndex": 0, "edgeId": "1234", "distanceAlongEdge": 0.4,
      "roadBearingDegrees": 181.2, "isRoundabout": false
    }
  ],
  "edges": [
    { "edgeIndex": 0, "edgeId": "1234", "names": ["Shahrah-e-Faisal"], "beginHeading": 178, "endHeading": 184, "forward": true, "wayId": "998877", "isRoundabout": false }
  ],
  "shape": "encoded polyline of the matched road geometry, or null",
  "roadNames": ["Shahrah-e-Faisal"],
  "serverTimingMs": 42
}
```
`status` is `matched`, `partial`, or `unmatched` depending on how many samples landed on a road.

**Errors** use a different shape entirely:
```json
{ "error": { "code": "RATE_LIMITED", "retryable": true } }
```

| HTTP | code | retryable | meaning |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | no | malformed body |
| 401 | `UNAUTHORIZED` | no | bad/missing token |
| 429 | `RATE_LIMITED` | yes | over the rate limit, **or** you already have a request in flight for this `sessionGeneration` — only one concurrent call per nav session is allowed |
| 503 | `MATCHER_UNAVAILABLE` | yes | upstream matcher unreachable/rejected the request |
| 504 | `UPSTREAM_TIMEOUT` | yes | upstream took too long |

**Idempotency:** resending the identical `(sessionGeneration, sequenceId)` pair within 5 seconds returns the cached prior response instead of hitting the matcher again — safe to retry after your own client-side timeout without worrying about burning your rate limit twice.

**Usage pattern:** as GPS samples accumulate during active navigation, send them in small bursts (2–20 at a time), incrementing `sequenceId` each call. Keep `sessionGeneration` fixed for the life of one navigation session; only change it if navigation is restarted from scratch. Use the returned `shape` polyline and per-point `roadBearingDegrees` to smoothly move/rotate the puck along the real road rather than snapping between raw GPS points.

---

## Rate limits

| Scope | Limit |
|---|---|
| Tiles, autocomplete, search, reverse geocoding, routing | 120 requests / 60s per user (a specific service may be tightened by an admin) |
| Map matching | 60 requests / minute per user, plus 1 concurrent request per `sessionGeneration` |

Exceeding either returns `429`.

---

## Practical checklist

- Store **both** tokens in secure storage (`flutter_secure_storage` → Keychain / EncryptedSharedPreferences), never plain `SharedPreferences` — the refresh token especially, since it's the long-lived one.
- Attach `Authorization: Bearer <accessToken>` via an HTTP client interceptor (Dio interceptor) rather than repeating it per call — and attach `X-Client-Lat`/`X-Client-Lon` there too, when a location fix is available, so it's automatic everywhere.
- **Build the refresh-on-401 interceptor with a single-flight guard**, e.g.:
  ```dart
  Future<String>? _refreshInFlight;

  Future<String> _refreshAccessToken() {
    // If a refresh is already running, every caller awaits that SAME future
    // instead of each firing its own - otherwise two calls 401ing at once
    // would both try to refresh, and the second one in would get treated as
    // reusing an already-superseded refresh token (see rotation above).
    return _refreshInFlight ??= _doRefresh().whenComplete(() => _refreshInFlight = null);
  }
  ```
  On a `401` from any call other than `/auth/refresh` itself: await `_refreshAccessToken()`, retry the original request once with the new token; if the refresh call itself fails, clear both tokens and route to sign-in. Never retry more than once.
- Always send `clientType: "mobile"` on login.
- Use `flutter_map` for the map view, not `maplibre_gl`, for reliable header support on tile requests.
- Treat `/navigation/map-match` as a distinct client — different envelope, different error shape, different content type from the rest of the API.
