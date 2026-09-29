const http = require('http');
const crypto = require('crypto');
const axios = require('axios');

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || PUBLIC_BASE_URL;
const BILLPLZ_BASE_URL = 'https://www.billplz-sandbox.com/api/v3';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, ngrok-skip-browser-warning', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text, contentType = 'text/plain') {
  res.writeHead(statusCode, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, ngrok-skip-browser-warning', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function verifyCallbackSignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const signedValues = Object.keys(payload)
    .filter(key => key !== 'x_signature' && payload[key] !== undefined)
    .sort()
    .map(key => `${key}=${payload[key]}`)
    .join('|');
  const expected = crypto.createHmac('sha256', secret).update(signedValues).digest('hex');
  const received = Buffer.from(String(signature));
  const calculated = Buffer.from(expected);
  return received.length === calculated.length && crypto.timingSafeEqual(calculated, received);
}

async function createBillHandler(req, res, body) {
  const { email, name, amount, description, orderId } = body || {};
  const numericAmount = Number(amount);

  if (!email || !name || !orderId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return sendJSON(res, 400, { error: 'Maklumat bil tidak lengkap atau tidak sah.' });
  }

  const secret = process.env.BILLPLZ_SECRET_KEY;
  const collectionId = process.env.BILLPLZ_COLLECTION_ID;

  try {
    if (secret && collectionId) {
      const response = await axios.post(
        `${BILLPLZ_BASE_URL}/bills`,
        {
          collection_id: collectionId,
          email,
          name,
          amount: Math.round(numericAmount * 100),
          callback_url: `${PUBLIC_BASE_URL}/api/billplz-webhook`,
          redirect_url: `${FRONTEND_BASE_URL}/payment.html?payment=returned&order_id=${encodeURIComponent(orderId)}`,
          reference_1: orderId,
          reference_1_label: 'PreBites Order',
          description: description || 'PreBites Food Order'
        },
        { auth: { username: secret, password: '' } }
      );

      return sendJSON(res, 200, { url: response.data.url, billId: response.data.id });
    }

    return sendJSON(res, 200, {
      url: `${PUBLIC_BASE_URL}/demo-payment.html?order_id=${encodeURIComponent(orderId)}&amount=${encodeURIComponent(numericAmount)}`,
      billId: `DEMO-${Date.now()}`
    });
  } catch (error) {
    console.error('Create bill error:', error.response?.data || error.message);
    return sendJSON(res, 502, { error: 'Gagal menyediakan pembayaran FPX.' });
  }
}

async function webhookHandler(req, res, body) {
  const payload = body?.billplz || body || {};
  const secret = process.env.BILLPLZ_SECRET_KEY;

  if (secret && !verifyCallbackSignature(payload, payload.x_signature, secret)) {
    return sendText(res, 401, 'Invalid signature');
  }

  console.log('Webhook received:', JSON.stringify(payload));
  return sendText(res, 200, 'OK');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendText(res, 204, '', 'text/plain');
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJSON(res, 200, { ok: true, app: 'demo-billplz-server', url: PUBLIC_BASE_URL });
  }

  if (req.method === 'POST' && (url.pathname === '/api/create-bill' || url.pathname === '/create-bill')) {
    try {
      const body = await readBody(req);
      return createBillHandler(req, res, body);
    } catch (error) {
      console.error('Create-bill read error:', error);
      return sendJSON(res, 400, { error: 'Invalid request body' });
    }
  }

  if (req.method === 'POST' && (url.pathname === '/api/billplz-webhook' || url.pathname === '/billplz-webhook')) {
    try {
      const body = await readBody(req);
      return webhookHandler(req, res, body);
    } catch (error) {
      console.error('Webhook read error:', error);
      return sendText(res, 400, 'Invalid request body');
    }
  }

  return sendText(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`Demo Billplz server running at ${PUBLIC_BASE_URL}`);
  console.log(`Endpoints: ${PUBLIC_BASE_URL}/api/create-bill and ${PUBLIC_BASE_URL}/api/billplz-webhook`);
});
