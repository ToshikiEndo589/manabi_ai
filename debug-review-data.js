const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://repjlkcreysduccnpmvu.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcGpsa2NyZXlzZHVjY25wbXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNDU2MjEsImV4cCI6MjA4NDgyMTYyMX0.rsEIlqRfdSnXmsw2Kz3EfxlYWfAmuVuUN6WXec1EbrQ');

async function debugData() {
    const userId = "d19560f4-ab32-4752-8709-64673855a6d3"; // Default user ID I've seen in logs, or fetch dynamically

    // Fetch review tasks
    const { data: tasks, error } = await supabase
        .from('review_tasks')
        .select('id, due_at, status, study_log_id, study_logs(note, subject, started_at, reference_book_id)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .lte('due_at', new Date().toISOString())
        .order('due_at', { ascending: true });

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    console.log('Total tasks fetched:', tasks.length);

    // Grouping Logic Simulation
    const groups = {};
    tasks.forEach(task => {
        const log = Array.isArray(task.study_logs) ? task.study_logs[0] : task.study_logs;
        const bookId = log?.reference_book_id;
        const subject = log?.subject || 'Other';
        const key = bookId ? `book:${bookId}` : `subject:${subject}`;

        if (!groups[key]) {
            groups[key] = { count: 0, title: subject, bookId };
        }
        groups[key].count++;
    });

    console.log('Groups:', JSON.stringify(groups, null, 2));
}

debugData();
