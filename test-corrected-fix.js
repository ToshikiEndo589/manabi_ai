// Test the CORRECTED fix
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

// CORRECTED implementation
const buildStartedAtFromDisplayedDate_CORRECTED = (date) => {
    const [year, month, day] = formatDateInput(date).split('-').map(Number)
    const JST_OFFSET_HOURS = 9
    return new Date(Date.UTC(year, month - 1, day, 12 - JST_OFFSET_HOURS, 0, 0, 0))
}

console.log('Testing CORRECTED implementation')
console.log('='.repeat(60))

// Test with Feb 11, 2026
const userSelectedDate = new Date(2026, 1, 11)
console.log('User selects:', userSelectedDate.toLocaleDateString('ja-JP'))

const correctedDate = buildStartedAtFromDisplayedDate_CORRECTED(userSelectedDate)
console.log('\nCreated timestamp:', correctedDate.toISOString())
console.log('  = JST:', correctedDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }))
console.log('Study day result:', getStudyDay(correctedDate))

console.log('\n' + '='.repeat(60))
console.log('Expected: 2026-02-11')
console.log('Got:     ', getStudyDay(correctedDate))
console.log('Status:  ', getStudyDay(correctedDate) === '2026-02-11' ? '✓ CORRECT' : '✗ WRONG')

// Test a few more dates
console.log('\n\nAdditional tests:')
console.log('-'.repeat(60));

[
    new Date(2026, 1, 10),  // Feb 10
    new Date(2026, 1, 12),  // Feb 12
    new Date(2026, 0, 1),   // Jan 1
].forEach(testDate => {
    const created = buildStartedAtFromDisplayedDate_CORRECTED(testDate)
    const studyDay = getStudyDay(created)
    const expected = formatDateInput(testDate)
    console.log(`${expected} → ${studyDay}`, studyDay === expected ? '✓' : '✗')
})
