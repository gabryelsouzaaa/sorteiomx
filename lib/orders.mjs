import { get, list, put } from '@vercel/blob';

export async function saveOrder(charge, details) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const pathname = 'raspaditos/orders/' + Date.now() + '-' + charge.externalId + '.json';
  await put(pathname, JSON.stringify({ ...details, externalId: charge.externalId,
    transactionId: charge.transactionId, amount: charge.amount, currency: charge.currency,
    createdAt: new Date().toISOString() }), { access: 'private', contentType: 'application/json' });
}

export async function listOrders(cursor) {
  const page = await list({ prefix: 'raspaditos/orders/', limit: 20, cursor });
  const orders = await Promise.all(page.blobs.map(async blob => {
    const result = await get(blob.pathname, { access: 'private' });
    if (!result?.stream) throw new Error('Order unavailable');
    return new Response(result.stream).json();
  }));
  return { orders, cursor: page.hasMore ? page.cursor : null };
}
