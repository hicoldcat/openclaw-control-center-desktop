const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const UPSTREAM_BRANCH = process.env.UPSTREAM_BRANCH || 'main';

function run(command, args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
      }
    });
  });
}

async function sync() {
  await run('git', ['submodule', 'sync', '--', 'upstream']);
  await run('git', ['submodule', 'update', '--init', '--remote', '--', 'upstream']);
  await run('git', ['-C', 'upstream', 'checkout', UPSTREAM_BRANCH]);
  await run('git', ['-C', 'upstream', 'pull', 'origin', UPSTREAM_BRANCH]);
}

sync().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
