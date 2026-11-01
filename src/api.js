const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api/v1').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, code, details) { super(message); this.status = status; this.code = code; this.details = details }
}

export function orderAccessError(error) {
  if (error?.status === 401) return 'Login required to view this order.'
  if (error?.status === 403) return "You don't have permission to view this order."
  if (error?.status === 404) return 'Order not found.'
  if (error?.status >= 500) return 'Unable to load order. Please try again.'
  return error?.message || 'Unable to load order.'
}

export async function api(path, options = {}) {
  const token = localStorage.getItem('printready_token')
  const isForm = options.body instanceof FormData
  const headers = { ...(isForm ? {} : options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  let response
  try { response = await fetch(`${BASE}${path}`, { ...options, headers }) }
  catch { throw new ApiError('Unable to reach PrintReady. Check that the backend is running at the configured API URL.', 0, 'NETWORK_ERROR') }
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const problem = payload?.error || {}
    throw new ApiError(problem.message || `Request failed (${response.status})`, response.status, problem.code, problem.details)
  }
  return payload?.data ?? payload
}

const json = body => JSON.stringify(body)
export const endpoints = {
  register: body => api('/auth/register', { method: 'POST', body: json(body) }),
  registerOwner: body => api('/auth/register/shop-owner', { method: 'POST', body: json(body) }),
  login: body => api('/auth/login', { method: 'POST', body: json(body) }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  me: () => api('/auth/me'),
  shops: params => api(`/shops${params?.toString() ? `?${params}` : ''}`),
  shop: id => api(`/shops/${encodeURIComponent(id)}`),
  services: id => api(`/shops/${encodeURIComponent(id)}/services`),
  createShop: body => api('/shops', { method: 'POST', body: json(body) }),
  replaceShopServices: (id, services) => api(`/shops/${encodeURIComponent(id)}/services`, { method: 'PUT', body: json({ services }) }),
  replaceShopHours: (id, hours) => api(`/shops/${encodeURIComponent(id)}/hours`, { method: 'PUT', body: json({ hours }) }),
  configureShopPaymentQr: (id, { image, paymentMethod, recipientName, walletNumber }) => {
    const body = new FormData()
    body.append('qrImage', image)
    body.append('paymentMethod', paymentMethod)
    body.append('recipientName', recipientName)
    if (walletNumber) body.append('walletNumber', walletNumber)
    return api(`/shops/${encodeURIComponent(id)}/payment-qr`, { method: 'PUT', body })
  },
  updateProfile: body => api('/users/me', { method: 'PATCH', body: json(body) }),
  upload: async form => { const result = await api('/files', { method: 'POST', body: form }); return result.file ?? result },
  deleteFile: id => api(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  orders: () => api('/orders'),
  order: id => api(`/orders/${encodeURIComponent(id)}`),
  orderFile: (orderId, fileId) => authenticatedBlob(`/orders/${encodeURIComponent(orderId)}/files/${encodeURIComponent(fileId)}`),
  createOrder: body => api('/orders', { method: 'POST', body: json(body) }),
  confirmOrder: id => api(`/orders/${encodeURIComponent(id)}/confirm`, { method: 'PATCH', body: '{}' }),
  rejectOrder: (id, reason) => api(`/orders/${encodeURIComponent(id)}/reject`, { method: 'PATCH', body: json({ reason }) }),
  setOrderStatus: (id, status) => api(`/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: json({ status }) }),
  confirmPickup: id => api(`/orders/${encodeURIComponent(id)}/pickup/confirm`, { method: 'POST', body: '{}' }),
  checkout: id => api(`/orders/${encodeURIComponent(id)}/payments/checkout`, { method: 'POST', body: '{}' }),
  payments: id => api(`/orders/${encodeURIComponent(id)}/payments`),
  paymentInstructions: id => api(`/orders/${encodeURIComponent(id)}/payment-instructions`),
  paymentQrImage: id => authenticatedBlob(`/orders/${encodeURIComponent(id)}/payment-qr`),
  submitPaymentProof: (id, { referenceNumber, note, receipt }) => {
    const body = new FormData()
    body.append('referenceNumber', referenceNumber)
    if (note) body.append('note', note)
    if (receipt) body.append('receipt', receipt)
    return api(`/orders/${encodeURIComponent(id)}/payments/proof`, { method: 'POST', body })
  },
  reviewPayment: (id, status, reason) => api(`/orders/${encodeURIComponent(id)}/payments/review`, { method: 'PATCH', body: json({ status, ...(reason ? { reason } : {}) }) }),
  orderMessages: (id, params = '') => api(`/orders/${encodeURIComponent(id)}/messages${params ? `?${params}` : ''}`),
  sendOrderMessage: (id, message) => api(`/orders/${encodeURIComponent(id)}/messages`, { method: 'POST', body: json({ message }) }),
  ownerDashboard: () => api('/owner/dashboard'),
  ownerOrders: () => api('/owner/orders'),
  ownerShops: () => api('/owner/shops'),
  adminDashboard: () => api('/admin/dashboard'),
  pendingShops: () => api('/admin/shops/pending'),
  adminShop: id => api(`/admin/shops/${encodeURIComponent(id)}`),
  adminOrders: () => api('/admin/orders'),
  adminDisputes: () => api('/admin/disputes'),
  reviewDispute: (id,status,resolutionNotes) => api('/admin/disputes/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({status,resolutionNotes}) }),
  verifyShop: (id, status, notes) => api(`/admin/shops/${encodeURIComponent(id)}/verification`, { method: 'PATCH', body: json({ status, notes }) }),
}

async function authenticatedBlob(path) {
  const token = localStorage.getItem('printready_token')
  let response
  try { response = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }) }
  catch { throw new ApiError('Unable to reach PrintReady. Check that the backend is running at the configured API URL.', 0, 'NETWORK_ERROR') }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const problem = payload?.error || {}
    throw new ApiError(problem.message || `Request failed (${response.status})`, response.status, problem.code, problem.details)
  }
  return response.blob()
}
