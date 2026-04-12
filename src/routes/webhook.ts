import { Router, Request, Response } from 'express';
import { enrollInSequence, getAssociatedContacts, unenrollFromSequence } from '../hubspot';
import { remainingEnrollments, addEnrollmentCount, addSequenceCount } from '../db';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAlreadyEnrolled(err: any): boolean {
  return (
    err?.response?.status === 409 ||
    err?.response?.data?.category === 'CONFLICT' ||
    String(err?.response?.data?.message ?? '').toLowerCase().includes('already enrolled')
  );
}

async function bulkEnroll(
  portalId: number,
  contactIds: string[],
  sequenceId: string,
  senderId: string,
  senderEmail: string
): Promise<{ enrolled: number; failed: number }> {
  const results = await Promise.allSettled(
    contactIds.map((id) => enrollInSequence(portalId, id, sequenceId, senderId, senderEmail))
  );
  let enrolled = 0, failed = 0;
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled' || (r.status === 'rejected' && isAlreadyEnrolled(r.reason))) {
      enrolled++;
    } else {
      failed++;
      console.error(`[enroll] Contact ${contactIds[i]} failed:`, r.reason?.response?.data ?? r.reason?.message);
    }
  }
  return { enrolled, failed };
}

async function bulkUnenroll(
  portalId: number,
  contactIds: string[],
  sequenceId?: string
): Promise<{ unenrolled: number }> {
  const results = await Promise.allSettled(
    contactIds.map((id) => unenrollFromSequence(portalId, id, sequenceId))
  );
  const unenrolled = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
  return { unenrolled };
}

// ── Enroll in Sequence ────────────────────────────────────────────────────────

/**
 * POST /webhook/enroll-sequence
 *
 * Input fields:  sequenceId, senderId, senderEmail, associationLabel (optional)
 * Output fields: enrolledCount, failedCount, limitExceeded
 *
 * Supports CONTACT, DEAL, and COMPANY objectTypes.
 * Tracks monthly usage and enforces per-tier enrollment limits.
 */
router.post('/enroll-sequence', async (req: Request, res: Response) => {
  const { origin, inputFields, object } = req.body ?? {};
  const portalId: number | undefined = origin?.portalId;
  const objectId = String(object?.objectId ?? '');
  const objectType: string | undefined = object?.objectType;
  const { sequenceId, senderId, senderEmail, associationLabel } = inputFields ?? {};

  if (!portalId || !objectId || !objectType || !sequenceId || !senderId || !senderEmail) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // ── Tier / limit check ────────────────────────────────────────────────────
  const remaining = await remainingEnrollments(portalId);
  if (remaining === 0) {
    console.log(`[enroll] Portal ${portalId} at enrollment limit`);
    res.json({ outputFields: { enrolledCount: '0', failedCount: '0', limitExceeded: 'true' } });
    return;
  }

  try {
    // ── Contact workflow ──────────────────────────────────────────────────────
    if (objectType === 'CONTACT') {
      try {
        await enrollInSequence(portalId, objectId, sequenceId, senderId, senderEmail);
        await Promise.all([
          addEnrollmentCount(portalId, 1),
          addSequenceCount(portalId, sequenceId, 1),
        ]);
        res.json({ outputFields: { enrolledCount: '1', failedCount: '0', limitExceeded: 'false' } });
      } catch (err: any) {
        if (isAlreadyEnrolled(err)) {
          res.json({ outputFields: { enrolledCount: '1', failedCount: '0', limitExceeded: 'false' } });
        } else {
          console.error('[enroll] Error:', err?.response?.data ?? err.message);
          res.status(500).json({ error: 'Enrollment failed' });
        }
      }
      return;
    }

    // ── Deal / Company workflow ───────────────────────────────────────────────
    if (objectType === 'DEAL' || objectType === 'COMPANY') {
      const contactIds = await getAssociatedContacts(portalId, objectType, objectId, associationLabel);

      if (contactIds.length === 0) {
        res.json({ outputFields: { enrolledCount: '0', failedCount: '0', limitExceeded: 'false' } });
        return;
      }

      // Respect the remaining limit — cap the batch
      const toEnroll = remaining === Infinity ? contactIds : contactIds.slice(0, remaining);
      const skipped = contactIds.length - toEnroll.length;

      const counts = await bulkEnroll(portalId, toEnroll, sequenceId, senderId, senderEmail);
      if (counts.enrolled > 0) {
        await Promise.all([
          addEnrollmentCount(portalId, counts.enrolled),
          addSequenceCount(portalId, sequenceId, counts.enrolled),
        ]);
      }

      res.json({
        outputFields: {
          enrolledCount: String(counts.enrolled),
          failedCount: String(counts.failed + skipped),
          limitExceeded: skipped > 0 ? 'true' : 'false',
        },
      });
      return;
    }

    res.status(400).json({ error: `Unsupported objectType: ${objectType}` });
  } catch (err: any) {
    console.error('[enroll] Unexpected error:', err?.response?.data ?? err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Unenroll from Sequence ────────────────────────────────────────────────────

/**
 * POST /webhook/unenroll-sequence
 *
 * Input fields:
 *   sequenceId       (optional) – which sequence to unenroll from.
 *                                  Leave blank or "__all__" to cancel all active enrollments.
 *   associationLabel (optional) – label filter for deal/company workflows.
 *
 * Output fields: unenrolledCount
 *
 * Supports CONTACT, DEAL, and COMPANY objectTypes.
 */
router.post('/unenroll-sequence', async (req: Request, res: Response) => {
  const { origin, inputFields, object } = req.body ?? {};
  const portalId: number | undefined = origin?.portalId;
  const objectId = String(object?.objectId ?? '');
  const objectType: string | undefined = object?.objectType;
  const sequenceId: string | undefined = inputFields?.sequenceId;
  const associationLabel: string | undefined = inputFields?.associationLabel;

  if (!portalId || !objectId || !objectType) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    if (objectType === 'CONTACT') {
      const count = await unenrollFromSequence(portalId, objectId, sequenceId);
      console.log(`[unenroll] Contact ${objectId}: ${count} enrollment(s) cancelled`);
      res.json({ outputFields: { unenrolledCount: String(count) } });
      return;
    }

    if (objectType === 'DEAL' || objectType === 'COMPANY') {
      const contactIds = await getAssociatedContacts(portalId, objectType, objectId, associationLabel);
      if (contactIds.length === 0) {
        res.json({ outputFields: { unenrolledCount: '0' } });
        return;
      }
      const { unenrolled } = await bulkUnenroll(portalId, contactIds, sequenceId);
      console.log(`[unenroll] ${objectType} ${objectId}: ${unenrolled} enrollment(s) cancelled across ${contactIds.length} contacts`);
      res.json({ outputFields: { unenrolledCount: String(unenrolled) } });
      return;
    }

    res.status(400).json({ error: `Unsupported objectType: ${objectType}` });
  } catch (err: any) {
    console.error('[unenroll] Error:', err?.response?.data ?? err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Random Branch ─────────────────────────────────────────────────────────────

/**
 * POST /webhook/random-branch
 *
 * Input fields:  percentage (0–100) — probability of Branch A
 * Output fields: branch ("A" or "B")
 *
 * After this action, add an If/then branch:
 *   "Result (A or B)" equals "A"  →  Path A
 *   All others                     →  Path B
 */
router.post('/random-branch', (req: Request, res: Response) => {
  const { origin, inputFields } = req.body ?? {};
  if (!origin?.portalId) { res.status(400).json({ error: 'Missing portalId' }); return; }

  // Collect weights for up to 5 branches; treat missing/invalid as 0
  const weights = ['branch1', 'branch2', 'branch3', 'branch4', 'branch5'].map((key) => {
    const w = parseFloat(inputFields?.[key] ?? '0');
    return isNaN(w) ? 0 : Math.max(0, w);
  });

  const total = weights.reduce((sum, w) => sum + w, 0);

  // Default to branch 1 if nothing is configured
  if (total === 0) {
    res.json({ outputFields: { branch: '1' } });
    return;
  }

  // Pick a branch proportionally to its weight
  let rand = Math.random() * total;
  let branch = '1';
  for (let i = 0; i < weights.length; i++) {
    rand -= weights[i];
    if (rand <= 0) {
      branch = String(i + 1);
      break;
    }
  }

  console.log(`[random-branch] portalId=${origin.portalId} weights=[${weights.join(',')}] → branch ${branch}`);
  res.json({ outputFields: { branch } });
});

export default router;
