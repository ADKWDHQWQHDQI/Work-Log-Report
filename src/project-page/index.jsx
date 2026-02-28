import React, { useState, useEffect, useMemo } from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  DynamicTable,
  Stack,
  Box,
  Inline,
  SectionMessage,
  Spinner,
  Button,
  Lozenge,
  Textfield,
  Select,
  DatePicker,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  xcss,
} from '@forge/react';
import { invoke, router } from '@forge/bridge';

function formatTime(seconds) {
  if (!seconds || seconds === 0) return '0m';
  const days = Math.floor(seconds / 28800);
  const hours = Math.floor((seconds % 28800) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '0m';
}

function escapeCSV(str) {
  if (!str) return '';
  var s = String(str);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Search filter options
const FILTER_OPTIONS = [
  { label: 'All Fields', value: 'all' },
  { label: 'Assignee', value: 'assignee' },
  { label: 'Issue Key', value: 'issueKey' },
  { label: 'Issue Type', value: 'issueType' },
  { label: 'Sprint', value: 'sprint' },
];

const compactSelectStyles = xcss({ maxWidth: '120px' });
const compactFieldStyles = xcss({ maxWidth: '160px' });

function matchesSearch(entry, query, filterField) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;

  if (filterField === 'assignee') {
    return (entry.author || '').toLowerCase().includes(q);
  }
  if (filterField === 'issueKey') {
    return (entry.issueKey || entry.key || '').toLowerCase().includes(q);
  }
  if (filterField === 'issueType') {
    return (entry.issueType || '').toLowerCase().includes(q);
  }
  if (filterField === 'sprint') {
    return (entry.sprintName || '').toLowerCase().includes(q);
  }
  const fields = [
    entry.author, entry.issueKey, entry.key, entry.issueSummary,
    entry.summary, entry.issueType, entry.sprintName,
    entry.issueStatus, entry.status, entry.comment,
  ];
  return fields.some((f) => f && String(f).toLowerCase().includes(q));
}

function matchesIssueSearch(issue, query, filterField) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;

  if (filterField === 'issueKey') {
    return (issue.key || '').toLowerCase().includes(q);
  }
  if (filterField === 'issueType') {
    return (issue.issueType || '').toLowerCase().includes(q);
  }
  if (filterField === 'sprint') {
    return (issue.sprintName || '').toLowerCase().includes(q);
  }
  if (filterField === 'assignee') {
    return true;
  }
  const fields = [issue.key, issue.summary, issue.status, issue.issueType, issue.sprintName];
  return fields.some((f) => f && String(f).toLowerCase().includes(q));
}

const ProjectPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('all');
  const [view, setView] = useState('people');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterField, setFilterField] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedIssueKey, setSelectedIssueKey] = useState(null);

  const fetchData = async (selectedPeriod, startOverride, endOverride) => {
    setLoading(true);
    setError(null);
    try {
      const p = selectedPeriod || period;
      var payload = { period: p };
      if (p === 'custom') {
        payload.customStart = startOverride || customStartDate;
        payload.customEnd = endOverride || customEndDate;
      }
      const result = await invoke('getProjectWorklogs', payload);
      if (!result) {
        setError('No response from server. Please try again.');
      } else if (result.error) {
        setError(result.error);
      } else {
        setData(result);
      }
    } catch (err) {
      setError(`Failed to fetch project work logs: ${err.message || 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    fetchData(newPeriod);
  };

  var handleCustomDateApply = function () {
    if (customStartDate && customEndDate) {
      setPeriod('custom');
      fetchData('custom', customStartDate, customEndDate);
    }
  };

  useEffect(() => {
    fetchData('all');
  }, []);

  // Extract data (safe even when data is null)
  const entries = data && data.entries ? data.entries : [];
  const totalSeconds = data ? (data.totalSeconds || 0) : 0;
  const userSummary = data ? (data.userSummary || []) : [];
  const issueSummary = data ? (data.issueSummary || []) : [];
  const projectKey = data ? (data.projectKey || '?') : '?';
  const hasEntries = entries.length > 0;

  // ALL useMemo hooks MUST be called unconditionally (before any return)
  const filteredEntries = useMemo(
    function () {
      return entries.filter(function (e) { return matchesSearch(e, searchQuery, filterField); });
    },
    [entries, searchQuery, filterField]
  );

  const filteredUserSummary = useMemo(
    function () {
      if (!searchQuery || !searchQuery.trim()) return userSummary;
      if (filterField === 'assignee' || filterField === 'all') {
        return userSummary.filter(function (u) {
          var q = searchQuery.toLowerCase().trim();
          return (u.name || '').toLowerCase().includes(q);
        });
      }
      var userMap = {};
      filteredEntries.forEach(function (entry) {
        var key = entry.authorId || entry.author;
        if (!userMap[key]) {
          userMap[key] = { name: entry.author, totalSeconds: 0, entryCount: 0 };
        }
        userMap[key].totalSeconds += entry.timeSpentSeconds;
        userMap[key].entryCount += 1;
      });
      return Object.values(userMap).sort(function (a, b) { return b.totalSeconds - a.totalSeconds; });
    },
    [userSummary, filteredEntries, searchQuery, filterField]
  );

  const filteredIssueSummary = useMemo(
    function () {
      if (!searchQuery || !searchQuery.trim()) return issueSummary;
      return issueSummary.filter(function (iss) { return matchesIssueSearch(iss, searchQuery, filterField); });
    },
    [issueSummary, searchQuery, filterField]
  );

  const filteredTotalSeconds = useMemo(
    function () {
      return filteredEntries.reduce(function (sum, e) { return sum + (e.timeSpentSeconds || 0); }, 0);
    },
    [filteredEntries]
  );

  // Per-person breakdown for the selected issue (for the popup)
  const selectedIssueData = useMemo(
    function () {
      if (!selectedIssueKey) return null;
      // Find the issue summary info
      var issueInfo = issueSummary.find(function (iss) { return iss.key === selectedIssueKey; });
      if (!issueInfo) return null;
      // Filter all entries for this issue
      var issueEntries = entries.filter(function (e) { return e.issueKey === selectedIssueKey; });
      // Aggregate by person
      var personMap = {};
      issueEntries.forEach(function (e) {
        var pid = e.authorId || e.author;
        if (!personMap[pid]) {
          personMap[pid] = { name: e.author, totalSeconds: 0, entryCount: 0 };
        }
        personMap[pid].totalSeconds += e.timeSpentSeconds || 0;
        personMap[pid].entryCount += 1;
      });
      var contributors = Object.values(personMap).sort(function (a, b) { return b.totalSeconds - a.totalSeconds; });
      return {
        key: issueInfo.key,
        summary: issueInfo.summary,
        issueType: issueInfo.issueType,
        status: issueInfo.status,
        totalSeconds: issueInfo.totalSeconds,
        totalEntries: issueInfo.entryCount,
        contributors: contributors,
      };
    },
    [selectedIssueKey, entries, issueSummary]
  );

  var handleExport = async function () {
    setExporting(true);
    try {
      var header = 'Issue Key,Issue Type,Summary,Status,Sprint,Person,Date,Time Logged,Time (seconds),Comment';
      var rows = filteredEntries.map(function (e) {
        return [
          escapeCSV(e.issueKey), escapeCSV(e.issueType),
          escapeCSV(e.issueSummary || e.summary),
          escapeCSV(e.issueStatus || e.status),
          escapeCSV(e.sprintName), escapeCSV(e.author),
          escapeCSV(e.date), escapeCSV(e.timeSpent),
          String(e.timeSpentSeconds || 0), escapeCSV(e.comment),
        ].join(',');
      });
      var csv = header + '\n' + rows.join('\n');
      var result = await invoke('prepareExport', { csv: csv });
      if (result && result.url) {
        await router.open(result.url);
      } else {
        console.error('Export error:', result?.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  // --- Now safe to do conditional rendering ---

  if (loading) {
    return (
      <Stack space="space.300" alignInline="center">
        <Box padding="space.400">
          <Stack space="space.200" alignInline="center">
            <Spinner size="large" />
            <Text>Analyzing work logs across project issues...</Text>
            <Text>This may take a moment for large projects.</Text>
          </Stack>
        </Box>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack space="space.200">
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
        <Button appearance="primary" onClick={() => fetchData()}>
          Try Again
        </Button>
      </Stack>
    );
  }

  if (!data || !hasEntries) {
    return (
      <Stack space="space.200">
        <Inline space="space.100">
          <Button
            appearance={period === 'week' ? 'primary' : 'default'}
            onClick={() => handlePeriodChange('week')}
          >
            This Week
          </Button>
          <Button
            appearance={period === 'month' ? 'primary' : 'default'}
            onClick={() => handlePeriodChange('month')}
          >
            This Month
          </Button>
          <Button
            appearance={period === 'all' ? 'primary' : 'default'}
            onClick={() => handlePeriodChange('all')}
          >
            All Time
          </Button>
          <Button
            appearance={period === 'custom' ? 'primary' : 'default'}
            onClick={() => setPeriod('custom')}
          >
            Custom
          </Button>
        </Inline>
        {period === 'custom' && (
          <Inline space="space.100" alignBlock="center">
            <Text>From:</Text>
            <DatePicker
              value={customStartDate}
              onChange={function (val) { setCustomStartDate(val); }}
              name="custom-start-empty"
            />
            <Text>To:</Text>
            <DatePicker
              value={customEndDate}
              onChange={function (val) { setCustomEndDate(val); }}
              name="custom-end-empty"
            />
            <Button appearance="primary" onClick={handleCustomDateApply} isDisabled={!customStartDate || !customEndDate}>
              Apply
            </Button>
          </Inline>
        )}
        {data && data.issueCount > 0 ? (
          <SectionMessage appearance="information">
            <Text>
              Found {data.issueCount} issues in this project, but none have time logged yet. Open an issue and click "Log work" to start tracking time.
            </Text>
          </SectionMessage>
        ) : (
          <SectionMessage appearance="information">
            <Text>
              No work logs found for the selected period. Try expanding the time range or open an issue and click "Log work" to start tracking time.
            </Text>
          </SectionMessage>
        )}
      </Stack>
    );
  }

  const isFiltered = searchQuery && searchQuery.trim().length > 0;

  // "By Person" table
  const peopleHead = {
    cells: [
      { key: 'num', content: '#' },
      { key: 'person', content: 'Person', isSortable: true },
      { key: 'time', content: 'Time Logged', isSortable: true },
      { key: 'entries', content: 'Entries', isSortable: true },
      { key: 'share', content: '% Share', isSortable: true },
    ],
  };

  const baseTotalForPeople = isFiltered ? filteredTotalSeconds : totalSeconds;
  const peopleRows = filteredUserSummary.map((user, index) => {
    const pct = baseTotalForPeople > 0
      ? Math.round((user.totalSeconds / baseTotalForPeople) * 100)
      : 0;
    return {
      key: 'user-' + index,
      cells: [
        { key: 'num', content: String(index + 1) },
        { key: 'person', content: user.name },
        {
          key: 'time',
          content: (
            <Lozenge appearance="success">{formatTime(user.totalSeconds)}</Lozenge>
          ),
        },
        { key: 'entries', content: String(user.entryCount) },
        {
          key: 'share',
          content: (
            <Lozenge appearance={pct >= 30 ? 'success' : 'default'}>
              {pct}%
            </Lozenge>
          ),
        },
      ],
    };
  });

  // "By Issue" table
  const issuesHead = {
    cells: [
      { key: 'issue', content: 'Issue', isSortable: true },
      { key: 'type', content: 'Type' },
      { key: 'summary', content: 'Summary' },
      { key: 'status', content: 'Status' },
      { key: 'sprint', content: 'Sprint' },
      { key: 'time', content: 'Time Logged', isSortable: true },
      { key: 'entries', content: 'Entries', isSortable: true },
    ],
  };

  const issuesRows = filteredIssueSummary.map((issue, index) => ({
    key: 'issue-' + index,
    cells: [
      {
        key: 'issue',
        content: (
          <Button
            appearance="link"
            onClick={function () { setSelectedIssueKey(issue.key); }}
          >
            {issue.key}
          </Button>
        ),
      },
      { key: 'type', content: issue.issueType || '—' },
      {
        key: 'summary',
        content:
          issue.summary.length > 50
            ? issue.summary.substring(0, 50) + '...'
            : issue.summary,
      },
      {
        key: 'status',
        content: (
          <Lozenge appearance="default">{issue.status}</Lozenge>
        ),
      },
      { key: 'sprint', content: issue.sprintName || '—' },
      {
        key: 'time',
        content: (
          <Lozenge appearance="success">{formatTime(issue.totalSeconds)}</Lozenge>
        ),
      },
      { key: 'entries', content: String(issue.entryCount) },
    ],
  }));

  // "All Entries" table
  const detailsHead = {
    cells: [
      { key: 'issue', content: 'Issue', isSortable: true },
      { key: 'type', content: 'Type', isSortable: true },
      { key: 'person', content: 'Person', isSortable: true },
      { key: 'sprint', content: 'Sprint', isSortable: true },
      { key: 'date', content: 'Date', isSortable: true },
      { key: 'time', content: 'Time' },
      { key: 'comment', content: 'Comment' },
    ],
  };

  const detailsRows = filteredEntries.slice(0, 100).map((entry, index) => ({
    key: 'entry-' + index,
    cells: [
      {
        key: 'issue',
        content: (
          <Lozenge appearance="inprogress">{entry.issueKey}</Lozenge>
        ),
      },
      { key: 'type', content: entry.issueType || '—' },
      { key: 'person', content: entry.author },
      { key: 'sprint', content: entry.sprintName || '—' },
      { key: 'date', content: entry.date },
      {
        key: 'time',
        content: (
          <Lozenge appearance="success">{entry.timeSpent}</Lozenge>
        ),
      },
      {
        key: 'comment',
        content: entry.comment
          ? entry.comment.length > 40
            ? entry.comment.substring(0, 40) + '...'
            : entry.comment
          : '—',
      },
    ],
  }));

  var searchPlaceholder = 'Search across all fields...';
  if (filterField === 'assignee') searchPlaceholder = 'Search by person name...';
  else if (filterField === 'issueKey') searchPlaceholder = 'Search by issue key (e.g. AI-16)...';
  else if (filterField === 'issueType') searchPlaceholder = 'Search by issue type (e.g. Task, Bug)...';
  else if (filterField === 'sprint') searchPlaceholder = 'Search by sprint name...';

  return (
    <Stack space="space.300">
      <Box padding="space.200">
        <Inline spread="space-between" alignBlock="center">
          <Stack space="space.100">
            <Heading as="h3">{projectKey}</Heading>
            <Inline space="space.200">
              <Lozenge appearance="success" isBold>
                {formatTime(totalSeconds)} total
              </Lozenge>
              <Lozenge appearance="inprogress">
                {userSummary.length} {userSummary.length === 1 ? 'contributor' : 'contributors'}
              </Lozenge>
              <Lozenge appearance="default">
                {issueSummary.length} {issueSummary.length === 1 ? 'issue' : 'issues'} with logs
              </Lozenge>
              <Lozenge appearance="moved">
                {entries.length} total entries
              </Lozenge>
            </Inline>
          </Stack>
          <Button appearance="primary" onClick={handleExport} isDisabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </Inline>
      </Box>

      <Stack space="space.100">
        <Inline space="space.100">
          <Text>Period:</Text>
          <Button
            appearance={period === 'week' ? 'primary' : 'default'}
            onClick={() => handlePeriodChange('week')}
          >
            This Week
          </Button>
          <Button
            appearance={period === 'month' ? 'primary' : 'default'}
            onClick={() => handlePeriodChange('month')}
          >
            This Month
          </Button>
          <Button
            appearance={period === 'all' ? 'primary' : 'default'}
            onClick={() => handlePeriodChange('all')}
          >
            All Time
          </Button>
          <Button
            appearance={period === 'custom' ? 'primary' : 'default'}
            onClick={() => setPeriod('custom')}
          >
            Custom
          </Button>
        </Inline>
        {period === 'custom' && (
          <Inline space="space.100" alignBlock="center">
            <Text>From:</Text>
            <DatePicker
              value={customStartDate}
              onChange={function (val) { setCustomStartDate(val); }}
              name="custom-start"
            />
            <Text>To:</Text>
            <DatePicker
              value={customEndDate}
              onChange={function (val) { setCustomEndDate(val); }}
              name="custom-end"
            />
            <Button appearance="primary" onClick={handleCustomDateApply} isDisabled={!customStartDate || !customEndDate}>
              Apply
            </Button>
          </Inline>
        )}

        <Inline space="space.100">
          <Text>View:</Text>
          <Button
            appearance={view === 'people' ? 'primary' : 'default'}
            onClick={() => setView('people')}
          >
            By Person
          </Button>
          <Button
            appearance={view === 'issues' ? 'primary' : 'default'}
            onClick={() => setView('issues')}
          >
            By Issue
          </Button>
          <Button
            appearance={view === 'details' ? 'primary' : 'default'}
            onClick={() => setView('details')}
          >
            All Entries
          </Button>
          <Button appearance="subtle" onClick={() => fetchData()}>
            Refresh
          </Button>
        </Inline>
      </Stack>

      <Inline spread="space-between" alignBlock="center">
        <Stack space="space.050">
          <Heading as="h4">
            {view === 'people' ? 'Time Logged Per Person' : view === 'issues' ? 'Time Logged Per Issue' : 'All Work Log Entries'}
          </Heading>
          {isFiltered && (
            <Text>Showing {filteredEntries.length} of {entries.length} entries ({formatTime(filteredTotalSeconds)})</Text>
          )}
        </Stack>
        <Inline space="space.050" alignBlock="center">
          <Box xcss={compactSelectStyles}>
            <Select
              appearance="default"
              options={FILTER_OPTIONS}
              value={FILTER_OPTIONS.find((o) => o.value === filterField)}
              onChange={(option) => setFilterField(option.value)}
              placeholder="Filter by..."
              name="search-filter"
            />
          </Box>
          <Box xcss={compactFieldStyles}>
            <Textfield
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              name="search-box"
            />
          </Box>
          {isFiltered && (
            <Button
              appearance="subtle"
              onClick={() => { setSearchQuery(''); setFilterField('all'); }}
            >
              Clear
            </Button>
          )}
        </Inline>
      </Inline>

      {view === 'people' && (
        <Stack space="space.100">
          {filteredUserSummary.length === 0 ? (
            <SectionMessage appearance="information">
              <Text>No results match your search.</Text>
            </SectionMessage>
          ) : (
            <DynamicTable
              head={peopleHead}
              rows={peopleRows}
              rowsPerPage={20}
              defaultSortKey="time"
              defaultSortOrder="DESC"
              label="Time logged per person"
            />
          )}
        </Stack>
      )}

      {view === 'issues' && (
        <Stack space="space.100">
          {filteredIssueSummary.length === 0 ? (
            <SectionMessage appearance="information">
              <Text>No results match your search.</Text>
            </SectionMessage>
          ) : (
            <DynamicTable
              head={issuesHead}
              rows={issuesRows}
              rowsPerPage={20}
              defaultSortKey="time"
              defaultSortOrder="DESC"
              label="Time logged per issue"
            />
          )}
        </Stack>
      )}

      {view === 'details' && (
        <Stack space="space.100">
          {filteredEntries.length === 0 ? (
            <SectionMessage appearance="information">
              <Text>No results match your search.</Text>
            </SectionMessage>
          ) : (
            <DynamicTable
              head={detailsHead}
              rows={detailsRows}
              rowsPerPage={20}
              defaultSortKey="date"
              defaultSortOrder="DESC"
              label="All work log entries"
            />
          )}
          {filteredEntries.length > 100 && (
            <SectionMessage appearance="information">
              <Text>Showing first 100 of {filteredEntries.length} entries.</Text>
            </SectionMessage>
          )}
        </Stack>
      )}
      <ModalTransition>
        {selectedIssueData && (
          <Modal onClose={function () { setSelectedIssueKey(null); }}>
            <ModalHeader>
              <ModalTitle>{selectedIssueData.key} — Contributors</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.150">
                <Text>{selectedIssueData.summary}</Text>
                <Inline space="space.200">
                  <Lozenge appearance="inprogress">{selectedIssueData.issueType || 'Issue'}</Lozenge>
                  <Lozenge appearance="default">{selectedIssueData.status}</Lozenge>
                  <Lozenge appearance="success" isBold>{formatTime(selectedIssueData.totalSeconds)} total</Lozenge>
                  <Lozenge appearance="moved">{selectedIssueData.totalEntries} {selectedIssueData.totalEntries === 1 ? 'entry' : 'entries'}</Lozenge>
                </Inline>
                <DynamicTable
                  head={{
                    cells: [
                      { key: 'num', content: '#' },
                      { key: 'person', content: 'Person', isSortable: true },
                      { key: 'time', content: 'Time Contributed', isSortable: true },
                      { key: 'entries', content: 'Entries', isSortable: true },
                      { key: 'share', content: '% Share', isSortable: true },
                    ],
                  }}
                  rows={selectedIssueData.contributors.map(function (c, idx) {
                    var pct = selectedIssueData.totalSeconds > 0
                      ? Math.round((c.totalSeconds / selectedIssueData.totalSeconds) * 100)
                      : 0;
                    return {
                      key: 'contrib-' + idx,
                      cells: [
                        { key: 'num', content: String(idx + 1) },
                        { key: 'person', content: c.name },
                        {
                          key: 'time',
                          content: (
                            <Lozenge appearance="success">{formatTime(c.totalSeconds)}</Lozenge>
                          ),
                        },
                        { key: 'entries', content: String(c.entryCount) },
                        {
                          key: 'share',
                          content: (
                            <Lozenge appearance={pct >= 30 ? 'success' : 'default'}>
                              {pct}%
                            </Lozenge>
                          ),
                        },
                      ],
                    };
                  })}
                  defaultSortKey="time"
                  defaultSortOrder="DESC"
                  label="Contributors for this issue"
                />
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="primary" onClick={function () { setSelectedIssueKey(null); }}>
                Close
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(<ProjectPage />);
