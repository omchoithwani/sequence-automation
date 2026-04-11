import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Middleware protecting the /admin routes.
 * Accepts the admin secret via:
 *   - Query param:   ?secret=XXX
 *   - Bearer header: Authorization: Bearer XXX
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const fromQuery = req.query.secret as string | undefined;
  const fromHeader = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const provided = fromQuery ?? fromHeader;

  if (!provided || provided !== config.adminSecret) {
    res.status(401).send(`
      <!doctype html><html><body style="font-family:sans-serif;padding:40px">
        <h2>Unauthorized</h2>
        <p>Provide the admin secret via <code>?secret=...</code> in the URL.</p>
      </body></html>
    `);
    return;
  }

  // Carry the secret through so server-rendered pages can embed it in form actions
  (req as any).adminSecret = provided;
  next();
}
