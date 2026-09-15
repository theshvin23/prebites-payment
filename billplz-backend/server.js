const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');
const express = require('express');
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
if (!serviceAccount.project_id) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const app = express();
const port = process.env.PORT || 3000;
const appUrl = process.env.APP_URL || 'https://pre-order-fyp.web.app';
const billplzBaseUrl = 'https://www.billplz-sandbox.com/api/v3';

app.use(cors({ origin: appUrl }));
app.use(express.json());

function verifyCallbackSignature(payload, signature) {
  if (!signature || !process.env.BILLPLZ_SECRET_KEY) return false;

  const signedValues = Object.keys(payload)
    .filter(key => key !== 'x_signature' && payload[key] !== undefined)
    .sort()
    .map(key => `${key}=${payload[key]}`)
    .join('|');
  const calculated = Buffer.from(
    crypto.createHmac('sha256', process.env.BILLPLZ_SECRET_KEY).update(signedValues).digest('hex')
  );
  const received = Buffer.from(String(signature));

  return received.length === calculated.length && crypto.timingSafeEqual(calculated, received);
}

async function verifyUser(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return admin.auth().verifyIdToken(authorization.slice(7));
}

app.post('/api/create-bill', async (req, res) => {
  const { email, name, amount, description, orderId } = req.body || {};
  const numericAmount = Number(amount);

  if (!email || !name || !orderId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Maklumat bil tidak lengkap atau tidak sah.' });
  }

  try {
    const user = await verifyUser(req);
    const orderSnapshot = await db.collection('orders').doc(orderId).get();
    const order = orderSnapshot.data();

    if (!user || !orderSnapshot.exists || order.customerId !== user.uid || Number(order.totalPrice) !== numericAmount) {
      return res.status(403).json({ error: 'Pesanan tidak sah untuk akaun ini.' });
    }

    const response = await axios.post(
      `${billplzBaseUrl}/bills`,
      {
        collection_id: process.env.BILLPLZ_COLLECTION_ID,
        email,
        name,
        amount: Math.round(numericAmount * 100),
        callback_url: `${process.env.RENDER_EXTERNAL_URL || appUrl}/api/billplz-webhook`,
        redirect_url: `${appUrl}/payment.html?payment=returned`,
        reference_1: orderId,
        reference_1_label: 'PreBites Order',
        description: description || 'PreBites Food Order'
      },
      { auth: { username: process.env.BILLPLZ_SECRET_KEY, password: '' } }
    );

    return res.json({ url: response.data.url, billId: response.data.id });
  } catch (error) {
    console.error('Billplz create bill error:', error.response?.data || error.message);
    return res.status(502).json({ error: 'Gagal menyediakan pembayaran FPX.' });
  }
});

app.post('/api/billplz-webhook', async (req, res) => {
  const payload = req.body?.billplz || req.body || {};

  if (!verifyCallbackSignature(payload, payload.x_signature)) {
    return res.status(401).send('Invalid signature');
  }

  if (payload.reference_1) {
    await db.collection('orders').doc(payload.reference_1).set({
      paymentStatus: payload.paid === 'true' || payload.paid === true ? 'paid' : 'failed',
      billplzId: payload.id || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return res.status(200).send('OK');
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(port, () => console.log(`Billplz backend listening on port ${port}`));
