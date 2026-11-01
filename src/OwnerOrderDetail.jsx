import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, MessageCircle, Send } from 'lucide-react'
import { endpoints, orderAccessError } from './api'
import './owner-order.css'

const money = cents => `PHP ${(Number(cents || 0) / 100).toFixed(2)}`
const pretty = value => value?.replaceAll('_', ' ') || 'Unknown'

export default function OwnerOrderDetail({ Shell }) {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [paymentReason, setPaymentReason] = useState('')
  const [qrImage, setQrImage] = useState(null)
  const [qrMethod, setQrMethod] = useState('GCASH')
  const [qrRecipient, setQrRecipient] = useState('')
  const [qrWallet, setQrWallet] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: endpoints.me, retry: false })
  const orderQuery = useQuery({ queryKey: ['order', orderId], queryFn: () => endpoints.order(orderId), retry: false, refetchInterval: 15000 })
  const order = orderQuery.data?.order
  const paymentsQuery = useQuery({ queryKey: ['order-payments', orderId], queryFn: () => endpoints.payments(orderId), enabled: !!order, retry: false, refetchInterval: 12000 })
  const messagesQuery = useQuery({ queryKey: ['order-messages', orderId], queryFn: () => endpoints.orderMessages(orderId), enabled: !!order, retry: false, refetchInterval: 5000 })
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['order', orderId] }),
    qc.invalidateQueries({ queryKey: ['order-payments', orderId] }),
    qc.invalidateQueries({ queryKey: ['order-messages', orderId] }),
    qc.invalidateQueries({ queryKey: ['owner-orders'] }),
  ])
  const action = useMutation({
    mutationFn: ({ type, value }) => type === 'confirm' ? endpoints.confirmOrder(orderId)
      : type === 'reject' ? endpoints.rejectOrder(orderId, value)
        : type === 'status' ? endpoints.setOrderStatus(orderId, value)
          : type === 'pickup' ? endpoints.confirmPickup(orderId)
            : endpoints.reviewPayment(orderId, value, value === 'REJECTED' ? paymentReason : undefined),
    onSuccess: async (result, variables) => { await refresh(); setActionSuccess(variables.type === 'confirm' ? 'Order confirmed. The customer can now view payment instructions.' : variables.type === 'pickup' ? 'Pickup handover confirmed. The order is complete.' : 'Order updated successfully.') },
  })
  const saveQr = useMutation({
    mutationFn: () => endpoints.configureShopPaymentQr(order.shop.id, { image: qrImage, paymentMethod: qrMethod, recipientName: qrRecipient, walletNumber: qrWallet }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['order', orderId] }); setQrImage(null); setActionSuccess('Shop payment QR saved. This order is ready to confirm.') },
  })
  const send = useMutation({ mutationFn: () => endpoints.sendOrderMessage(orderId, message), onSuccess: () => { setMessage(''); refresh() } })
  const download = useMutation({
    mutationFn: async item => {
      const blob = await endpoints.orderFile(orderId, item.fileId)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.file?.originalFilename || 'print-document.pdf'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })

  if (orderQuery.isLoading) return <Shell title="Loading order" kicker="SHOP ORDER"><div className="loading">Loading order…</div></Shell>
  if (orderQuery.error || !order) return <Shell title="Order unavailable" kicker="SHOP ORDER"><div className="notice">{orderAccessError(orderQuery.error)}</div>{orderQuery.error?.status === 401 && <Link className="button primary" to="/login">Log in</Link>}<Link className="button secondary owner-back" to="/owner">Back to shop dashboard</Link></Shell>

  const payments = paymentsQuery.data?.payments || []
  const manualPayment = payments.find(payment => payment.provider === 'manual_qr')
  const chat = messagesQuery.data?.messages || []
  const currentStatus = order.orderStatus

  return <Shell title="Order details" kicker="SHOP OWNER · FULFILLMENT" description={order.orderReference}>
    <div className="owner-order-page">
      <Link to="/owner" className="owner-back"><ArrowLeft size={14}/> Shop dashboard</Link>
      {(action.error || saveQr.error || download.error || paymentsQuery.error || messagesQuery.error) && <div className="notice">{action.error?.message || saveQr.error?.message || download.error?.message || paymentsQuery.error?.message || messagesQuery.error?.message}</div>}
      {actionSuccess && <div className="notice owner-success" role="status">{actionSuccess}</div>}
      <section className="panel owner-order-summary">
        <div><span className="eyebrow">ORDER STATUS</span><h2>{pretty(currentStatus)}</h2></div>
        <div className="owner-order-total"><small>Final total</small><b>{money(order.totalCents)}</b></div>
      </section>
      <div className="owner-order-grid">
        <section className="panel">
          <h2>Customer</h2>
          <p>{order.customer?.fullName || 'Customer'}</p>
          {order.customer?.email && <p className="muted">{order.customer.email}</p>}
          <p className="muted">Shop: {order.shop?.shopName} · {order.shop?.city}</p>
          {order.shop?.verificationStatus && <p className="muted">Shop verification: <b>{pretty(order.shop.verificationStatus)}</b></p>}
          <p className="muted">Submitted {new Date(order.createdAt).toLocaleString()}</p>
        </section>
        <section className="panel">
          <h2>Payment review</h2>
          {paymentsQuery.isLoading ? <p className="muted">Loading payment status…</p> : manualPayment ? <>
            <p><span className="eyebrow">PAYMENT</span> {pretty(manualPayment.status)}</p>
            <p><span className="eyebrow">SHOP REVIEW</span> {pretty(manualPayment.reviewStatus || 'NOT SUBMITTED')}</p>
            <p className="muted">Amount: {money(manualPayment.amountCents)} {manualPayment.currency}</p>
            {manualPayment.referenceNumber && <p className="muted">Reference: {manualPayment.referenceNumber}</p>}
            {manualPayment.rejectionReason && <p className="owner-rejection">Rejected: {manualPayment.rejectionReason}</p>}
            {manualPayment.reviewStatus === 'PENDING_VERIFICATION' && <div className="owner-review-actions">
              <button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ type: 'review', value: 'APPROVED' })}>Approve payment</button>
              <input aria-label="Payment rejection reason" value={paymentReason} onChange={event => setPaymentReason(event.target.value)} placeholder="Reason if rejecting"/>
              <button className="button secondary" disabled={action.isPending || paymentReason.trim().length < 3} onClick={() => action.mutate({ type: 'review', value: 'REJECTED' })}>Reject proof</button>
            </div>}
          </> : <p className="muted">{currentStatus === 'AWAITING_PAYMENT' ? 'Waiting for the customer to submit a wallet transfer reference.' : 'No payment record is attached yet.'}</p>}
        </section>
      </div>
      {currentStatus === 'SUBMITTED' && <section className="panel owner-qr-setup">
        <h2>Shop payment QR</h2>
        {order.shop?.verificationStatus !== 'VERIFIED' ? <p className="muted">The shop must be verified before accepting orders.</p> : <>
          {order.shop.paymentQrConfigured && <p className="muted">Configured: {order.shop.paymentMethod} · {order.shop.paymentRecipientName}{order.shop.paymentWalletNumber ? ` · ${order.shop.paymentWalletNumber}` : ''}</p>}
          {!order.shop.paymentQrConfigured && <p className="muted">Set up a GCash or Maya QR before confirming. Customers can pay the shop directly after confirmation.</p>}
          <form onSubmit={event => { event.preventDefault(); if (qrImage && qrRecipient.trim()) saveQr.mutate() }}>
            <select aria-label="Wallet payment method" value={qrMethod} onChange={event => setQrMethod(event.target.value)}><option value="GCASH">GCash</option><option value="MAYA">Maya</option></select>
            <input aria-label="Wallet recipient account name" required maxLength={120} value={qrRecipient} onChange={event => setQrRecipient(event.target.value)} placeholder="Recipient account name"/>
            <input aria-label="Wallet number" maxLength={40} value={qrWallet} onChange={event => setQrWallet(event.target.value)} placeholder="Wallet number (optional)"/>
            <input aria-label="Payment QR image" required type="file" accept="image/png,image/jpeg" onChange={event => setQrImage(event.target.files?.[0] || null)}/>
            <button className="button secondary" disabled={saveQr.isPending || !qrImage || !qrRecipient.trim()}>{saveQr.isPending ? 'Saving…' : 'Save payment QR'}</button>
          </form>
        </>}
      </section>}
      <section className="panel owner-order-items">
        <h2>Print specifications</h2>
        {order.items?.map(item => <article className="owner-order-item" key={item.id}>
          <div className="owner-item-heading"><div><b>{item.service?.serviceName || 'Printing service'}</b><small>{item.file?.originalFilename || 'PDF document'} · {item.pageCount} pages</small></div><button className="button secondary" onClick={() => download.mutate(item)} disabled={download.isPending}><Download size={14}/> Download PDF</button></div>
          <div className="owner-spec-grid"><span>Paper <b>{item.paperSize}</b></span><span>Color <b>{item.colorMode}</b></span><span>Sides <b>{item.printSides}</b></span><span>Copies <b>{item.copies}</b></span><span>Pages <b>{item.pageRange || 'All'}</b></span><span>Binding <b>{item.bindingType || 'None'}</b></span><span>Line total <b>{money(item.lineTotalCents)}</b></span></div>
          {item.specialInstructions && <p className="muted">Instructions: {item.specialInstructions}</p>}
        </article>)}
      </section>
      <section className="panel owner-order-actions">
        <h2>Order actions</h2>
        {currentStatus === 'SUBMITTED' && <><button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ type: 'confirm' })}>Confirm order</button><input value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Reason if rejecting"/><button className="button secondary" disabled={action.isPending} onClick={() => action.mutate({ type: 'reject', value: rejectReason })}>Reject order</button></>}
        {currentStatus === 'AWAITING_PAYMENT' && <p className="muted">Order is awaiting customer payment. Printing can begin after verified payment approval.</p>}
        {currentStatus === 'PAID' && <button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ type: 'status', value: 'IN_QUEUE' })}>Add to print queue</button>}
        {currentStatus === 'IN_QUEUE' && <button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ type: 'status', value: 'PRINTING' })}>Start printing</button>}
        {currentStatus === 'PRINTING' && <button className="button primary" disabled={action.isPending} onClick={() => action.mutate({ type: 'status', value: 'READY_FOR_PICKUP' })}>Mark ready for pickup</button>}
        {currentStatus === 'READY_FOR_PICKUP' && <button className="button primary" disabled={action.isPending} onClick={() => { if (window.confirm(`Confirm handover of order ${order.orderReference} to ${order.customer?.fullName || 'the customer'}?`)) action.mutate({ type: 'pickup' }) }}>Confirm Handover</button>}
        {currentStatus === 'COMPLETED' && (() => { const confirmer = order.pickupConfirmedByUserId === order.customer?.id ? order.customer?.fullName : order.pickupConfirmedByUserId === accountQuery.data?.user?.id ? accountQuery.data?.user?.fullName : order.pickupConfirmedByRole === 'CUSTOMER' ? 'Customer' : order.pickupConfirmedByRole === 'SHOP_OWNER' ? 'Shop owner' : null; return <p className="muted">Pickup completed{order.pickupConfirmedAt ? ` · ${new Date(order.pickupConfirmedAt).toLocaleString()}` : ''}{confirmer ? ` · Confirmed by ${confirmer}` : ''}</p> })()}
      </section>
      <section className="panel owner-chat">
        <div className="panel-heading"><MessageCircle size={16}/><div><h2>Customer chat</h2><p>Messages for this order are private to you and the customer.</p></div></div>
        {messagesQuery.error ? <div className="notice">{messagesQuery.error.message}</div> : <div className="owner-chat-list">{chat.length ? chat.map(entry => <article className={entry.senderId === order.customerId ? 'owner-chat-message from-customer' : 'owner-chat-message'} key={entry.id}><b>{entry.sender?.fullName || 'Participant'}</b><p>{entry.body}</p><small>{new Date(entry.createdAt).toLocaleString()}{entry.readAt ? ' · Read' : ''}</small></article>) : <p className="muted">No messages yet. Send the customer an update.</p>}</div>}
        <form className="owner-chat-compose" onSubmit={event => { event.preventDefault(); if (message.trim()) send.mutate() }}><input aria-label="Message the customer" maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Write a message…"/><button className="button primary" disabled={send.isPending || !message.trim()}><Send size={14}/> Send</button></form>
      </section>
      <section className="panel owner-order-history"><h2>Order progress history</h2>{order.history?.length ? order.history.map((entry, index) => <div className="table-row" key={entry.id || index}><span>{pretty(entry.toStatus)}</span><span>{new Date(entry.createdAt).toLocaleString()}</span></div>) : <p className="muted">No status changes recorded yet.</p>}</section>
    </div>
  </Shell>
}
