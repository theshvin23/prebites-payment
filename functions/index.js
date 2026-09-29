const crypto = require('crypto');
const axios = require('axios');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getAuth } = require('firebase-admin/auth');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const adminAuth = getAuth();
const db = getFirestore();
const billplzSecretKey = defineSecret('BILLPLZ_SECRET_KEY');
const collectionId = defineSecret('BILLPLZ_COLLECTION_ID');
const billplzBaseUrl = 'https://www.billplz-sandbox.com/api/v3';

function getBillplzValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
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

exports.billplzApi = onRequest(
  { secrets: [billplzSecretKey, collectionId], region: 'asia-southeast1' },
  async (req, res) => {
    if (req.method === 'POST' && ['/create-bill', '/api/create-bill'].includes(req.path)) {
      const { email, name, amount, description, orderId } = req.body || {};
      const numericAmount = Number(amount);
      const authorization = req.headers.authorization || '';
      const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

      if (!email || !name || !orderId || !idToken || !Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: 'Maklumat bil tidak lengkap atau tidak sah.' });
      }

      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const orderSnapshot = await db.collection('orders').doc(orderId).get();
        const order = orderSnapshot.data();

        if (!orderSnapshot.exists || order.customerId !== decodedToken.uid || Number(order.totalPrice) !== numericAmount) {
          return res.status(403).json({ error: 'Pesanan tidak sah untuk akaun ini.' });
        }

        const response = await axios.post(
          `${billplzBaseUrl}/bills`,
          {
            collection_id: collectionId.value(),
            email,
            name,
            amount: Math.round(numericAmount * 100),
            callback_url: 'https://pre-order-fyp.web.app/api/billplz-webhook',
            redirect_url: `https://pre-order-fyp.web.app/payment.html?payment=returned&order_id=${encodeURIComponent(orderId)}`,
            reference_1: orderId,
            reference_1_label: 'PreBites Order',
            description: description || 'PreBites Food Order'
          },
          { auth: { username: billplzSecretKey.value(), password: '' } }
        );

        return res.json({ url: response.data.url, billId: response.data.id });
      } catch (error) {
        console.error('Billplz create bill error:', error.response?.data || error.message);
        return res.status(502).json({ error: 'Gagal menyediakan pembayaran FPX.' });
      }
    }

    if (req.method === 'POST' && ['/billplz-webhook', '/api/billplz-webhook'].includes(req.path)) {
      const payload = Object.fromEntries(
        Object.entries(req.body?.billplz || req.body || {}).map(([key, value]) => [key, getBillplzValue(value)])
      );
      const signature = payload.x_signature;

      if (!verifyCallbackSignature(payload, signature, billplzSecretKey.value())) {
        return res.status(401).send('Invalid signature');
      }

      const orderId = payload.reference_1;
      if (orderId) {
        await db.collection('orders').doc(orderId).set({
          paymentStatus: payload.paid === 'true' || payload.paid === true ? 'paid' : 'failed',
          billplzId: payload.id || null,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      return res.status(200).send('OK');
    }

    return res.status(404).send('Not found');
  }
);