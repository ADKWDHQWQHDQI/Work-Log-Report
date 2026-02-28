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
} from '@forge/react';
import { invoke } from '@forge/bridge';

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

function getPercentageAppearance(percentage) {
  if (percentage >= 50) return 'success';
  if (percentage >= 25) return 'inprogress';
  return 'default';
}

const FILTER_OPTIONS = [
  { label: 'All Fields', value: 'all' },
  { label: 'Person', value: 'person' },
  { label: 'Comment', value: 'comment' },
];

function matchesSearch(entry, query, filterField) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;

  if (filterField === 'person') {
    return (entry.author || '').toLowerCase().includes(q);
  }
  if (filterField === 'comment') {
    return (entry.comment || '').toLowerCase().includes(q);
  }
  const fields = [entry.author, entry.comment, entry.date, entry.timeSpent];
  return fields.some((f) => f && String(f).toLowerCase().includes(q));
}

const App = () => {
  const [worklogs, setWorklogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterField, setFilterField] = useState('all');

  const fetchWorklogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke('getWorklogs');
      if (data.error) {
        setError(data.error);
      } else {
        setWorklogs(data);
      }
    } catch (err) {
      setError('Failed to fetch work logs. Please try again.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWorklogs();
  }, []);

  // Extract data safely (works even when worklogs is null)
  const entries = worklogs && worklogs.entries ? worklogs.entries : [];
  const totalSeconds = worklogs ? (worklogs.totalSeconds || 0) : 0;
  const userSummary = worklogs ? (worklogs.userSummary || []) : [];

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

  const filteredTotalSeconds = useMemo(
    function () {
      return filteredEntries.reduce(function (sum, e) { return sum + (e.timeSpentSeconds || 0); }, 0);
    },
    [filteredEntries]
  );

  // --- Now safe to do conditional rendering ---

  if (loading) {
    return (
      <Stack space="space.200" alignInline="center">
        <Spinner size="large" />
        <Text>Loading work logs...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack space="space.200">
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
        <Button appearance="primary" onClick={fetchWorklogs}>
          Try Again
        </Button>
      </Stack>
    );
  }

  if (!worklogs || entries.length === 0) {
    return (
      <SectionMessage appearance="information">
        <Text>
          No work logs found for this issue. Start logging time to see a summary here!
        </Text>
      </SectionMessage>
    );
  }

  const isFiltered = searchQuery && searchQuery.trim().length > 0;

  // DynamicTable head/rows for the "Per Person" summary view
  const summaryHead = {
    cells: [
      { key: 'person', content: 'Person', isSortable: true },
      { key: 'time', content: 'Time Logged', isSortable: true },
      { key: 'entries', content: 'Entries', isSortable: true },
      { key: 'share', content: 'Share', isSortable: true },
    ],
  };

  const baseTotalForSummary = isFiltered ? filteredTotalSeconds : totalSeconds;
  const summaryRows = filteredUserSummary.map((user, index) => {
    const percentage =
      baseTotalForSummary > 0
        ? Math.round((user.totalSeconds / baseTotalForSummary) * 100)
        : 0;
    return {
      key: 'user-' + index,
      cells: [
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
            <Lozenge appearance={getPercentageAppearance(percentage)}>
              {percentage}%
            </Lozenge>
          ),
        },
      ],
    };
  });

  // DynamicTable head/rows for the "All Entries" view
  const entriesHead = {
    cells: [
      { key: 'person', content: 'Person', isSortable: true },
      { key: 'date', content: 'Date', isSortable: true },
      { key: 'time', content: 'Time' },
      { key: 'comment', content: 'Comment' },
    ],
  };

  const entriesRows = filteredEntries.map((entry, index) => ({
    key: 'entry-' + index,
    cells: [
      { key: 'person', content: entry.author },
      { key: 'date', content: entry.date },
      {
        key: 'time',
        content: (
          <Lozenge appearance="success">{entry.timeSpent}</Lozenge>
        ),
      },
      { key: 'comment', content: entry.comment || '—' },
    ],
  }));

  var searchPlaceholder = 'Search across all fields...';
  if (filterField === 'person') searchPlaceholder = 'Search by person name...';
  else if (filterField === 'comment') searchPlaceholder = 'Search by comment text...';

  return (
    <Stack space="space.200">
      <Box padding="space.200">
        <Inline spread="space-between" alignBlock="center">
          <Stack space="space.050">
            <Heading as="h3">Work Log Summary</Heading>
            <Text>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'} by{' '}
              {userSummary.length} {userSummary.length === 1 ? 'person' : 'people'}
            </Text>
          </Stack>
          <Lozenge appearance="success" isBold>
            {formatTime(totalSeconds)} total
          </Lozenge>
        </Inline>
      </Box>

      <Inline space="space.100">
        <Button
          appearance={view === 'summary' ? 'primary' : 'default'}
          onClick={() => setView('summary')}
        >
          Per Person
        </Button>
        <Button
          appearance={view === 'table' ? 'primary' : 'default'}
          onClick={() => setView('table')}
        >
          All Entries
        </Button>
        <Button appearance="subtle" onClick={fetchWorklogs}>
          Refresh
        </Button>
      </Inline>

      <Box padding="space.100">
        <Stack space="space.100">
          <Inline space="space.100" alignBlock="center">
            <Box>
              <Select
                appearance="default"
                options={FILTER_OPTIONS}
                value={FILTER_OPTIONS.find((o) => o.value === filterField)}
                onChange={(option) => setFilterField(option.value)}
                placeholder="Filter by..."
                name="search-filter"
              />
            </Box>
            <Box>
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
          {isFiltered && (
            <Text>
              Showing {filteredEntries.length} of {entries.length} entries ({formatTime(filteredTotalSeconds)})
            </Text>
          )}
        </Stack>
      </Box>

      {view === 'summary' && (
        filteredUserSummary.length === 0 ? (
          <SectionMessage appearance="information">
            <Text>No results match your search.</Text>
          </SectionMessage>
        ) : (
          <DynamicTable
            head={summaryHead}
            rows={summaryRows}
            rowsPerPage={20}
            defaultSortKey="time"
            defaultSortOrder="DESC"
            label="Work log summary per person"
          />
        )
      )}

      {view === 'table' && (
        filteredEntries.length === 0 ? (
          <SectionMessage appearance="information">
            <Text>No results match your search.</Text>
          </SectionMessage>
        ) : (
          <DynamicTable
            head={entriesHead}
            rows={entriesRows}
            rowsPerPage={20}
            defaultSortKey="date"
            defaultSortOrder="DESC"
            label="All work log entries"
          />
        )
      )}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
