import type { IncomingMessage, ServerResponse } from 'http';
import { appPromise } from '../src/main';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await appPromise;
  return app(req as any, res as any);
}
