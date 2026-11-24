import { createHmac, timingSafeEqual } from 'node:crypto';
import { createCharge, confirmCharge, quote } from '../lib/xpag.mjs';

const rewards = {
  1: 'PlayStation 5',
  3: 'PlayStation 5',
  5: 'iPhone 18 Pro Max',
  10: 'Televisor de 60 pulgadas',
};

function signature(payload) {
  if (!process.env.XPAG_CLIENT_SECRET) throw new Error('Missing XPAG credentials');
  return createHmac('sha256', process.env.XPAG_CLIENT_SECRET)
    .update('raspaditos:checkout:v1:' + payload).digest();
}

function seal(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + signature(payload).toString('base64url');
}

function read(token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, encoded] = parts;
  const actual = Buffer.from(encoded, 'base64url');
  const expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    const body = req.body ?? {};
    if (body.action === 'status') {
      const charge = read(body.token);
      if (!charge) return res.status(400).json({ error: 'Referencia inválida.' });
      const paid = await confirmCharge(charge);
      return res.json({ paid, tickets: paid && charge.kind === 'package' ?
        Array.from({ length: Number(charge.option) }, (_, index) =>
          index + 1 === Number(charge.option) ? rewards[charge.option] : 'Sin regalo') : undefined });
    }
    const { kind, option } = body;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (body.action !== 'create' || typeof option !== 'string' || quote(kind, option) === null ||
        name.length < 3 || name.length > 120 || email.length > 160 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Revisa los datos del pedido.' });
    }
    const charge = await createCharge({ kind, option, name, email });
    const { transactionId, amount, currency } = charge;
    const token = seal({ transactionId, amount, currency, kind, option });
    return res.json({ ...charge, token });
  } catch {
    return res.status(502).json({ error: 'No pudimos verificar el pago con XPAG. Intenta más tarde.' });
  }
}
