/** Writes dist/json-schema/<name>.schema.json for editors, the Studio and external tools. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from './schema.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'json-schema');
await fs.mkdir(dir, { recursive: true });
for (const [name, schema] of Object.entries(SCHEMAS)) {
  await fs.writeFile(path.join(dir, `${name}.schema.json`), JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: `Rihla pack ${name}`, ...schema }, null, 2));
}
