// Test the date handling fix
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const STUDY_DAY_START_HOUR = 3
const STUDY_DAY_SHIFT_MS = (24 - STUDY_DAY_START_HOUR) * 60 * 60 * 1000

const formatYmdUTC = (date) => {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const getStudyDay = (date) => {
    const shifted = new Date(date.getTime() + STUDY_DAY_SHIFT_MS)
    return formatYmdUTC(shifted)
}

const formatDateInput = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// OLD implementation
const buildStartedAtFromDisplayedDate_OLD = (date) => {
    const [year, month, day] = formatDateInput(date).split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0, 0)
}

// NEW implementation
const buildStartedAtFromDisplayedDate_NEW = (date) => {
    const [year, month, day] = formatDateInput(date).split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

console.log('Testing date handling for Feb 11, 2026 (JST)')
console.log('='.repeat(60))

// Simulate user selecting Feb 11 in the date picker
const userSelectedDate = new Date(2026, 1, 11) // Feb 11, 2026 local time (JST)
console.log('\nUser selects in date picker:', userSelectedDate.toString())
console.log('  (Local date parts: Y=%d M=%d D=%d)',
    userSelectedDate.getFullYear(),
    userSelectedDate.getMonth() + 1,
    userSelectedDate.getDate())

console.log('\n--- OLD Implementation ---')
const oldDate = buildStartedAtFromDisplayedDate_OLD(userSelectedDate)
console.log('Created date object:', oldDate.toString())
console.log('ISO string (saved to DB):', oldDate.toISOString())
console.log('Study day calculated:', getStudyDay(oldDate))

console.log('\n--- NEW Implementation ---')
const newDate = buildStartedAtFromDisplayedDate_NEW(userSelectedDate)
console.log('Created date object:', newDate.toString())
console.log('ISO string (saved to DB):', newDate.toISOString())
console.log('Study day calculated:', getStudyDay(newDate))

console.log('\n' + '='.repeat(60))
console.log('Expected study day: 2026-02-11')
console.log('OLD result:', getStudyDay(oldDate), getStudyDay(oldDate) === '2026-02-11' ? '✓' : '✗')
console.log('NEW result:', getStudyDay(newDate), getStudyDay(newDate) === '2026-02-11' ? '✓' : '✗')
