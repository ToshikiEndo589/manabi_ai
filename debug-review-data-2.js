const { createClient } = require('@supabase/supabase-js');

const URL = 'https://repjlkcreysduccnpmvu.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcGpsa2NyZXlzZHVjY25wbXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNDU2MjEsImV4cCI6MjA4NDgyMTYyMX0.rsEIlqRfdSnXmsw2Kz3EfxlYWfAmuVuUN6WXec1EbrQ';

console.log('Connecting to:', URL);

const supabase = createClient(URL, KEY);

async function debugData() {
    console.log('Starting debug...');
    // Fetch all pending tasks to find active users
    const { data: tasks, error } = await supabase
        .from('review_tasks')
        .select('user_id, status')
        .eq('status', 'pending')
        .limit(100);

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    const userCounts = {};
    tasks.forEach(t => {
        userCounts[t.user_id] = (userCounts[t.user_id] || 0) + 1;
    });
    console.log('User Counts:', userCounts);

    // Pick the user with most tasks
    const activeUserId = Object.keys(userCounts)[0];
    if (!activeUserId) {
        console.log('No active users found.');
        return;
    }
    console.log('Using User ID:', activeUserId);

    // Now fetch detailed tasks for this user
    const { data: detailedTasks, error: detailedError } = await supabase
        .from('review_tasks')
        .select('id, due_at, status, study_log_id, study_logs(note, subject, started_at, reference_book_id)')
        .eq('user_id', activeUserId)
        .eq('status', 'pending')
        .lte('due_at', new Date().toISOString())
        .order('due_at', { ascending: true });
    console.log('Total tasks fetched:', finalTasks.length);

    const groups = {};
    finalTasks.forEach(task => {
        const log = Array.isArray(task.study_logs) ? task.study_logs[0] : task.study_logs;
        const bookId = log?.reference_book_id;
        const subject = log?.subject || 'Other';
        const key = bookId ? `book:${bookId}` : `subject:${subject}`;

        if (!groups[key]) {
            groups[key] = { count: 0, title: subject, bookId, key };
        }
        groups[key].count++;
    });

    console.log('Groups:', JSON.stringify(groups, null, 2));
}

debugData();
