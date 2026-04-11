import { Router, Request, Response } from 'express';
import { enrollInSequence, getAssociatedContacts } from '../hubspot';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAlreadyEnrolled(err: any): boolean {
  return (
    err?.response?.status === 409 ||
    err?.response?.data?.category === 'CONFLICT' ||
    String(err?.response?.data?.message ?? '').toLowerCase().includes('already enrolled')
  );
}

/**
 * Enroll a list of contacts, returning { enrolledCount, failedCount }.
 * Already-enrolled contacts are counted as successes (idempotent).
 * All enrollments run in parallel; individual failures are logged but do not
 * abort the rest.
 */
async function bulkEnroll(
  portalId: number,
  contactIds: string[],
  sequenceId: string,
  senderId: string,
  senderEmail: string
): Promise<{ enrolledCount: number; failedCount: number }> {
  const results = await Promise.allSettled(
    contactIds.map((id) => enrollInSequence(portalId, id, sequenceId, senderId, senderEmail))
  );

  let enrolledCount = 0;
  let failedCount = 0;

  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled' || (result.status === 'rejected' && isAlreadyEnrolled(result.reason))) {
      enrolledCount++;
    } else {
      failedCount++;
      console.error(
        `[enroll-sequence] Failed for contact ${contactIds[i]}:`,
        result.reason?.response?.data ?? result.reason?.message
      );
    }
  }

  return { enrolledCount, failedCount };
}

// ── Enroll in Sequence ────────────────────────────────────────────────────────

/**
 * POST /webhook/enroll-sequence
 * Called by HubSpot when the "Enroll in Sequence" workflow action fires.
 *
 * Supports three object types:
 *   CONTACT  – enroll the contact directly
 *   DEAL     – traverse associations to find contacts, then enroll each
 *   COMPANY  – traverse associations to find contacts, then enroll each
 *
 * Input fields:
 *   sequenceId       – the sequence to enroll into
 *   senderId         – HubSpot user ID of the sender
 *   senderEmail      – sending email address
 *   associationLabel – (optional) label filter for deal/company workflows:
 *                        "__all__"  → all associated contacts (default)
 *                        "__none__" → only standard (no-label) associations
 *                        "<name>"   → only contacts with that label
 *
 * Output fields:
 *   enrolledCount – number of contacts enrolled (or already enrolled)
 *   failedCount   – number of contacts that failed enrollment
 */
router.post('/enroll-sequence', async (req: Request, res: Response) => {
  const { origin, inputFields, object } = req.body ?? {};

  const portalId: number | undefined = origin?.portalId;
  const objectId: string | undefined = String(object?.objectId ?? '');
  const objectType: string | undefined = object?.objectType; // "CONTACT" | "DEAL" | "COMPANY"
  const sequenceId: string | undefined = inputFields?.sequenceId;
  const senderId: string | undefined = inputFields?.senderId;
  const senderEmail: string | undefined = inputFields?.senderEmail;
  const associationLabel: string | undefined = inputFields?.associationLabel;

  if (!portalId || !objectId || !objectType || !sequenceId || !senderId || !senderEmail) {
    console.error('[enroll-sequence] Missing fields:', { portalId, objectId, objectType, sequenceId, senderId, senderEmail });
    res.status(400).json({ error: 'Missing required fields in webhook payload' });
    return;
  }

  try {
    // ── Contact workflow: enroll directly ─────────────────────────────────────
    if (objectType === 'CONTACT') {
      try {
        await enrollInSequence(portalId, objectId, sequenceId, senderId, senderEmail);
        console.log(`[enroll-sequence] Enrolled contact ${objectId} in sequence ${sequenceId}`);
        res.json({ outputFields: { enrolledCount: '1', failedCount: '0' } });
      } catch (err: any) {
        if (isAlreadyEnrolled(err)) {
          console.log(`[enroll-sequence] Contact ${objectId} already enrolled – skipping`);
          res.json({ outputFields: { enrolledCount: '1', failedCount: '0' } });
        } else {
          console.error('[enroll-sequence] Enrollment failed:', err?.response?.data ?? err.message);
          res.status(500).json({ error: 'Sequence enrollment failed' });
        }
      }
      return;
    }

    // ── Deal / Company workflow: traverse associations ────────────────────────
    if (objectType === 'DEAL' || objectType === 'COMPANY') {
      const contactIds = await getAssociatedContacts(portalId, objectType, objectId, associationLabel);

      if (contactIds.length === 0) {
        const label = associationLabel && associationLabel !== '__all__' ? ` with label "${associationLabel}"` : '';
        console.log(`[enroll-sequence] No contacts found on ${objectType} ${objectId}${label}`);
        res.json({ outputFields: { enrolledCount: '0', failedCount: '0' } });
        return;
      }

      console.log(`[enroll-sequence] Enrolling ${contactIds.length} contact(s) from ${objectType} ${objectId}`);
      const counts = await bulkEnroll(portalId, contactIds, sequenceId, senderId, senderEmail);
      console.log(`[enroll-sequence] Done: ${counts.enrolledCount} enrolled, ${counts.failedCount} failed`);
      res.json({ outputFields: { enrolledCount: String(counts.enrolledCount), failedCount: String(counts.failedCount) } });
      return;
    }

    res.status(400).json({ error: `Unsupported objectType: ${objectType}` });
  } catch (err: any) {
    console.error('[enroll-sequence] Unexpected error:', err?.response?.data ?? err.message);
    res.status(500).json({ error: 'Internal error during enrollment' });
  }
});

// ── Random Branch ─────────────────────────────────────────────────────────────

/**
 * POST /webhook/random-branch
 * Called by HubSpot when the "Random Branch" workflow action fires.
 *
 * Input fields:
 *   percentage – 0–100, probability of landing in Branch A
 *
 * Output fields:
 *   branch – "A" or "B"
 *
 * After this action add an If/then branch:
 *   "Result (A or B)" equals "A"  →  Path A
 *   All other contacts             →  Path B  (or add a second branch for "B")
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
