import React, { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, MessageCircle, PackageCheck } from 'lucide-react'
import { endpoints, orderAccessError } from './api'
import { formatCents } from './currency.js'
import './manual-payment.css'

const peso=cents=>typeof cents==='number'?formatCents(cents):'Final price unavailable'
const stages=[['SUBMITTED','Awaiting shop confirmation'],['AWAITING_PAYMENT','Awaiting payment'],['PAID','Paid'],['IN_QUEUE','In queue'],['PRINTING','Printing'],['READY_FOR_PICKUP','Ready for pickup'],['COMPLETED','Completed']]
const labelStatus=s=>s?.replaceAll('_',' ')||'Unknown'
const shopTitle=s=>s?.shopName||'Printing shop'
const terminalOrder=status=>['COMPLETED','REJECTED','CANCELLED','REFUNDED'].includes(status)
function Status({children}){return <div className="notice"><AlertCircle size={15}/>{children}</div>}
function Loading(){return <div className="loading">Loading order¦</div>}

export function QrCheckout({Shell}){
  const {id}=useParams()
  const qc=useQueryClient()
  const [referenceNumber,setReferenceNumber]=useState('')
  const [paymentNote,setPaymentNote]=useState('')
  const [receipt,setReceipt]=useState(null)
  const [qrSrc,setQrSrc]=useState('')
  const account=useQuery({queryKey:['account'],queryFn:endpoints.me,enabled:!!localStorage.getItem('printready_token'),retry:false})
  const orderQuery=useQuery({queryKey:['order',id],queryFn:()=>endpoints.order(id),retry:false,refetchInterval:query=>terminalOrder(query.state.data?.order?.orderStatus)?false:30000,refetchIntervalInBackground:false})
  const order=orderQuery.data?.order
  const paymentsQuery=useQuery({queryKey:['order-payments',id],queryFn:()=>endpoints.payments(id),enabled:!!order&&account.data?.user?.role==='CUSTOMER',refetchInterval:()=>order?.orderStatus==='AWAITING_PAYMENT'?30000:false,refetchIntervalInBackground:false,retry:false})
  useEffect(()=>{if(order?.orderStatus==='PAID')paymentsQuery.refetch()},[order?.orderStatus])
  const instructionsQuery=useQuery({queryKey:['payment-instructions',id],queryFn:()=>endpoints.paymentInstructions(id),enabled:!!order&&order.orderStatus==='AWAITING_PAYMENT'&&account.data?.user?.role==='CUSTOMER',retry:false})
  const qrBlobQuery=useQuery({queryKey:['payment-qr-image',id],queryFn:()=>endpoints.paymentQrImage(id),enabled:!!instructionsQuery.data?.qrImageUrl,retry:false})
  useEffect(()=>{if(!qrBlobQuery.data)return;const url=URL.createObjectURL(qrBlobQuery.data);setQrSrc(url);return()=>URL.revokeObjectURL(url)},[qrBlobQuery.data])
  const payments=paymentsQuery.data?.payments||[]
  const submitProof=useMutation({mutationFn:()=>endpoints.submitPaymentProof(id,{referenceNumber,note:paymentNote,receipt}),onSuccess:async()=>{setReferenceNumber('');setPaymentNote('');setReceipt(null);await Promise.all([qc.invalidateQueries({queryKey:['order-payments',id]}),qc.invalidateQueries({queryKey:['payment-instructions',id]})])}})
  if(account.isLoading||orderQuery.isLoading)return <Shell title="Loading checkoutâ€¦" kicker="ORDER PAYMENT"><Loading/></Shell>
  if(!account.data?.user)return <Shell title="Sign in required" kicker="ORDER PAYMENT"><Status>Sign in with the customer account that placed this order.</Status><Link className="button primary" to="/login">Log in <ArrowRight size={15}/></Link></Shell>
  if(account.data.user.role!=='CUSTOMER')return <Shell title="Customer account required" kicker="ORDER PAYMENT"><Status>Only the customer who placed this order can access payment checkout.</Status></Shell>
  if(orderQuery.error||!order)return <Shell title="Checkout unavailable" kicker="ORDER PAYMENT"><Status>{orderAccessError(orderQuery.error)}</Status></Shell>
  const succeeded=payments.some(p=>p.status==='SUCCEEDED')
  const paymentError=paymentsQuery.error?.message
  const manualPayment=payments.find(p=>p.provider==='manual_qr')
  return <Shell title="Order payment" kicker="CHECKOUT" description="Payment status is shown only from backend data.">
    <div className="payment-layout"><section className="panel payment-order"><span className="eyebrow">ORDER SUMMARY</span><h2>{order.orderReference}</h2><p>{shopTitle(order.shop)}</p><div className="payment-total"><span>Final amount</span><b>{peso(order.totalCents)}</b></div><div className="summary-row"><span>Order status</span><b>{labelStatus(order.orderStatus)}</b></div>
      {order.orderStatus==='SUBMITTED'&&<Status>Waiting for shop confirmation. Payment becomes available after the shop confirms this order.</Status>}
      {order.orderStatus==='AWAITING_PAYMENT'&&!succeeded&&<>
        {instructionsQuery.isLoading||qrBlobQuery.isLoading?<div className="loading">Loading shop payment instructionsâ€¦</div>:instructionsQuery.error?<Status>{instructionsQuery.error.message}</Status>:instructionsQuery.data&&<div className="payment-unavailable"><h3>{instructionsQuery.data.recipient.method} payment to {instructionsQuery.data.recipient.accountName}</h3><p>Transfer directly to this shop. PrintReady does not hold your payment.</p>{instructionsQuery.data.recipient.walletNumber&&<p>Wallet number: <b>{instructionsQuery.data.recipient.walletNumber}</b></p>}<div className="payment-total"><span>Exact amount to pay</span><b>{peso(instructionsQuery.data.payment.amountCents)}</b></div>{qrSrc&&<img className="shop-payment-qr" src={qrSrc} alt={`${instructionsQuery.data.recipient.method} shop payment QR`}/>}</div>}
        {manualPayment?.reviewStatus==='PENDING_VERIFICATION'&&<Status>Payment proof submitted. The shop owner is checking the transfer.</Status>}
        {manualPayment?.reviewStatus==='REJECTED'&&<Status>Payment proof was rejected: {manualPayment.rejectionReason || 'Please check the details and resubmit.'}</Status>}
        {instructionsQuery.data&&manualPayment?.reviewStatus!=='PENDING_VERIFICATION'&&manualPayment?.reviewStatus!=='APPROVED'&&<form className="payment-proof-form" onSubmit={event=>{event.preventDefault();submitProof.mutate()}}><h3>Submit transfer proof</h3>{submitProof.error&&<Status>{submitProof.error.message}</Status>}{submitProof.isSuccess&&<Status>Payment proof submitted for shop verification.</Status>}<label>Wallet reference number<input required minLength={4} maxLength={120} value={referenceNumber} onChange={event=>setReferenceNumber(event.target.value)} placeholder="Reference number from your wallet"/></label><label>Note (optional)<input maxLength={500} value={paymentNote} onChange={event=>setPaymentNote(event.target.value)} placeholder="Optional note for the shop"/></label><label>Receipt screenshot (optional)<input type="file" accept="image/png,image/jpeg" onChange={event=>setReceipt(event.target.files?.[0]||null)}/></label><button className="button primary" disabled={submitProof.isPending}>{submitProof.isPending?'Submittingâ€¦':'Submit payment proof'}</button></form>}
      </>}
      {succeeded&&<Status>Payment Confirmed by the backend.</Status>}
      {paymentError&&<Status>Payment status could not be refreshed: {paymentError}</Status>}
      {payments.length>0&&<div className="payment-history"><h3>Payment records</h3>{payments.map(p=><div className="table-row" key={p.id}><span>{p.provider}</span><span>{p.status==='SUCCEEDED'?'Payment Confirmed':p.status==='FAILED'?'Payment Rejected':p.status}</span><span>{peso(p.amountCents)}</span></div>)}</div>}
      {manualPayment?.reviewStatus==='APPROVED'&&<Status>Payment verified by the shop. Your order can now be printed.</Status>}
    </section></div>
  </Shell>
}

export function OrderTracking({Shell}){
  const {id}=useParams()
  const qc=useQueryClient()
  const [pickupAcknowledged,setPickupAcknowledged]=useState(false)
  const [pickupDialogOpen,setPickupDialogOpen]=useState(false)
  const pickup=useMutation({mutationFn:()=>endpoints.confirmPickup(id),onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:['order',id]}),qc.invalidateQueries({queryKey:['order-payments',id]})]);setPickupDialogOpen(false);setPickupAcknowledged(false)}})
  useEffect(()=>{if(!pickupDialogOpen)return;const closeOnEscape=event=>{if(event.key==='Escape'&&!pickup.isPending)setPickupDialogOpen(false)};window.addEventListener('keydown',closeOnEscape);return()=>window.removeEventListener('keydown',closeOnEscape)},[pickupDialogOpen,pickup.isPending])
  const accountQuery=useQuery({queryKey:['account'],queryFn:endpoints.me,enabled:!!localStorage.getItem('printready_token'),retry:false})
  const orderQuery=useQuery({queryKey:['order',id],queryFn:()=>endpoints.order(id),retry:false,refetchInterval:query=>terminalOrder(query.state.data?.order?.orderStatus)?false:30000,refetchIntervalInBackground:false})
  const order=orderQuery.data?.order
  const paymentsQuery=useQuery({queryKey:['order-payments',id],queryFn:()=>endpoints.payments(id),enabled:!!order,refetchInterval:()=>order?.orderStatus==='AWAITING_PAYMENT'?30000:false,refetchIntervalInBackground:false,retry:false})
  useEffect(()=>{if(order?.orderStatus==='PAID')paymentsQuery.refetch()},[order?.orderStatus])
  const payments=paymentsQuery.data?.payments||[]
  if(accountQuery.data?.user?.role==='SHOP_OWNER')return <Navigate to={`/owner/orders/${encodeURIComponent(id)}`} replace/>
  if(orderQuery.isLoading)return <Shell title="Order tracking" kicker="ORDER DETAIL"><Loading/></Shell>
  if(orderQuery.error||!order)return <Shell title="Order tracking" kicker="ORDER DETAIL"><Status>{orderAccessError(orderQuery.error)}</Status>{orderQuery.error?.status===401&&<Link className="button primary" to="/login">Log in</Link>}</Shell>
  const index=stages.findIndex(([s])=>s===order.orderStatus)
  const paymentStage=payments.some(p=>p.status==='SUCCEEDED'||p.reviewStatus==='APPROVED')?'Payment Confirmed':payments.some(p=>p.reviewStatus==='PENDING_VERIFICATION')?'Pending Verification':payments.some(p=>p.status==='FAILED'||p.reviewStatus==='REJECTED')?'Payment Rejected':order.orderStatus==='AWAITING_PAYMENT'?'Awaiting Payment':order.orderStatus==='SUBMITTED'?'Waiting for shop confirmation':payments[0]?.reviewStatus||payments[0]?.status||'No payment record'
  return <Shell title="Order detail" kicker="ORDER TRACKING" description={order.orderReference}>
    <div className="tracking-card"><div className="tracking-heading"><div><h2>{shopTitle(order.shop)}</h2><p className="muted">{order.orderReference}</p></div><span className="status-pill">{labelStatus(order.orderStatus)}</span></div>
      {order.orderStatus==='SUBMITTED'&&<Status>Waiting for shop confirmation.</Status>}
      {order.orderStatus==='REJECTED'&&order.rejectionReason&&<Status>Order rejection reason: {order.rejectionReason}</Status>}
      <h3 className="progress-title">Order progress</h3><div className="timeline">{stages.map(([s,label],i)=><div className={`${s===order.orderStatus?'current':''} ${i<index?'complete':''}`} key={s}><i/>{label}</div>)}</div>
      <section className="progress-panel"><span className="eyebrow">PAYMENT</span><b>{paymentStage}</b>{paymentsQuery.error&&<small>Payment status refresh failed: {paymentsQuery.error.message}</small>}</section>
      <div className="order-detail-lines"><p>Customer: <b>{order.customer?.fullName || 'Customer'}</b></p><p>Final price: <b>{peso(order.totalCents)}</b></p>{order.items?.map(item=><p className="muted" key={item.id}>{item.file?.originalFilename} Â· {item.pageCount} pages Â· {item.copies} copies</p>)}</div>
{order.orderStatus==='READY_FOR_PICKUP'&&accountQuery.data?.user?.role==='CUSTOMER'&&<section className="panel pickup-summary-card"><div className="pickup-card-heading"><div><span className="eyebrow">FINAL STEP</span><h3>Ready for pickup</h3><p>Your documents are ready at the shop.</p></div><span className="pickup-state-badge">READY FOR PICKUP</span></div><p className="pickup-reminder">Please confirm only after you have physically received your printed documents from the shop.</p><div className="pickup-summary-grid"><div><span>Customer</span><b>{order.customer?.fullName || accountQuery.data.user.fullName || 'Customer'}</b></div><div><span>Shop</span><b>{shopTitle(order.shop)}</b></div><div><span>Order reference</span><b>{order.orderReference}</b></div><div><span>Final price</span><b>{peso(order.totalCents)}</b></div><div><span>Payment status</span><b>{paymentStage}</b></div><div><span>Order status</span><b>{labelStatus(order.orderStatus)}</b></div></div>{!payments.some(p=>p.status==='SUCCEEDED')&&<Status>Pickup confirmation is available after the shop verifies your payment.</Status>}<label className="pickup-acknowledgement"><input type="checkbox" checked={pickupAcknowledged} onChange={event=>setPickupAcknowledged(event.target.checked)}/><span>I confirm that I already received my printed documents from the shop.</span></label>{pickup.error&&<Status>{pickup.error.message}</Status>}<button className="button primary pickup-open-confirm" disabled={!pickupAcknowledged||pickup.isPending||!payments.some(p=>p.status==='SUCCEEDED')} onClick={()=>{pickup.reset();setPickupDialogOpen(true)}}>Confirm Pickup</button></section>}
{order.orderStatus==='COMPLETED'&&(()=>{const confirmer=order.pickupConfirmedByUserId===order.customer?.id?order.customer?.fullName:order.pickupConfirmedByUserId===accountQuery.data?.user?.id?accountQuery.data?.user?.fullName:order.pickupConfirmedByRole==='SHOP_OWNER'?'Shop owner':order.pickupConfirmedByRole==='CUSTOMER'?'Customer':null;return <section className="panel pickup-completed-card"><span className="pickup-completed-badge">COMPLETED</span><h3>Pickup confirmed</h3><p>Your order has been marked complete.</p><div className="pickup-completion-meta"><span>{order.pickupConfirmedAt?`Completed ${new Date(order.pickupConfirmedAt).toLocaleString()}`:'Completion time unavailable'}</span><span>{confirmer?`Confirmed by ${confirmer}`:'Confirmer unavailable'}</span></div></section>})()}
{pickupDialogOpen&&order.orderStatus==='READY_FOR_PICKUP'&&<div className="pickup-modal-backdrop"><section className="pickup-modal" role="dialog" aria-modal="true" aria-labelledby="pickup-modal-title" aria-describedby="pickup-modal-description"><span className="eyebrow">ORDER COMPLETION</span><h2 id="pickup-modal-title">Confirm pickup?</h2><p id="pickup-modal-description">Only continue if you have physically received these printed documents from the shop.</p><div className="pickup-modal-summary"><div><span>Shop</span><b>{shopTitle(order.shop)}</b></div><div><span>Order reference</span><b>{order.orderReference}</b></div><div><span>Final price</span><b>{peso(order.totalCents)}</b></div></div>{pickup.error&&<Status>{pickup.error.message}</Status>}<div className="pickup-modal-actions"><button className="button secondary" disabled={pickup.isPending} onClick={()=>setPickupDialogOpen(false)}>Cancel</button><button className="button primary" disabled={pickup.isPending||!pickupAcknowledged||!payments.some(p=>p.status==='SUCCEEDED')} onClick={()=>pickup.mutate()}>{pickup.isPending?'Confirming…':'Confirm Pickup'}</button></div></section></div>}
      <div className="tracking-actions">{order.orderStatus==='AWAITING_PAYMENT'&&<Link to={`/checkout/${order.id}`} className="button primary">Proceed to Payment <ArrowRight size={15}/></Link>}{payments.length>0&&<Link to={`/checkout/${order.id}`} className="button secondary">View Payment</Link>}<a className="button secondary disabled-link" aria-disabled="true"><MessageCircle size={15}/> Chat with Shop</a></div>
      <section className="panel order-chat"><div className="panel-heading"><MessageCircle size={16}/><div><h2>Order Chat</h2><p>Customer and shop messages for this order.</p></div></div><div className="chat-unavailable"><PackageCheck size={18}/><p>Messaging is unavailable because the backend API contract does not define order conversation or message endpoints. No sample messages are shown or stored locally.</p></div></section>
      {order.history?.length>0&&<section className="order-history"><h3>Order history</h3>{order.history.map((event,i)=><div className="table-row" key={event.id||i}><span>{event.toStatus?.replaceAll('_',' ')}</span><span>{event.createdAt?new Date(event.createdAt).toLocaleString():''}</span></div>)}</section>}
    </div>
  </Shell>
}
