import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../server.js', import.meta.url));
const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const marker = '// ==================== START ====================';
assert.equal(source.split(marker).length, 2, 'Startup boundary must remain explicit');

async function start(t) {
    const allowed = new Set(['express', './package.json', './server-card.json']);
    const deny = () => { throw new Error('Unexpected upstream call in catalog test'); };
    const context = {
        require(name) {
            if (name === 'axios') return { get: deny, post: deny };
            assert.ok(allowed.has(name), `Unexpected dependency: ${name}`);
            return require(name);
        },
        process: { env: {} },
    };
    const app = vm.runInNewContext(source.split(marker)[0] + '\napp;', context);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
}

it('SDK discovery removes obsolete recommendations and preserves the current SDK', async t => {
    const base = await start(t);
    const response = await fetch(`${base}/tools/get_sdk_info`, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['license', 'nattdata_sdk', 'supportedChains', 'verification']);
    assert.equal(body.nattdata_sdk.python.install, 'pip install nattdata');
    assert.equal(body.nattdata_sdk.typescript.install, 'npm install nattdata-sdk');
    assert.equal(body.license, 'MIT');
    assert.ok(body.verification.ndatToken.address);
});

it('the actual HTTP catalog lists the five Terminal tools', async t => {
    const base = await start(t);
    const response = await fetch(`${base}/tools`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.tools.map(tool => tool.name), [
        'get_agent_manifest', 'get_liq_radar', 'swap_via_nattswap', 'get_native_depth', 'get_l2_archive_catalog',
    ]);
    assert.ok(body.tools.every(tool => tool.path === '/mcp/protocol'));
    assert.equal(body.mcp.streamable_http, '/mcp/protocol');
});

it('only the configured JavaScript server remains', () => {
    assert.equal(require('./package.json').main, 'server.js');
    const docker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
    assert.match(docker, /CMD \["node", "server.js"\]/);
    assert.equal(existsSync(new URL('../server.ts', import.meta.url)), false);
});

for (const name of ['claim', 'cycles', 'ndat', 'swap']) {
    it(`the unreferenced ${name} TypeScript wrapper is absent`, () => {
        assert.equal(existsSync(new URL(`../tools/${name}.ts`, import.meta.url)), false);
    });
}
