// Deep dive into the correct date handling
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
    // Shifts the date FORWARD by 21 hours
    // This handles the 3AM cutoff correctly
    const shifted = new Date(date.getTime() + STUDY_DAY_SHIFT_MS)
    return formatYmdUTC(shifted)
}

const formatDateInput = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

console.log('Understanding the study day logic:')
console.log('STUDY_DAY_SHIFT_MS =', STUDY_DAY_SHIFT_MS / 3600000, 'hours')
console.log('This ADDS 21 hours to the timestamp\n')

console.log('Study day "2026-02-11" should include times from:')
console.log('  3AM JST on Feb 11 to 3AM JST on Feb 12')
console.log('  Which is: Feb 10 18:00 UTC to Feb 11 18:00 UTC\n')

console.log('Testing: What timestamps map to study day 2026-02-11?')
console.log('='.repeat(60))

// Option 1: Feb 10 18:00 UTC (Feb 11 03:00 JST - study day START)
const timestamp1 = new Date(Date.UTC(2026, 1, 10, 18, 0, 0))
console.log('\n[1] Feb 10 18:00 UTC (= Feb 11 03:00 JST)')
console.log('    ISO:', timestamp1.toISOString())
console.log('    +21hrs → ', new Date(timestamp1.getTime() + STUDY_DAY_SHIFT_MS).toISOString())
console.log('    Study day:', getStudyDay(timestamp1))

// Option 2: Feb 11 03:00 UTC (Feb 11 12:00 JST - noon)
const timestamp2 = new Date(Date.UTC(2026, 1, 11, 3, 0, 0))
console.log('\n[2] Feb 11 03:00 UTC (= Feb 11 12:00 JST)')
console.log('    ISO:', timestamp2.toISOString())
console.log('    +21hrs → ', new Date(timestamp2.getTime() + STUDY_DAY_SHIFT_MS).toISOString())
console.log('    Study day:', getStudyDay(timestamp2))

// Option 3: Feb 11 12:00 UTC (Feb 11 21:00 JST - evening)
const timestamp3 = new Date(Date.UTC(2026, 1, 11, 12, 0, 0))
console.log('\n[3] Feb 11 12:00 UTC (= Feb 11 21:00 JST)')
console.log('    ISO:', timestamp3.toISOString())
console.log('    +21hrs → ', new Date(timestamp3.getTime() + STUDY_DAY_SHIFT_MS).toISOString())
console.log('    Study day:', getStudyDay(timestamp3))

console.log('\n' + '='.repeat(60))
console.log('CONCLUSION:')
console.log('For study day 2026-02-11, timestamp must be:')
console.log('  Between Feb 10 18:00 UTC and Feb 11 17:59:59 UTC')
console.log('→ Best choice: Feb 11 03:00 UTC (= noon JST)')
