const numberFormat = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return 'Price unavailable'
  return `₱${numberFormat.format(value)}`
}

export function formatCents(cents) {
  const value = Number(cents)
  if (!Number.isFinite(value)) return 'Price unavailable'
  return formatCurrency(value / 100)
}

const optionNames = {
  A4: 'A4',
  A3: 'A3',
  LETTER: 'Letter',
  LEGAL: 'Legal',
  BW: 'Black & White',
  COLOR: 'Color',
  SINGLE: 'Single-sided',
  DOUBLE: 'Double-sided',
}

export function formatPricingOption(key) {
  return String(key).split(':').map(part => optionNames[part] || part.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())).join(' · ')
}
