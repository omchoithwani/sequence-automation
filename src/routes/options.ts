import { Router, Request, Response } from 'express';
import { getSequences, getUsers, getUserEmails } from '../hubspot';

const router = Router();

/**
 * HubSpot POSTs to optionsUrl endpoints when a user configures the action in
 * the workflow editor.  The body contains at minimum { portalId } and
 * optionally { inputFields: { fieldName: value, … } } for dependent dropdowns.
 */
function extractPortalId(body: any): number | null {
  const raw = body?.portalId ?? body?.origin?.portalId;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

// ── GET /options/sequences ────────────────────────────────────────────────────

/**
 * POST /options/sequences
 * Returns all active sequences in the portal as dropdown options.
 */
router.post('/sequences', async (req: Request, res: Response) => {
  const portalId = extractPortalId(req.body);
  if (!portalId) { res.status(400).json({ options: [] }); return; }

  try {
    const sequences = await getSequences(portalId);
    res.json({
      options: sequences.map((s) => ({
        label: s.name,
        value: s.id,
        hidden: false,
      })),
    });
  } catch (err: any) {
    console.error('[options/sequences]', err?.response?.data ?? err.message);
    res.status(500).json({ options: [] });
  }
});

// ── POST /options/users ───────────────────────────────────────────────────────

/**
 * POST /options/users
 * Returns all portal users as dropdown options (label = full name or email).
 */
router.post('/users', async (req: Request, res: Response) => {
  const portalId = extractPortalId(req.body);
  if (!portalId) { res.status(400).json({ options: [] }); return; }

  try {
    const users = await getUsers(portalId);
    res.json({
      options: users.map((u) => ({
        label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        value: u.id,
        description: u.email,
        hidden: false,
      })),
    });
  } catch (err: any) {
    console.error('[options/users]', err?.response?.data ?? err.message);
    res.status(500).json({ options: [] });
  }
});

// ── POST /options/sender-emails ───────────────────────────────────────────────

/**
 * POST /options/sender-emails
 * Returns the email address(es) for the selected sender user.
 * Depends on inputFields.senderId being set first; falls back to all users'
 * emails when no sender has been chosen yet.
 */
router.post('/sender-emails', async (req: Request, res: Response) => {
  const portalId = extractPortalId(req.body);
  if (!portalId) { res.status(400).json({ options: [] }); return; }

  const senderId: string | undefined = req.body?.inputFields?.senderId;

  try {
    if (senderId) {
      const emails = await getUserEmails(portalId, senderId);
      res.json({
        options: emails.map((email) => ({
          label: email,
          value: email,
          hidden: false,
        })),
      });
    } else {
      // No sender selected yet – show all users' emails
      const users = await getUsers(portalId);
      res.json({
        options: users
          .filter((u) => Boolean(u.email))
          .map((u) => ({
            label: u.email,
            value: u.email,
            hidden: false,
          })),
      });
    }
  } catch (err: any) {
    console.error('[options/sender-emails]', err?.response?.data ?? err.message);
    res.status(500).json({ options: [] });
  }
});

export default router;
