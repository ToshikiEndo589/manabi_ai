// Final test of the FINAL fix
const STUDY_DAY_SHIFT_MS = 21 * 60 * 60 * 1000

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

// FINAL CORRECTED implementation
const buildStartedAtFromDisplayedDate_FINAL = (date) => {
    const [year, month, day] = formatDateInput(date).split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0, 0))
}

console.log('FINAL FIX TEST')
console.log('='.repeat(70))

const testCases = [
    new Date(2026, 1, 11),   // Feb 11
    new Date(2026, 1, 10),   // Feb 10
    new Date(2026, 1, 12),   // Feb 12
    new Date(2026, 0, 1),    // Jan 1
    new Date(2026, 11, 31),  // Dec 31
]

testCases.forEach(testDate => {
    const selectedDate = formatDateInput(testDate)
    const created = buildStartedAtFromDisplayedDate_FINAL(testDate)
    const studyDay = getStudyDay(created)
    const isCorrect = studyDay === selectedDate

    console.log()
    console.log(`User selects: ${selectedDate}`)
    console.log(`  → Timestamp created: ${created.toISOString()}`)
    console.log(`  → Study day result:  ${studyDay}`)
    console.log(`  → ${isCorrect ? '✓ CORRECT' : '✗ WRONG'}`)
})

console.log()
console.log('='.repeat(70))
