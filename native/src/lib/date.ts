export const startOfDay = (date = new Date()) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export const startOfWeek = (date = new Date()) => {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export const startOfMonth = (date = new Date()) => {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

export const formatDateLabel = (date: Date) => {
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export const formatDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const rangeContains = (date: Date, start: Date, end: Date) => {
  return date >= start && date < end
}
