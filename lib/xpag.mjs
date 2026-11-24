import { randomUUID } from 'node:crypto';

const prices = {
  package: { 1: 60, 2: 90, 3: 120, 5: 200, 10: 300 },
  shipping: { mexpost: 100, fedex: 120 },
};

export function quote(kind, option) {
  if (!Object.hasOwn(prices, kind)) return null;
  return Object.hasOwn(prices[kind], option) ? prices[kind][option] : null;
}

async function request(path, body) {
  const id = process.env.XPAG_CLIENT_ID;
  const secret = process.env.XPAG_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing XPAG credentials');
  const response = await fetch('https://api.xpag.global' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Client-Id': id, 'X-Client-Secret': secret, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error('XPAG request failed');
  return data;
}

export async function createCharge({ kind, option, name, email, webhookUrl }) {
  const amount = quote(kind, option);
  if (amount === null) throw new Error('Invalid checkout option');
  const externalId = 'RASP-' + randomUUID();
  const data = await request('/cashin', {
    currency: 'MXN', amount, external_id: externalId,
    description: kind === 'package' ? 'Paquete Raspaditos' : 'Envío Raspaditos',
    name, email, webhook_url: webhookUrl,
  });
  const payee = data.payee_data ?? {};
  const clabe = data.clabe ?? payee.clabe;
  if (!data.transaction_id || !/^\d{18}$/.test(String(clabe))) throw new Error('Incomplete SPEI instructions');
  return { externalId, transactionId: data.transaction_id, amount, currency: 'MXN', clabe,
    bank: data.bank_name ?? payee.bank_name, beneficiary: data.beneficiary ?? payee.beneficiary,
    reference: data.reference ?? payee.reference };
}

export async function confirmCharge(charge) {
  const data = await request('/consult-transaction?transaction_id=' + encodeURIComponent(charge.transactionId));
  return ['confirmed', 'completed'].includes(String(data.status).toLowerCase()) &&
    data.transaction_id === charge.transactionId &&
    Number(data.amount) === charge.amount && data.currency === charge.currency;
}
