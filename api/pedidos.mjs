import { createHash, timingSafeEqual } from 'node:crypto';
import { listOrders } from '../lib/orders.mjs';
import { confirmCharge } from '../lib/xpag.mjs';

const hash = value => createHash('sha256').update(value).digest();
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).send('Método não permitido.');
  const password = process.env.ADMIN_KEY;
  if (!password || !process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).send('Painel ainda não configurado.');
  const supplied = req.headers.authorization ?? '';
  const expected = 'Basic ' + Buffer.from('admin:' + password).toString('base64');
  if (!timingSafeEqual(hash(supplied), hash(expected))) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Pedidos Raspaditos", charset="UTF-8"');
    return res.status(401).send('Acesso restrito.');
  }
  try {
    const { orders, cursor } = await listOrders(typeof req.query.cursor === 'string' ? req.query.cursor : undefined);
    const rows = await Promise.all(orders.map(async order => {
      let status = 'Não foi possível consultar';
      try { status = await confirmCharge(order) ? 'Confirmado' : 'Sem confirmação'; } catch {}
      const type = order.kind === 'package' ? 'Raspadinhas · ' + order.option : 'Frete · ' + order.option;
      return '<tr>' + [order.createdAt, type, order.name, order.email, order.phone, order.address,
        order.amount + ' MXN', status, order.transactionId].map(value => '<td>' + escape(value) + '</td>').join('') + '</tr>';
    }));
    const next = cursor ? '<a href="/pedidos?cursor=' + encodeURIComponent(cursor) + '">Próxima página</a>' : '';
    return res.status(200).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedidos | Raspaditos MX</title><style>body{margin:24px;background:#260c17;color:#fff9ef;font:16px system-ui}h1,a{color:#f1cf88}.table{overflow:auto;margin:20px 0}table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #86515c;text-align:left}th{background:#46182a}</style><h1>Pedidos do Raspaditos MX</h1><a href="/pedidos">Atualizar</a>' +
      (rows.length ? '<div class="table"><table><thead><tr><th>Data UTC</th><th>Tipo</th><th>Nome</th><th>E-mail</th><th>Celular</th><th>Endereço</th><th>Valor</th><th>Status SPEI</th><th>Transação XPAG</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '<p>Nenhum pedido registrado.</p>') + next);
  } catch {
    return res.status(502).send('Não foi possível carregar os pedidos.');
  }
}
