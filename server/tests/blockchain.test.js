const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ethers } = require('ethers');

const address = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const body = { contractAddress: address, abi: ['function name() view returns (string)'], method: 'name', args: [] };

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('blockchain endpoints succeed, validate input and fail fast on RPC failures', async t => {
  let mode = 'success';
  let requests = 0;
  const rpc = http.createServer((req, res) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      requests++;
      if (mode === 'stall') return;
      if (mode === 'rate-limit') {
        res.writeHead(429, { 'Retry-After': '120' });
        return res.end('rate limited');
      }
      const { id, method, params } = JSON.parse(data);
      if (method === 'eth_call') {
        assert.equal(params[0].to.toLowerCase(), address.toLowerCase());
        assert.equal(params[0].data, '0x06fdde03');
        assert.equal(params[1], 'latest');
      }
      const results = {
        eth_chainId: '0xa4b1',
        eth_blockNumber: '0x1234',
        eth_getBalance: '0xde0b6b3a7640000',
        eth_call: ethers.utils.defaultAbiCoder.encode(['string'], ['USD Coin']),
      };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result: results[method] }));
    });
  });
  const previousRpc = process.env.ARBITRUM_RPC_URL;
  process.env.ARBITRUM_RPC_URL = await listen(rpc);
  const { provider, RPC_TIMEOUT_MS } = require('../config/blockchain');
  // Exercise the real middleware and all controller imports, not just the router.
  const axios = require('axios');
  const originalGet = axios.get;
  let startupRequests = 0;
  axios.get = async () => { startupRequests++; return { data: { record: { cookie: '' } } }; };
  let app;
  try {
    app = require('../app');
    assert.equal(startupRequests, 0, 'App import must not download executable code');
  } finally {
    axios.get = originalGet;
  }
  const server = http.createServer(app);
  const base = `${await listen(server)}/api/blockchain`;
  t.after(() => {
    for (const s of [server, rpc]) { s.closeAllConnections(); s.close(); }
    if (previousRpc === undefined) delete process.env.ARBITRUM_RPC_URL;
    else process.env.ARBITRUM_RPC_URL = previousRpc;
  });

  async function request(path, payload) {
    const response = await fetch(`${base}/${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS + 5000),
    });
    return { status: response.status, ...await response.json() };
  }
  const endpoints = [['network'], [`balance/${address}`], ['contract/read', body]];

  await t.test('success responses use Arbitrum One and preserve result formats', async () => {
    const root = await fetch(base.replace('/api/blockchain', '/'), { signal: AbortSignal.timeout(2000) });
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Server is Running/);
    const [network, balance, contract] = await Promise.all(endpoints.map(args => request(...args)));
    assert.equal(network.status, 200);
    assert.deepEqual(network.data, { name: 'arbitrum', chainId: 42161, blockNumber: 4660 });
    assert.equal(balance.status, 200);
    assert.equal(balance.data.balanceWei, '1000000000000000000');
    assert.equal(balance.data.balanceEth, '1.0');
    assert.equal(contract.status, 200);
    assert.equal(contract.data, 'USD Coin');
  });

  await t.test('invalid input still returns 400', async () => {
    assert.equal((await request('balance/invalid')).status, 400);
    assert.equal((await request('contract/read', { ...body, contractAddress: 'invalid' })).status, 400);
    assert.equal((await request('contract/read', { ...body, method: 'missing' })).status, 400);
    assert.equal((await request('contract/read', { ...body, method: 'deployed' })).status, 400);
    assert.equal((await request('contract/read', { ...body, args: {} })).status, 400);
    assert.equal((await request('contract/read', { ...body, args: [1] })).status, 400);
  });

  await t.test('HTTP 429 does not retry or wait for Retry-After', async () => {
    mode = 'rate-limit';
    requests = 0;
    const start = Date.now();
    const results = await Promise.all(endpoints.map(args => request(...args)));
    results.forEach(result => assert.equal(result.status, 502));
    assert.equal(requests, 3);
    assert.ok(Date.now() - start < 3000);
  });

  await t.test('unresponsive RPC returns 504 for every endpoint within the deadline', async () => {
    mode = 'stall';
    const start = Date.now();
    const results = await Promise.all(endpoints.map(args => request(...args)));
    for (const result of results) {
      assert.equal(result.status, 504);
      assert.equal(result.success, false);
      assert.equal(result.message, 'Blockchain RPC request timed out');
    }
    assert.ok(Date.now() - start < RPC_TIMEOUT_MS + 2000);
    rpc.closeAllConnections();
  });

  await t.test('deadline also covers a provider operation that never settles', async () => {
    const original = provider.getNetwork;
    const originalCall = provider.call;
    provider.getNetwork = () => new Promise(() => {});
    provider.call = () => new Promise(() => {});
    try {
      const start = Date.now();
      const results = await Promise.all([request('network'), request('contract/read', body)]);
      results.forEach(result => assert.equal(result.status, 504));
      assert.ok(Date.now() - start < RPC_TIMEOUT_MS + 2000);
    } finally {
      provider.getNetwork = original;
      provider.call = originalCall;
    }
  });
});
