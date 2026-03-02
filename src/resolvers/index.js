import Resolver from '@forge/resolver';
import api, { route, storage, webTrigger } from '@forge/api';

const resolver = new Resolver();

// Config constants
const WORKLOGS_PER_PAGE = 100;
const MAX_WORKLOG_PAGES = 10;
const PARALLEL_BATCH_SIZE = 5;
const MAX_ISSUES_TO_SCAN = 30;

async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    console.error('Failed to parse JSON response:', err);
    return null;
  }
}

async function fetchAllWorklogsForIssue(issueKey) {
  const allWorklogs = [];
  let startAt = 0;

  for (let page = 0; page < MAX_WORKLOG_PAGES; page++) {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}/worklog?startAt=${startAt}&maxResults=${WORKLOGS_PER_PAGE}`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      console.error(`Worklog API error: ${response.status} for ${issueKey} (page ${page})`);
      break;
    }

    const data = await safeJson(response);
    if (!data) break;

    const worklogs = data.worklogs || [];
    allWorklogs.push(...worklogs);

    const total = data.total || 0;
    if (allWorklogs.length >= total || worklogs.length === 0) break;

    startAt += worklogs.length;
  }

  return allWorklogs;
}

function processWorklogEntry(log, extraFields = {}) {
  return {
    ...extraFields,
    author: log.author?.displayName || 'Unknown User',
    authorId: log.author?.accountId || 'unknown',
    date: new Date(log.started).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    dateRaw: log.started,
    timeSpent: log.timeSpent || '0m',
    timeSpentSeconds: log.timeSpentSeconds || 0,
    comment: extractTextFromADF(log.comment),
  };
}

function getSprintName(sprintField) {
  if (!sprintField) return '';
  // sprint can be an array of sprint objects or a single object
  if (Array.isArray(sprintField)) {
    return sprintField.map(s => s.name || '').filter(Boolean).join(', ');
  }
  return sprintField.name || '';
}

function aggregateByUser(entries) {
  const userMap = {};
  entries.forEach((entry) => {
    if (!userMap[entry.authorId]) {
      userMap[entry.authorId] = {
        accountId: entry.authorId,
        name: entry.author,
        totalSeconds: 0,
        entryCount: 0,
      };
    }
    userMap[entry.authorId].totalSeconds += entry.timeSpentSeconds;
    userMap[entry.authorId].entryCount += 1;
  });
  return Object.values(userMap).sort((a, b) => b.totalSeconds - a.totalSeconds);
}

function extractTextFromADF(adfNode) {
  if (!adfNode) return '';
  if (typeof adfNode === 'string') return adfNode;

  if (adfNode.content && Array.isArray(adfNode.content)) {
    return adfNode.content
      .map((child) => {
        if (child.type === 'text') return child.text || '';
        if (child.content) return extractTextFromADF(child);
        if (child.type === 'hardBreak') return ' ';
        return '';
      })
      .join(adfNode.type === 'doc' ? ' ' : '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (adfNode.text) return adfNode.text;
  return '';
}

function formatDateForJQL(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Resolver 1: Single issue worklogs (Issue Panel)
resolver.define('getWorklogs', async ({ context }) => {
  try {
    const issueKey = context.extension.issue.key;
    const worklogs = await fetchAllWorklogsForIssue(issueKey);

    const entries = worklogs.map((log) => processWorklogEntry(log));
    entries.sort((a, b) => new Date(b.dateRaw) - new Date(a.dateRaw));

    const totalSeconds = entries.reduce((sum, e) => sum + e.timeSpentSeconds, 0);
    const userSummary = aggregateByUser(entries);

    return { entries, totalSeconds, userSummary, issueKey };
  } catch (err) {
    console.error('Unexpected error in getWorklogs:', err);
    return { error: 'An unexpected error occurred. Please try again.' };
  }
});

// Resolver 2: Project-wide worklogs (Project Page)
resolver.define('getProjectWorklogs', async ({ context, payload }) => {
  try {
    const projectKey = context.extension.project.key;
    const period = payload?.period || 'week';

    const now = new Date();
    let startDate;
    let endDate = now;
    if (period === 'custom') {
      startDate = new Date(payload.customStart || '2000-01-01');
      endDate = new Date(payload.customEnd || new Date().toISOString());
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate = new Date('2000-01-01');
    }

    // Always include worklogDate filter — the GET /search/jql endpoint rejects unbounded queries
    let jql;
    if (period === 'custom') {
      jql = `project = "${projectKey}" AND worklogDate >= "${formatDateForJQL(startDate)}" AND worklogDate <= "${formatDateForJQL(endDate)}" ORDER BY updated DESC`;
    } else {
      jql = `project = "${projectKey}" AND worklogDate >= "${formatDateForJQL(startDate)}" ORDER BY updated DESC`;
    }

    console.log(`[WorkLog] Searching with JQL: ${jql}, period: ${period}`);

    // Use GET /rest/api/3/search/jql with query params via route template
    const searchResponse = await api.asApp().requestJira(
      route`/rest/api/3/search/jql?jql=${jql}&maxResults=${String(MAX_ISSUES_TO_SCAN)}&fields=summary,status,issuetype,sprint`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    console.log(`[WorkLog] Search response status: ${searchResponse.status}`);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text().catch(() => 'unable to read response body');
      console.error(`[WorkLog] Search API error: ${searchResponse.status}, body: ${errorText}`);
      return { error: `Failed to search issues (Status: ${searchResponse.status}). ${errorText}` };
    }

    const searchData = await safeJson(searchResponse);
    if (!searchData) return { error: 'Failed to parse search results from Jira.' };
    console.log(`[WorkLog] Found ${(searchData.issues || []).length} issues`);

    const issues = searchData.issues || [];
    const allEntries = [];
    const issueSummaryMap = {};

    for (let i = 0; i < issues.length; i += PARALLEL_BATCH_SIZE) {
      const batch = issues.slice(i, i + PARALLEL_BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (issue) => {
          const issueKey = issue.key;
          const issueSummary = issue.fields?.summary || issueKey;
          const issueStatus = issue.fields?.status?.name || 'Unknown';
          const issueType = issue.fields?.issuetype?.name || 'Unknown';
          const sprintName = getSprintName(issue.fields?.sprint);

          try {
            const worklogs = await fetchAllWorklogsForIssue(issueKey);
            const filteredLogs = worklogs.filter((log) => {
              const logDate = new Date(log.started);
              return logDate >= startDate && logDate <= endDate;
            });
            return { issueKey, issueSummary, issueStatus, issueType, sprintName, filteredLogs };
          } catch (err) {
            console.error(`Failed to fetch worklogs for ${issueKey}:`, err);
            return { issueKey, issueSummary, issueStatus, issueType, sprintName, filteredLogs: [] };
          }
        })
      );

      for (const { issueKey, issueSummary, issueStatus, issueType, sprintName, filteredLogs } of batchResults) {
        let issueTotal = 0;
        filteredLogs.forEach((log) => {
          const entry = processWorklogEntry(log, { issueKey, issueSummary, issueStatus, issueType, sprintName });
          allEntries.push(entry);
          issueTotal += log.timeSpentSeconds || 0;
        });

        if (filteredLogs.length > 0) {
          issueSummaryMap[issueKey] = {
            key: issueKey,
            summary: issueSummary,
            status: issueStatus,
            issueType,
            sprintName,
            totalSeconds: issueTotal,
            entryCount: filteredLogs.length,
          };
        }
      }
    }

    allEntries.sort((a, b) => new Date(b.dateRaw) - new Date(a.dateRaw));
    const totalSeconds = allEntries.reduce((sum, e) => sum + e.timeSpentSeconds, 0);
    const userSummary = aggregateByUser(allEntries);
    const issueSummary = Object.values(issueSummaryMap).sort((a, b) => b.totalSeconds - a.totalSeconds);

    console.log(`[WorkLog] Result: ${allEntries.length} entries, ${totalSeconds}s total, ${userSummary.length} users, ${issueSummary.length} issues with logs`);

    return {
      entries: allEntries,
      totalSeconds,
      userSummary,
      issueSummary,
      period,
      projectKey,
      issueCount: issues.length,
      periodStart: formatDateForJQL(startDate),
      periodEnd: formatDateForJQL(endDate),
    };
  } catch (err) {
    console.error('Unexpected error in getProjectWorklogs:', err);
    return { error: 'An unexpected error occurred. Please try again.' };
  }
});

// Helper: storage key functions for period locking and timesheet approval
function getLockKey(projectKey, periodStart, periodEnd) {
  return 'lock:' + projectKey + ':' + periodStart + '_' + periodEnd;
}

function getSubsKey(projectKey, periodStart, periodEnd) {
  return 'subs:' + projectKey + ':' + periodStart + '_' + periodEnd;
}

// Get current user info
resolver.define('getCurrentUser', async ({ context }) => {
  try {
    const accountId = context.accountId;
    if (!accountId) return { error: 'No account ID available' };
    const response = await api.asApp().requestJira(
      route`/rest/api/3/user?accountId=${accountId}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return { accountId, displayName: 'Unknown User' };
    const user = await safeJson(response);
    return { accountId, displayName: user?.displayName || 'Unknown User' };
  } catch (err) {
    console.error('getCurrentUser error:', err);
    return { error: 'Failed to get current user info' };
  }
});

// Get period lock status + all submission statuses
resolver.define('getPeriodStatus', async ({ context, payload }) => {
  try {
    const projectKey = context.extension.project.key;
    const { periodStart, periodEnd } = payload || {};
    if (!periodStart || !periodEnd) return { lock: null, submissions: {} };
    const lockKey = getLockKey(projectKey, periodStart, periodEnd);
    const subsKey = getSubsKey(projectKey, periodStart, periodEnd);
    const [lock, submissions] = await Promise.all([
      storage.get(lockKey),
      storage.get(subsKey),
    ]);
    return { lock: lock || null, submissions: submissions || {} };
  } catch (err) {
    console.error('getPeriodStatus error:', err);
    return { lock: null, submissions: {} };
  }
});

// Lock a period
resolver.define('lockPeriod', async ({ context, payload }) => {
  try {
    const projectKey = context.extension.project.key;
    const accountId = context.accountId;
    const { periodStart, periodEnd } = payload;
    const response = await api.asApp().requestJira(
      route`/rest/api/3/user?accountId=${accountId}`,
      { headers: { 'Accept': 'application/json' } }
    );
    const user = response.ok ? await safeJson(response) : null;
    const displayName = user?.displayName || 'Unknown User';
    const lockKey = getLockKey(projectKey, periodStart, periodEnd);
    await storage.set(lockKey, {
      lockedBy: accountId,
      lockedByName: displayName,
      lockedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (err) {
    console.error('lockPeriod error:', err);
    return { error: 'Failed to lock period' };
  }
});

// Unlock a period
resolver.define('unlockPeriod', async ({ context, payload }) => {
  try {
    const projectKey = context.extension.project.key;
    const { periodStart, periodEnd } = payload;
    const lockKey = getLockKey(projectKey, periodStart, periodEnd);
    await storage.delete(lockKey);
    return { success: true };
  } catch (err) {
    console.error('unlockPeriod error:', err);
    return { error: 'Failed to unlock period' };
  }
});

// Submit timesheet for current user
resolver.define('submitTimesheet', async ({ context, payload }) => {
  try {
    const projectKey = context.extension.project.key;
    const accountId = context.accountId;
    const { periodStart, periodEnd } = payload;
    const response = await api.asApp().requestJira(
      route`/rest/api/3/user?accountId=${accountId}`,
      { headers: { 'Accept': 'application/json' } }
    );
    const user = response.ok ? await safeJson(response) : null;
    const displayName = user?.displayName || 'Unknown User';
    const subsKey = getSubsKey(projectKey, periodStart, periodEnd);
    const submissions = (await storage.get(subsKey)) || {};
    submissions[accountId] = {
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      submittedByName: displayName,
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
    };
    await storage.set(subsKey, submissions);
    return { success: true };
  } catch (err) {
    console.error('submitTimesheet error:', err);
    return { error: 'Failed to submit timesheet' };
  }
});

// Review (approve/reject) a user's timesheet submission
resolver.define('reviewTimesheet', async ({ context, payload }) => {
  try {
    const projectKey = context.extension.project.key;
    const reviewerId = context.accountId;
    const { periodStart, periodEnd, targetAccountId, action } = payload;
    if (action !== 'approved' && action !== 'rejected') {
      return { error: 'Invalid action. Must be approved or rejected.' };
    }
    const reviewerResp = await api.asApp().requestJira(
      route`/rest/api/3/user?accountId=${reviewerId}`,
      { headers: { 'Accept': 'application/json' } }
    );
    const reviewer = reviewerResp.ok ? await safeJson(reviewerResp) : null;
    const reviewerName = reviewer?.displayName || 'Unknown User';
    const subsKey = getSubsKey(projectKey, periodStart, periodEnd);
    const submissions = (await storage.get(subsKey)) || {};
    if (!submissions[targetAccountId]) {
      return { error: 'No submission found for this user.' };
    }
    submissions[targetAccountId].status = action;
    submissions[targetAccountId].reviewedBy = reviewerId;
    submissions[targetAccountId].reviewedByName = reviewerName;
    submissions[targetAccountId].reviewedAt = new Date().toISOString();
    await storage.set(subsKey, submissions);
    return { success: true };
  } catch (err) {
    console.error('reviewTimesheet error:', err);
    return { error: 'Failed to review timesheet' };
  }
});

// Resolver: Prepare CSV export (store in Forge storage, return webtrigger download URL)
resolver.define('prepareExport', async ({ payload }) => {
  try {
    const csv = payload?.csv;
    if (!csv) return { error: 'No data to export.' };

    const exportId = 'csvexport-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    await storage.set(exportId, csv);

    const baseUrl = await webTrigger.getUrl('csv-export');
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = baseUrl + separator + 'id=' + encodeURIComponent(exportId);

    return { url };
  } catch (err) {
    console.error('prepareExport error:', err);
    return { error: 'Failed to prepare export: ' + (err.message || '') };
  }
});

const resolverHandler = resolver.getDefinitions();

// Webtrigger handler: Serves CSV file download
async function csvExportHandler(request) {
  try {
    console.log('[CSV Export] Webtrigger invoked');
    const idParam = request.queryParameters?.id;
    const exportId = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!exportId) {
      console.log('[CSV Export] Missing export ID');
      return {
        body: 'Missing export ID. Please try exporting again.',
        headers: { 'Content-Type': ['text/plain'] },
        statusCode: 400,
        statusText: 'Bad Request',
      };
    }

    console.log('[CSV Export] Fetching CSV for key:', exportId);
    const csv = await storage.get(exportId);
    if (!csv) {
      console.log('[CSV Export] Key not found in storage');
      return {
        body: 'Export not found or already downloaded. Please try exporting again.',
        headers: { 'Content-Type': ['text/plain'] },
        statusCode: 404,
        statusText: 'Not Found',
      };
    }

    // Clean up after retrieval
    await storage.delete(exportId);
    console.log('[CSV Export] Success, returning CSV (' + csv.length + ' chars)');

    return {
      body: csv,
      headers: {
        'Content-Type': ['text/csv; charset=utf-8'],
        'Content-Disposition': ['attachment; filename="worklog-export.csv"'],
      },
      statusCode: 200,
      statusText: 'OK',
    };
  } catch (err) {
    console.error('[CSV Export] Handler error:', err);
    return {
      body: 'Export failed. Please try again.',
      headers: { 'Content-Type': ['text/plain'] },
      statusCode: 500,
      statusText: 'Internal Server Error',
    };
  }
}

// Single unified handler: routes webtrigger requests vs resolver requests
export const handler = async (event, context) => {
  // Webtrigger events have an HTTP method property
  if (event.method) {
    return csvExportHandler(event);
  }
  // Otherwise delegate to the resolver
  return resolverHandler(event, context);
};
