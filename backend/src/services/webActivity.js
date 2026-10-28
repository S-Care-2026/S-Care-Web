export const ONLINE_WINDOW_SECONDS = 90;
export const MAX_HEARTBEAT_MS = 60_000;

// Serialize on the user's row, so simultaneous tabs/devices cannot multiply time.
// Ignore long gaps; never infer hours of activity from a forgotten browser tab.
export async function recordHeartbeat(db, userId, activeMs) {
  await db.query(
    `INSERT INTO web_activity (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET
       active_ms = web_activity.active_ms + CASE
         WHEN clock_timestamp() - web_activity.last_seen_at > make_interval(secs => $3)
           THEN 0
         ELSE LEAST($2::bigint, GREATEST(0,
           floor(extract(epoch FROM (clock_timestamp() - web_activity.last_seen_at)) * 1000)::bigint))
       END,
       last_seen_at = GREATEST(web_activity.last_seen_at, clock_timestamp())`,
    [userId, activeMs, ONLINE_WINDOW_SECONDS],
  );
}

export async function readActivitySummary(db) {
  const { rows } = await db.query(
    `SELECT
       count(*)::int AS "totalUsers",
       count(*) FILTER (WHERE u.is_active)::int AS "enabledUsers",
       count(*) FILTER (WHERE u.is_active AND a.last_seen_at >= now() - make_interval(secs => $1))::int AS "onlineUsers",
       count(*) FILTER (WHERE a.last_seen_at >= now() - interval '24 hours')::int AS "activeUsers24h",
       count(a.user_id)::int AS "trackedUsers",
       floor(COALESCE(sum(a.active_ms), 0) / 1000)::double precision AS "totalActiveSeconds",
       floor(COALESCE(avg(a.active_ms), 0) / 1000)::double precision AS "averageActiveSecondsPerTrackedUser",
       min(a.first_seen_at) AS "trackingStartedAt",
       now() AS "generatedAt"
     FROM users u LEFT JOIN web_activity a ON a.user_id = u.id`,
    [ONLINE_WINDOW_SECONDS],
  );
  return { ...rows[0], onlineWindowSeconds: ONLINE_WINDOW_SECONDS };
}
