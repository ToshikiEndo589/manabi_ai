// Test script to understand getStudyDay behavior
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

// Test different times for Feb 10, 2026
console.log('Testing getStudyDay for Feb 10, 2026:')
console.log('=====================================')

// Test 3AM (study day start)
const date1 = new Date(2026, 1, 10, 3, 0, 0, 0) // Feb 10, 3AM JST
console.log('3AM JST:', date1.toString())
console.log('  → StudyDay:', getStudyDay(date1))

// Test 6AM
const date2 = new Date(2026, 1, 10, 6, 0, 0, 0) // Feb 10, 6AM JST
console.log('6AM JST:', date2.toString())
console.log('  → StudyDay:', getStudyDay(date2))

// Test 12PM (noon)
const date3 = new Date(2026, 1, 10, 12, 0, 0, 0) // Feb 10, 12PM JST
console.log('12PM JST:', date3.toString())
console.log('  → StudyDay:', getStudyDay(date3))

// Test 3PM (current fix)
const date4 = new Date(2026, 1, 10, 15, 0, 0, 0) // Feb 10, 3PM JST
console.log('3PM JST:', date4.toString())
console.log('  → StudyDay:', getStudyDay(date4))

// Test 11PM
const date5 = new Date(2026, 1, 10, 23, 0, 0, 0) // Feb 10, 11PM JST
console.log('11PM JST:', date5.toString())
console.log('  → StudyDay:', getStudyDay(date5))

// Test 2AM (before study day start)
const date6 = new Date(2026, 1, 10, 2, 0, 0, 0) // Feb 10, 2AM JST  
console.log('2AM JST:', date6.toString())
console.log('  → StudyDay:', getStudyDay(date6))
