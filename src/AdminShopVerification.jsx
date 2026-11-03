import { useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import RejectReasonModal from './RejectReasonModal.jsx'
import { formatCents, formatPricingOption } from './currency.js'

const php = cents => typeof cents === 'number' ? formatCents(cents) : '—'

export default function AdminShopVerification({ shops = [], loading, error, busy, onReview, onRefresh, onLoadMore, hasMore, loadingMore }) {
  const [notes, setNotes] = useState({})
  const [rejectShop, setRejectShop] = useState(null)
  return <section className="panel admin-review-panel">
    <div className="panel-heading">
      <div><h2>Shop verification</h2><p>Review the business, owner, and listed printing services before making a decision.</p></div>
      <button className="button secondary small" onClick={onRefresh} disabled={loading || busy}><RefreshCw size={14}/> Refresh</button>
    </div>
    {error && <div className="admin-review-error" role="alert">{error}</div>}
    {loading ? <p className="muted">Loading pending registrations…</p> : shops.length === 0 ? <div className="admin-review-empty"><b>All caught up</b><span>No shops are waiting for verification.</span></div> : <div className="admin-review-list">{shops.map(shop => <article className="admin-review-card" key={shop.id}>
      <div className="admin-review-title"><div><small>PRINTING SHOP</small><h3>{shop.shopName}</h3></div><span className={`admin-review-status ${shop.verificationStatus?.toLowerCase()}`}>{shop.verificationStatus}</span></div>
      <div className="admin-review-facts">
        <div><small>OWNER</small><b>{shop.owner?.fullName || 'Owner'}</b><span>{shop.owner?.email || '—'}</span></div>
        <div><small>ADDRESS</small><b>{shop.address || '—'}</b><span>{shop.city || '—'}</span></div>
        <div><small>CONTACT</small><b>{shop.contactNumber || 'Not provided'}</b><span>Operating: {shop.operatingStatus}</span></div>
        <div><small>REGISTERED</small><b>{shop.createdAt ? new Date(shop.createdAt).toLocaleDateString() : '—'}</b><span>{shop.createdAt ? new Date(shop.createdAt).toLocaleTimeString() : ''}</span></div>
      </div>
      <div className="admin-review-services"><div className="admin-review-section-title"><b>Printing services</b><span>{shop.services?.length || 0} listed</span></div>
        {shop.services?.length ? <div className="admin-service-list">{shop.services.map(service => <div className="admin-service-row" key={service.id}><div><b>{service.serviceName}</b><span>{service.serviceType} · {service.isAvailable ? 'Available' : 'Paused'}</span></div><div>{Object.entries(service.pricingConfiguration?.rates || {}).map(([key, value]) => <span className="admin-price-chip" key={key}>{formatPricingOption(key)} — {php(value)}</span>)}</div></div>)}</div> : <p className="muted">No services listed.</p>}
      </div>
      <label className="admin-review-note"><span>Approval note <small>(optional; saved to the shop record)</small></span><textarea rows="2" maxLength="1000" value={notes[shop.id] || ''} onChange={event => setNotes(value => ({ ...value, [shop.id]: event.target.value }))} placeholder="Add optional approval guidance" /></label>
      <div className="admin-review-actions"><button className="button secondary" disabled={busy} onClick={() => setRejectShop(shop)}><X size={15}/> Reject</button><button className="button primary" disabled={busy} onClick={() => onReview(shop.id, 'VERIFIED', notes[shop.id] || '')}><Check size={15}/> Approve shop</button></div>
    </article>)}</div>}
    {hasMore && <button className="button secondary" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? 'Loading shops…' : 'Load more shops'}</button>}
    {rejectShop && <RejectReasonModal title="Reject Shop Application" description="Are you sure you want to reject this shop application? Please provide a reason so the shop owner understands why it was rejected." busy={busy} onCancel={() => setRejectShop(null)} onConfirm={reason => Promise.resolve(onReview(rejectShop.id, 'REJECTED', reason)).then(() => setRejectShop(null))}/>}
  </section>
}
