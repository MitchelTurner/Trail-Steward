import path from 'node:path';
import { writeFixtureFile } from '../src/import/fixture';
import { findRepoRoot } from '../src/pathways/seed';

async function main(): Promise<void> {
  const root = findRepoRoot(path.resolve(__dirname, '../../..'));
  const target = path.join(root, 'data', 'SEC_Trail_Coordination_Guide_Draft_V2.xlsx');
  await writeFixtureFile(target);
  console.log(`Wrote ${target}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
