// Reverse engineer the correct timestamp
const STUDY_DAY_SHIFT_MS = 21 * 60 * 60 * 1000 // 21 hours

const formatYmdUTC = (date) => {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const getStudyDay = (date) => {
    // Adds 21 hours, then extracts UTC date
    const shifted = new Date(date.getTime() + STUDY_DAY_SHIFT_MS)
    return formatYmdUTC(shifted)
}

console.log('REVERSE ENGINEERING:')
console.log('If we want study day = 2026-02-11')
console.log('We need: (timestamp + 21 hours) to have UTC date = 2026-02-11')
console.log('So timestamp must be in range where adding 21hrs keeps us in Feb 11 UTC')
console.log()

// For the result to be Feb 11 UTC after adding 21 hours:
// The latest time is Feb 11 23:59:59 UTC
// Subtract 21 hours: Feb 11 02:59:59 UTC

// The earliest time is Feb 11 00:00:00 UTC  
// Subtract 21 hours: Feb 10 03:00:00 UTC

console.log('Range for study day 2026-02-11:')
console.log('  Earliest: Feb 10 03:00 UTC (+ 21hrs = Feb 11 00:00 UTC)')
console.log('  Latest:   Feb 11 02:59 UTC (+ 21hrs = Feb 11 23:59 UTC)')
console.log()

// Test the range
const EARLY = new Date(Date.UTC(2026, 1, 10, 3, 0, 0))
const MID = new Date(Date.UTC(2026, 1, 10, 12, 0, 0))
const LATE = new Date(Date.UTC(2026, 1, 11, 2, 0, 0))
const TOO_LATE = new Date(Date.UTC(2026, 1, 11, 3, 0, 0))

console.log('Testing:')
console.log('Feb 10 03:00 UTC:', getStudyDay(EARLY), '✓')
console.log('Feb 10 12:00 UTC:', getStudyDay(MID), '✓')
console.log('Feb 11 02:00 UTC:', getStudyDay(LATE), '✓')
console.log('Feb 11 03:00 UTC:', getStudyDay(TOO_LATE), '(should be 2026-02-12)')
console.log()

console.log('SOLUTION:')
console.log('For study day YYYY-MM-DD, use timestamp:')
console.log('  YYYY-MM-(DD-1) 12:00 UTC')
console.log('  (This is safe: always +21hrs = YYYY-MM-DD between 09:00-23:59 UTC)')
