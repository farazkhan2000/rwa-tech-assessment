const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('live Arbitrum One network, balance and USDC name', { skip: process.env.BLOCKCHAIN_LIVE_TEST !== '1' }, async t => {
  const app = require('../app');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
  const base = `http://127.0.0.1:${server.address().port}/api/blockchain`;
  const root = await fetch(base.replace('/api/blockchain', '/'), { signal: AbortSignal.timeout(2000) });
  assert.equal(root.status, 200);
  assert.match(await root.text(), /Server is Running/);
  const requests = [
    ['network'],
    [`balance/${address}`],
    ['contract/read', { contractAddress: address, abi: ['function name() view returns (string)'], method: 'name', args: [] }],
  ];
  const results = await Promise.all(requests.map(async ([path, body]) => {
    const response = await fetch(`${base}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    assert.equal(response.status, 200, `${path}: ${result.message}`);
    assert.equal(result.success, true);
    return result.data;
  }));
  assert.equal(results[0].chainId, 42161);
  assert.match(results[1].balanceWei, /^\d+$/);
  assert.equal(results[2], 'USD Coin');
});
