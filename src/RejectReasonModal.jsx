import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import './reject-modal.css'

const MAX_REASON_LENGTH = 1000

export default function RejectReasonModal({ title = 'Reject Order', description = 'Are you sure you want to reject this order? Please provide a reason so the customer understands why their order was rejected.', busy = false, onCancel, onConfirm }) {
  const textarea = useRef(null)
  const previousFocus = useRef(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    previousFocus.current = document.activeElement
    textarea.current?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }
      if (event.key === 'Tab') {
        const dialog = event.currentTarget.querySelector('[role="dialog"]')
        const focusable = [...dialog.querySelectorAll('button:not(:disabled), textarea:not(:disabled)')]
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus.current?.focus?.()
    }
  }, [busy, onCancel])

  async function submit(event) {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) { setError('Please enter a reason before confirming.'); textarea.current?.focus(); return }
    if (trimmed.length > MAX_REASON_LENGTH) { setError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer.`); return }
    setError('')
    try { await onConfirm(trimmed) }
    catch (submitError) { setError(submitError?.message || 'Rejection failed. Please try again.') }
  }

  return <div className="reject-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="reject-modal" role="dialog" aria-modal="true" aria-labelledby="reject-modal-title" aria-describedby="reject-modal-description">
      <button type="button" className="reject-modal-close" aria-label="Close rejection dialog" disabled={busy} onClick={onCancel}><X size={18}/></button>
      <h2 id="reject-modal-title">{title}</h2>
      <p id="reject-modal-description">{description}</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="reject-reason">Rejection Reason</label>
        <textarea ref={textarea} id="reject-reason" rows="5" maxLength={MAX_REASON_LENGTH} value={reason} aria-invalid={!!error} aria-describedby={error ? 'reject-reason-error' : 'reject-reason-count'} onChange={event => { setReason(event.target.value); if (error) setError('') }} placeholder="Enter the reason for rejecting this order..." />
        {error ? <span id="reject-reason-error" className="reject-modal-error" role="alert">{error}</span> : <span id="reject-reason-count" className="reject-modal-count">{reason.length}/{MAX_REASON_LENGTH}</span>}
        <div className="reject-modal-actions">
          <button type="button" className="reject-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="reject-confirm" disabled={busy}>{busy ? 'Submitting…' : 'Confirm Rejection'}</button>
        </div>
      </form>
    </section>
  </div>
}
