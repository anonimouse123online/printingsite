import React, { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, Upload } from 'lucide-react'
import { endpoints } from './api'
import { formatCents, formatPricingOption } from './currency.js'

const money=cents=>typeof cents==='number'?formatCents(cents):'Price unavailable'
const nameOf=shop=>shop?.shopName||'Print shop'
const locationOf=shop=>[shop?.city,shop?.address].filter(Boolean).join(' · ')
function Note({children}){return <div className="notice"><AlertCircle size={15}/>{children}</div>}
function Loading(){return <div className="loading">Loading…</div>}

export default function OrderBuilder({Shell}){
  const {id:shopId}=useParams(),navigate=useNavigate(),queryClient=useQueryClient()
  const account=useQuery({queryKey:['account'],queryFn:endpoints.me,enabled:!!localStorage.getItem('printready_token'),retry:false})
  const shopQuery=useQuery({queryKey:['shop',shopId],queryFn:async()=>{const [detail,services]=await Promise.all([endpoints.shop(shopId),endpoints.services(shopId)]);return {...detail.shop,services:services.services||[]}},enabled:!!shopId,retry:false})
  const [file,setFile]=useState(null),[uploaded,setUploaded]=useState(null),[serviceId,setServiceId]=useState(''),[optionKey,setOptionKey]=useState(''),[copies,setCopies]=useState(1),[pageRange,setPageRange]=useState(''),[instructions,setInstructions]=useState(''),[error,setError]=useState('')
  const upload=useMutation({mutationFn:endpoints.upload,onSuccess:result=>{setUploaded(result);setError('')},onError:e=>setError(e.message)})
  const submit=useMutation({mutationFn:endpoints.createOrder,onSuccess:result=>{queryClient.invalidateQueries({queryKey:['orders']});navigate(`/tracking/${result.order.id}`)},onError:e=>setError(e.message)})
  const accountUser=account.data?.user,shop=shopQuery.data,services=shop?.services||[],service=services.find(s=>s.id===serviceId),rates=service?.pricingConfiguration?.rates||{},rateKeys=Object.keys(rates)
  if(account.isLoading||shopQuery.isLoading)return <Shell title="Loading print options…" kicker="NEW PRINT ORDER"><Loading/></Shell>
  if(!accountUser)return <Shell title="Customer sign in required" kicker="NEW PRINT ORDER"><Note>Sign in with a customer account to upload a PDF and submit an order.</Note><Link className="button primary" to="/login">Log in <ArrowRight size={15}/></Link></Shell>
  if(accountUser.role!=='CUSTOMER')return <Shell title="Customer account required" kicker="NEW PRINT ORDER"><Note>Shop-owner and administrator accounts cannot submit customer orders.</Note></Shell>
  if(shopQuery.error||!shop)return <Shell title="Shop unavailable" kicker="NEW PRINT ORDER"><Note>{shopQuery.error?.message||'Shop not found.'}</Note></Shell>
  function chooseFile(event){const selected=event.target.files?.[0];if(!selected)return;setError('');if(selected.type!=='application/pdf'){setFile(null);setUploaded(null);setError('This file is not a PDF. Choose a PDF document.');event.target.value='';return}if(selected.size>10*1024*1024){setFile(null);setUploaded(null);setError('This PDF exceeds the 10 MB limit. Choose a smaller file.');event.target.value='';return}setFile(selected);setUploaded(null)}
  function uploadFile(){if(!file){setError('Choose a PDF file first.');return}const body=new FormData();body.append('file',file);upload.mutate(body)}
  function createOrder(){setError('');if(!uploaded){setError('Upload the PDF and wait for upload confirmation before submitting.');return}if(!serviceId){setError('Choose an available print service.');return}if(!rateKeys.includes(optionKey)){setError('Choose a print option with a price configured by the shop.');return}const [paperSize,colorMode,printSides]=optionKey.split(':');submit.mutate({shopId,items:[{fileId:uploaded.id,serviceId,paperSize,colorMode,printSides,copies,...(pageRange?{pageRange}:{}),...(instructions.trim()?{specialInstructions:instructions.trim()}:{})}]})}
  return <Shell title="Make it yours." kicker="NEW PRINT ORDER" description={`Configure your print job with ${nameOf(shop)}.`}>
    <div className="order-layout"><div className="order-main">
      <section className="panel"><div className="panel-heading"><span className="number">01</span><div><h2>Your document</h2><p>PDF only · Up to 10 MB · Maximum 2,000 pages</p></div></div>
        <label className="upload-zone"><Upload size={22}/><b>{uploaded?.originalFilename||file?.name||'Choose a PDF to upload'}</b><span>{uploaded?`${uploaded.pageCount} pages · Upload confirmed`:file?'Ready to upload':'PDF format · 10 MB maximum'}</span><input type="file" accept="application/pdf,.pdf" disabled={upload.isPending} onChange={chooseFile}/></label>
        {file&&!uploaded&&<button className="button secondary" disabled={upload.isPending} onClick={uploadFile}>{upload.isPending?'Uploading…':'Upload PDF'} <Upload size={15}/></button>}
      </section>
      <section className="panel"><div className="panel-heading"><span className="number">02</span><div><h2>Print settings</h2><p>Choose an available shop service and priced option.</p></div></div>
        <div className="form-grid"><label>Service<select value={serviceId} onChange={e=>{const next=services.find(s=>s.id===e.target.value);setServiceId(e.target.value);setOptionKey(Object.keys(next?.pricingConfiguration?.rates||{})[0]||'')}}><option value="">Choose service</option>{services.map(s=><option value={s.id} key={s.id}>{s.serviceName}</option>)}</select></label>
          <label>Print option<select value={optionKey} disabled={!rateKeys.length} onChange={e=>setOptionKey(e.target.value)}><option value="">No configured prices</option>{rateKeys.map(key=><option value={key} key={key}>{formatPricingOption(key)} — {money(rates[key])} per page</option>)}</select></label>
          <label>Copies<input type="number" min="1" max="500" value={copies} onChange={e=>setCopies(Math.max(1,Math.min(500,Number(e.target.value)||1)))}/></label>
          <label>Page range<input value={pageRange} onChange={e=>setPageRange(e.target.value)} placeholder={`All (${uploaded?.pageCount||'pages'})`}/></label>
        </div>
        <label className="wide-field">Instructions<textarea value={instructions} maxLength={1000} onChange={e=>setInstructions(e.target.value)} placeholder="Any details the shop should know?" rows="3"/></label>
      </section>
      <Note>The backend calculates and returns the final price. The shop must confirm your order before payment becomes available.</Note>
      {error&&<Note>{error}</Note>}
    </div><aside className="panel order-summary"><span className="eyebrow">ORDER SUMMARY</span><h3>{nameOf(shop)}</h3><p className="muted">{locationOf(shop)}</p><hr/>
      <div className="summary-row"><span>Document</span><b>{uploaded?.originalFilename||'Not uploaded'}</b></div><div className="summary-row"><span>Pages</span><b>{uploaded?.pageCount??'—'}</b></div><div className="summary-row"><span>Service</span><b>{service?.serviceName||'Choose service'}</b></div><div className="summary-row"><span>Copies</span><b>{copies}</b></div>
      <div className="estimate"><span>Total</span><b>Calculated by backend</b><small>The confirmed total appears after submission.</small></div>
      <button className="button primary full" disabled={submit.isPending||!uploaded||!serviceId||!rateKeys.includes(optionKey)} onClick={createOrder}>{submit.isPending?'Submitting…':'Submit order'} <ArrowRight size={16}/></button>
      <p className="fine-print">Upload confirmation, a selected service, and a shop-priced print option are required.</p>
    </aside></div>
  </Shell>
}
