import { Router, Request, Response } from 'express';
import { enrollInSequence } from '../hubspot';

const router = Router();

// ── Enroll in Sequence ────────────────────────────────────────────────────────

/**
 * POST /webhook/enroll-sequence
 * Called by HubSpot when the "Enroll in Sequence" workflow action fires.
 *
 * Expected inputFields:
 *   - sequenceId   : string  – the sequence to enroll into
 *   - senderId     : string  – HubSpot user ID of the sender
 *   - senderEmail  : string  – sending email address for the user
 */
router.post('/enroll-sequence', async (req: Request, res: Response) => {
  const { origin, inputFields, object } = req.body ?? {};

  const portalId: number | undefined = origin?.portalId;
  const contactId: string | undefined = object?.objectId;
  const sequenceId: string | undefined = inputFields?.sequenceId;
  const senderId: string | undefined = inputFields?.senderId;
  const senderEmail: string | undefined = inputFields?.senderEmail;

  if (!portalId || !contactId || !sequenceId || !senderId || !senderEmail) {
    console.error('[enroll-sequence] Missing fields:', { portalId, contactId, sequenceId, senderId, senderEmail });
    // Return 400 – HubSpot will not retry on 4xx
    res.status(400).json({ error: 'Missing required fields in webhook payload' });
    return;
  }

  try {
    await enrollInSequence(portalId, contactId, sequenceId, senderId, senderEmail);
    console.log(`[enroll-sequence] Enrolled contact ${contactId} in sequence ${sequenceId} via user ${senderId}`);
    res.json({ outputFields: {} });
  } catch (err: any) {
    const status: number | undefined = err?.response?.status;
    const data = err?.response?.data;

    // 409 = contact already enrolled in this sequence → treat as success (idempotent)
    if (status === 409) {
      console.log(`[enroll-sequence] Contact ${contactId} already enrolled in sequence ${sequenceId} – skipping.`);
      res.json({ outputFields: {} });
      return;
    }

    console.error('[enroll-sequence] Enrollment failed:', data ?? err.message);
    // Return 500 so HubSpot retries the action
    res.status(500).json({ error: 'Sequence enrollment failed', details: data?.message ?? err.message });
  }
});

// ── Random Branch ─────────────────────────────────────────────────────────────

/**
 * POST /webhook/random-branch
 * Called by HubSpot when the "Random Branch" workflow action fires.
 *
 * Expected inputFields:
 *   - percentage : number – 0-100, the probability (%) of landing in Branch A
 *
 * Output fields:
 *   - branch : "A" | "B"
 *
 * After this action, add an If/then branch in the workflow:
 *   "If 'Result (A or B)' equals 'A'" → path A
 *   "If 'Result (A or B)' equals 'B'" → path B  (or use the else branch)
 */
router.post('/random-branch', (req: Request, res: Response) => {
  const { origin, inputFields } = req.body ?? {};
  const portalId: number | undefined = origin?.portalId;

  if (!portalId) {
    res.status(400).json({ error: 'Missing portalId' });
    return;
  }

  const raw = parseFloat(inputFields?.percentage ?? '50');
  const percentage = isNaN(raw) ? 50 : Math.max(0, Math.min(100, raw));

  const branch = Math.random() * 100 < percentage ? 'A' : 'B';
  console.log(`[random-branch] portalId=${portalId} percentage=${percentage} → branch ${branch}`);

  res.json({ outputFields: { branch } });
});

export default router;
