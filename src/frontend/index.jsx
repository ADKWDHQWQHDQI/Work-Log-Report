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

function getPercentageAppearance(percentage) {
  if (percentage >= 50) return 'success';
  if (percentage >= 25) return 'inprogress';
  return 'default';
}

function escapeCSV(str) {
  if (!str) return '';
  var s = String(str);
  if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const FILTER_OPTIONS = [
  { label: 'All Fields', value: 'all' },
  { label: 'Person', value: 'person' },
  { label: 'Comment', value: 'comment' },
  { label: 'Team', value: 'team' },
];

const compactSelectStyles = xcss({ maxWidth: '120px' });
const compactFieldStyles = xcss({ maxWidth: '160px' });

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
  if (filterField === 'team') return true;
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
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  useEffect(function () {
    if (filterField === 'team' && groups.length === 0) {
      setGroupsLoading(true);
      invoke('getGroups').then(function (result) {
        if (result && result.groups) setGroups(result.groups);
        setGroupsLoading(false);
      }).catch(function () { setGroupsLoading(false); });
    }
    if (filterField !== 'team') {
      setSelectedGroup(null);
      setGroupMembers([]);
    }
  }, [filterField]);

  useEffect(function () {
    if (selectedGroup) {
      setMembersLoading(true);
      invoke('getGroupMembers', { groupId: selectedGroup }).then(function (result) {
        if (result && result.members) setGroupMembers(result.members);
        else setGroupMembers([]);
        setMembersLoading(false);
      }).catch(function () { setGroupMembers([]); setMembersLoading(false); });
    } else {
      setGroupMembers([]);
    }
  }, [selectedGroup]);

  // Extract data safely (works even when worklogs is null)
  const entries = worklogs && worklogs.entries ? worklogs.entries : [];
  const totalSeconds = worklogs ? (worklogs.totalSeconds || 0) : 0;
  const userSummary = worklogs ? (worklogs.userSummary || []) : [];

  // ALL useMemo hooks MUST be called unconditionally (before any return)
  const teamMemberIds = useMemo(
    function () {
      if (filterField !== 'team' || !selectedGroup || groupMembers.length === 0) return null;
      var ids = {};
      groupMembers.forEach(function (m) { ids[m.accountId] = true; });
      return ids;
    },
    [filterField, selectedGroup, groupMembers]
  );

  const filteredEntries = useMemo(
    function () {
      var result = entries;
      if (teamMemberIds) {
        result = result.filter(function (e) { return !!teamMemberIds[e.authorId]; });
      }
      return result.filter(function (e) { return matchesSearch(e, searchQuery, filterField); });
    },
    [entries, searchQuery, filterField, teamMemberIds]
  );

  const filteredUserSummary = useMemo(
    function () {
      if (filterField === 'team' && teamMemberIds) {
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
      }
      if (!searchQuery || !searchQuery.trim()) return userSummary;
      var userMap2 = {};
      filteredEntries.forEach(function (entry) {
        var key = entry.authorId || entry.author;
        if (!userMap2[key]) {
          userMap2[key] = { name: entry.author, totalSeconds: 0, entryCount: 0 };
        }
        userMap2[key].totalSeconds += entry.timeSpentSeconds;
        userMap2[key].entryCount += 1;
      });
      return Object.values(userMap2).sort(function (a, b) { return b.totalSeconds - a.totalSeconds; });
    },
    [userSummary, filteredEntries, searchQuery, filterField, teamMemberIds]
  );

  const filteredTotalSeconds = useMemo(
    function () {
      return filteredEntries.reduce(function (sum, e) { return sum + (e.timeSpentSeconds || 0); }, 0);
    },
    [filteredEntries]
  );

  var handleExport = async function () {
    setExporting(true);
    try {
      var issueKey = worklogs ? (worklogs.issueKey || '') : '';
      var header = 'Issue Key,Person,Date,Time Logged,Time (seconds),Comment';
      var rows = filteredEntries.map(function (e) {
        return [
          escapeCSV(issueKey), escapeCSV(e.author),
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

  const isFiltered = (filterField === 'team' && selectedGroup) ||
                     (filterField !== 'team' && searchQuery && searchQuery.trim().length > 0);

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
  else if (filterField === 'team') searchPlaceholder = 'Select a team...';

  var groupOptions = groups.map(function (g) { return { label: g.name, value: g.groupId }; });

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
          <Inline space="space.100" alignBlock="center">
            <Lozenge appearance="success" isBold>
              {formatTime(totalSeconds)} total
            </Lozenge>
            <Button appearance="primary" onClick={handleExport} isDisabled={exporting}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </Inline>
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

      <Inline spread="space-between" alignBlock="center">
        <Stack space="space.050">
          <Heading as="h4">
            {view === 'summary' ? 'Per Person' : 'All Entries'}
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
          {filterField === 'team' ? (
            <Box xcss={compactFieldStyles}>
              {groupsLoading ? (
                <Spinner size="small" />
              ) : (
                <Select
                  options={groupOptions}
                  value={groupOptions.find(function (o) { return o.value === selectedGroup; })}
                  onChange={function (option) { setSelectedGroup(option ? option.value : null); }}
                  placeholder="Select team..."
                  name="team-select"
                />
              )}
            </Box>
          ) : (
            <Box xcss={compactFieldStyles}>
              <Textfield
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                name="search-box"
              />
            </Box>
          )}
          {membersLoading && filterField === 'team' && (
            <Spinner size="small" />
          )}
          {isFiltered && (
            <Button
              appearance="subtle"
              onClick={() => { setSearchQuery(''); setFilterField('all'); setSelectedGroup(null); }}
            >
              Clear
            </Button>
          )}
        </Inline>
      </Inline>

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
