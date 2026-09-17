// Who changed what — expected for health data. Failures are logged, never block the change itself.

export async function audit(db, { facilityId, userId, action, entityType, entityId, changes, ip }) {
  try {
    await db.query(
      `INSERT INTO audit_log (facility_id, actor_user_id, action, entity_type, entity_id, changes, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [facilityId ?? null, userId ?? null, action, entityType ?? null, entityId ?? null, changes ? JSON.stringify(changes) : null, ip ?? null]
    );
  } catch (err) {
    console.error(`[audit] ${action}: ${err.message}`);
  }
}
