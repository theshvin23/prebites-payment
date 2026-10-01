const http = require('http');
const crypto = require('crypto');
const querystring = require('querystring');
const axios = require('axios');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'https://pre-order-fyp.web.app').replace(/\/$/, '');
const BILLPLZ_BASE_URL = 'https://www.billplz-sandbox.com/api/v3';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'pre-order-fyp';
const ALLOWED_ORIGINS = new Set([
  FRONTEND_BASE_URL,
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)
]);

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID
});

const auth = admin.auth();
const db = admin.firestore();

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text, contentType = 'text/plain') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
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
        if ((req.headers['content-type'] || '').includes('application/json')) {
          return resolve(JSON.parse(body));
        }
        resolve(querystring.parse(body));
      } catch {
        reject(new Error('Invalid request body'));
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
  const { amount, orderId } = body || {};
  const numericAmount = Number(amount);
  const secret = process.env.BILLPLZ_SECRET_KEY;
  const collectionId = process.env.BILLPLZ_COLLECTION_ID;

  if (!secret || !collectionId) {
    return sendJSON(res, 503, { error: 'Billplz Sandbox credentials are not configured on the backend.' });
  }
  if (!orderId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return sendJSON(res, 400, { error: 'Maklumat bil tidak lengkap atau tidak sah.' });
  }

  const authorization = req.headers.authorization || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) return sendJSON(res, 401, { error: 'Sila log masuk semula sebelum membuat pembayaran.' });

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    if (!decodedToken.email) return sendJSON(res, 403, { error: 'Akaun Firebase tiada alamat email yang sah.' });

    const orderRef = db.collection('orders').doc(String(orderId));
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) return sendJSON(res, 404, { error: 'Pesanan tidak ditemui.' });

    const order = orderSnapshot.data();
    if (order.customerId !== decodedToken.uid || order.paymentMethod !== 'FPX' || order.paymentStatus !== 'pending_fpx') {
      return sendJSON(res, 403, { error: 'Pesanan ini tidak sah untuk pembayaran FPX.' });
    }
    if (Math.round(Number(order.totalPrice) * 100) !== Math.round(numericAmount * 100)) {
      return sendJSON(res, 400, { error: 'Jumlah bil tidak sepadan dengan pesanan.' });
    }

    const response = await axios.post(
      `${BILLPLZ_BASE_URL}/bills`,
      {
        collection_id: collectionId,
        email: decodedToken.email,
        name: order.customerName || decodedToken.name || 'PreBites Customer',
        amount: Math.round(numericAmount * 100),
        callback_url: `${PUBLIC_BASE_URL}/api/billplz-webhook`,
        redirect_url: `${FRONTEND_BASE_URL}/payment.html?payment=returned&order_id=${encodeURIComponent(orderId)}`,
        reference_1: orderId,
        reference_1_label: 'PreBites Order',
        description: 'PreBites Food Order'
      },
      { auth: { username: secret, password: '' }, timeout: 20000 }
    );

    await orderRef.update({
      billplzId: response.data.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return sendJSON(res, 200, { url: response.data.url, billId: response.data.id });
  } catch (error) {
    console.error('Create bill error:', error.response?.data || error.message);
    return sendJSON(res, 502, { error: 'Gagal menyediakan pembayaran FPX.' });
  }
}

async function webhookHandler(req, res, body) {
  const rawPayload = body?.billplz || body || {};
  const payload = Object.fromEntries(Object.entries(rawPayload).map(([key, value]) => [
    key,
    Array.isArray(value) ? value[0] : value
  ]));
  const secret = process.env.BILLPLZ_SECRET_KEY;

  if (!secret) return sendText(res, 503, 'Billplz callback verification is not configured');
  if (!verifyCallbackSignature(payload, payload.x_signature, secret)) {
    return sendText(res, 401, 'Invalid signature');
  }

  const orderId = payload.reference_1;
  if (!orderId) return sendText(res, 400, 'Missing order reference');

  try {
    const orderRef = db.collection('orders').doc(String(orderId));
    const paid = payload.paid === true || payload.paid === 'true';
    await db.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) throw new Error('Order not found');

      const order = orderSnapshot.data();
      if (order.paymentMethod !== 'FPX') throw new Error('Order is not a Billplz order');
      if (order.billplzId && payload.id && order.billplzId !== payload.id) {
        throw new Error('Bill ID does not match order');
      }

      transaction.update(orderRef, {
        paymentStatus: paid ? 'paid' : 'failed',
        billplzId: payload.id || order.billplzId || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  } catch (error) {
    console.error('Webhook order update error:', error.message);
    return sendText(res, error.message === 'Order not found' ? 404 : 409, 'Order update rejected');
  }

  return sendText(res, 200, 'OK');
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return sendText(res, 403, 'Origin not allowed');
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

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
  console.log(`Billplz Sandbox backend listening on port ${PORT}`);
  console.log(`Public API: ${PUBLIC_BASE_URL}/api/create-bill`);
  console.log(`Billplz callback: ${PUBLIC_BASE_URL}/api/billplz-webhook`);
  console.log(`Customer redirect: ${FRONTEND_BASE_URL}/payment.html`);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('Set GOOGLE_APPLICATION_CREDENTIALS to a local, uncommitted Firebase Admin key before processing payments.');
  }
});
