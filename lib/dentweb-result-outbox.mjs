import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

// Persist the native result BEFORE reporting it. A callback outage must never
// turn a successful native write into a failed job or trigger a second write.
export function createResultOutbox(directory) {
  const file = path.join(directory, 'pending-result.json');
  return {
    async load() {
      try { return JSON.parse(await readFile(file, 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async save(result) {
      await mkdir(directory, { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(result), { mode: 0o600 });
      await rename(file + '.tmp', file);
    },
    async deliver(send) {
      const pending = await this.load();
      if (!pending) return false;
      await send(pending.job, pending.status, pending.details);
      await unlink(file);
      return true;
    },
  };
}
