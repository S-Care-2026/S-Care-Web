# Website activity API

Tracks authenticated **Real bands** accounts. Browser-only demo accounts and
anonymous visitors are not counted. No page URLs, IPs or patient data are collected.

## Setup

1. Run `npm run migrate` from `backend/` to apply
   [003_web_activity.sql](../database/postgres/003_web_activity.sql).
2. Grant your existing owner account platform permission using your database's SQL editor:

   ```sql
   UPDATE users SET is_platform_admin = true WHERE email = 'YOUR_OWNER_EMAIL';
   ```

   Sign in again (or wait for the 30-second account cache to expire). A normal
   facility `admin`, including a self-registered user, cannot read site statistics.
   The owner must also be an active account linked to a facility, as with existing APIs.
3. Deploy backend and frontend. The frontend sends heartbeats automatically for
   real signed-in users. Historical usage cannot be reconstructed before deployment.

## View on the website and grant multiple admins

Sign in using **Real bands**, then choose **Website activity** in the sidebar
(`/admin/activity`). The page shows live summary cards, refreshes every 30 seconds
while visible, and supports manual refresh. It is hidden from ordinary facility
admins and demo accounts; the backend independently enforces platform permission.
Existing sessions refresh account permissions on reload, when returning to the
tab, and every minute while visible (the backend account cache lasts 30 seconds).

Any number of existing accounts can have this permission. For example, in the
production database's SQL editor, replace the second address with the real account:

```sql
UPDATE users
SET is_platform_admin = true
WHERE email IN ('admin@scare.demo', 'SECOND_ADMIN_EMAIL')
RETURNING id, email, is_active, is_platform_admin;
```

Check that both intended accounts are returned. This does not create missing users
or change their passwords. To revoke access, set `is_platform_admin = false` for
the chosen email. Each account uses its own login and sees the same site totals.

## Read statistics

`GET /api/admin/activity/summary`

```js
const response = await fetch(
  'https://s-care-backend.onrender.com/api/admin/activity/summary',
  { headers: { Authorization: `Bearer ${token}` } },
);
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(result.data);
```

Example response (illustrative numbers):

```json
{
  "success": true,
  "data": {
    "totalUsers": 10,
    "enabledUsers": 10,
    "onlineUsers": 3,
    "activeUsers24h": 7,
    "trackedUsers": 8,
    "totalActiveSeconds": 12600,
    "averageActiveSecondsPerTrackedUser": 1575,
    "trackingStartedAt": "2026-10-27T06:00:00.000Z",
    "generatedAt": "2026-10-27T08:00:00.000Z",
    "onlineWindowSeconds": 90
  }
}
```

| Field | Meaning |
| --- | --- |
| `totalUsers` | All registered accounts, including disabled accounts |
| `enabledUsers` | Accounts with `is_active = true` |
| `onlineUsers` | Enabled accounts with a heartbeat in the last 90 seconds; one count per account |
| `activeUsers24h` | Accounts with a heartbeat in the last rolling 24 hours, including accounts since disabled |
| `trackedUsers` | Accounts that have ever sent a heartbeat |
| `totalActiveSeconds` | Cumulative observed foreground seconds across tracked accounts |
| `averageActiveSecondsPerTrackedUser` | Cumulative seconds divided by tracked accounts, not average session length |
| `trackingStartedAt` | Earliest first heartbeat among retained accounts; `null` if none |
| `generatedAt` | Server time of the summary |

Data is stored in PostgreSQL across deployments. Deleting an account also deletes
its activity row; totals describe retained accounts. A useful summary refresh
interval is 30 seconds. Responses are not cacheable.

## Send activity

`POST /api/activity/heartbeat` with `Authorization: Bearer <token>` and JSON:

```json
{ "activeMs": 30000 }
```

`activeMs` must be an integer from 0 to 60000. The account is obtained from the
verified token. The route accepts up to 60 requests per account per minute on
each backend instance. It returns `{ "success": true }`.

The frontend sends an initial zero heartbeat, then sends visible-tab elapsed time
every 30 seconds, with a final best-effort flush on hide/logout/page exit. It stops
periodic sends while hidden and resets its baseline on resume. Timers delayed by
more than 60 seconds report zero. Opening multiple tabs or devices cannot multiply
time: the database serializes each account's updates and caps credited time to the
server interval since its previous heartbeat. Gaps over 90 seconds accrue nothing.

These are approximate foreground-presence metrics, not proof of keyboard/mouse
interaction. A visible idle tab still counts. Hidden/closed tabs can remain online
for up to 90 seconds; failed exit requests can lose the final interval. Network
delays, retries and overlapping tabs can undercount. The endpoint does not accept
client timestamps or grant time beyond the observed server interval.

## Verification

Run `npm run test:activity` with `TEST_DATABASE_URL` pointing to a disposable
PostgreSQL database. Tests create and remove an isolated schema; they do not read
`backend/.env`. They exercise the migration, real SQL, concurrent heartbeats,
timeouts, input validation and authenticated access control.

Run `npm run test:activity` from `frontend/` for deterministic browser-lifecycle
tests (visibility changes, suspended timers, exit/restoration and cleanup).
