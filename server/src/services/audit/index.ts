import { query } from '../../db/client';

export async function logEvent(
  jobId: string | null,
  eventType: string,
  eventData: Record<string, unknown> = {}
): Promise<void> {
  await query(
    `INSERT INTO audit_events (job_id, event_type, event_data)
     VALUES ($1, $2, $3)`,
    [jobId, eventType, JSON.stringify(eventData)]
  );
}
