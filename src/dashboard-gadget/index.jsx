import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ForgeReconciler, { useProductContext, invoke } from '@forge/react';
import {
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
  Select,
  Badge,
  BarChart,
  PieChart,
  DonutChart,
  LineChart,
  xcss,
} from '@forge/react';

// ─── Styles ────────────────────────────────────────────────
const containerStyle = xcss({ padding: 'space.200' });
const cardStyle = xcss({
  padding: 'space.200',
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'border.radius.100',
});
const statCardStyle = xcss({
  padding: 'space.200',
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'border.radius.100',
  flex: '1',
  minWidth: '120px',
});
const chartContainerStyle = xcss({
  padding: 'space.200',
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'border.radius.100',
  overflow: 'hidden',
});
const headerBarStyle = xcss({ paddingBlockEnd: 'space.100' });
const topBarStyle = xcss({ paddingBlockEnd: 'space.200' });

// ─── Period options ────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: 'Last 7 days', value: 'week' },
  { label: 'Last 30 days', value: 'month' },
  { label: 'Last 90 days', value: 'quarter' },
];

const VIEW_OPTIONS = [
  { label: 'Overview', value: 'overview' },
  { label: 'Top Contributors', value: 'contributors' },
  { label: 'Issue Types', value: 'issueTypes' },
  { label: 'Daily Activity', value: 'daily' },
  { label: 'Top Issues', value: 'topIssues' },
];

// ─── Helpers ───────────────────────────────────────────────
function formatHours(seconds) {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Summary Cards ─────────────────────────────────────────
function SummaryCards({ data }) {
  const totalHours = Math.round((data.totalSeconds / 3600) * 10) / 10;
  const contributorCount = (data.userSummary || []).length;
  const issueCount = (data.issueSummary || []).length;
  const entryCount = (data.entries || []).length;

  return (
    <Inline space="space.200" spread="space-between">
      <Box xcss={statCardStyle}>
        <Stack space="space.050">
          <Text size="small" weight="bold">Total Time</Text>
          <Heading as="h4">{totalHours}h</Heading>
        </Stack>
      </Box>
      <Box xcss={statCardStyle}>
        <Stack space="space.050">
          <Text size="small" weight="bold">Contributors</Text>
          <Heading as="h4">{contributorCount}</Heading>
        </Stack>
      </Box>
      <Box xcss={statCardStyle}>
        <Stack space="space.050">
          <Text size="small" weight="bold">Issues</Text>
          <Heading as="h4">{issueCount}</Heading>
        </Stack>
      </Box>
      <Box xcss={statCardStyle}>
        <Stack space="space.050">
          <Text size="small" weight="bold">Log Entries</Text>
          <Heading as="h4">{entryCount}</Heading>
        </Stack>
      </Box>
    </Inline>
  );
}

// ─── Top Contributors (Bar Chart + Table) ──────────────────
function TopContributorsView({ data }) {
  const users = data.userSummary || [];
  if (users.length === 0) {
    return (
      <SectionMessage appearance="information">
        <Text>No contributor data available for this period.</Text>
      </SectionMessage>
    );
  }

  const top10 = users.slice(0, 10);

  const chartData = top10.map(function (u) {
    return {
      contributor: u.name.length > 15 ? u.name.substring(0, 15) + '...' : u.name,
      hours: Math.round((u.totalSeconds / 3600) * 100) / 100,
    };
  });

  const tableHead = {
    cells: [
      { key: 'rank', content: '#' },
      { key: 'name', content: 'Contributor' },
      { key: 'time', content: 'Time Logged' },
      { key: 'entries', content: 'Entries' },
    ],
  };

  const tableRows = top10.map(function (u, idx) {
    return {
      key: u.accountId || String(idx),
      cells: [
        { key: 'rank', content: <Text>{String(idx + 1)}</Text> },
        { key: 'name', content: <Text weight="bold">{u.name}</Text> },
        { key: 'time', content: <Lozenge appearance="inprogress">{formatHours(u.totalSeconds)}</Lozenge> },
        { key: 'entries', content: <Badge>{u.entryCount}</Badge> },
      ],
    };
  });

  return (
    <Stack space="space.200">
      <Heading as="h5">Top Contributors</Heading>
      {chartData.length > 0 ? (
        <Box xcss={chartContainerStyle}>
          <BarChart
            data={chartData}
            xAccessor="contributor"
            yAccessor="hours"
            title="Hours by Contributor"
            height={280}
          />
        </Box>
      ) : null}
      <DynamicTable head={tableHead} rows={tableRows} rowsPerPage={10} />
    </Stack>
  );
}

// ─── Issue Type Distribution (Donut Chart) ─────────────────
function IssueTypeView({ data }) {
  const breakdown = data.issueTypeBreakdown || [];
  if (breakdown.length === 0) {
    return (
      <SectionMessage appearance="information">
        <Text>No issue type data available for this period.</Text>
      </SectionMessage>
    );
  }

  return (
    <Stack space="space.200">
      <Heading as="h5">Issue Type Distribution</Heading>
      <Box xcss={chartContainerStyle}>
        <DonutChart
          data={breakdown}
          colorAccessor="type"
          labelAccessor="label"
          valueAccessor="hours"
          title="Hours by Issue Type"
          height={320}
          showMarkLabels={true}
        />
      </Box>
    </Stack>
  );
}

// ─── Daily Activity (Line Chart) ───────────────────────────
function DailyActivityView({ data }) {
  const daily = data.dailyActivity || [];
  if (daily.length === 0) {
    return (
      <SectionMessage appearance="information">
        <Text>No daily activity data available for this period.</Text>
      </SectionMessage>
    );
  }

  const chartData = daily.map(function (d) {
    const dateLabel = d.date.substring(5); // MM-DD
    return {
      day: dateLabel,
      hours: d.hours,
    };
  });

  return (
    <Stack space="space.200">
      <Heading as="h5">Daily Activity</Heading>
      <Box xcss={chartContainerStyle}>
        <LineChart
          data={chartData}
          xAccessor="day"
          yAccessor="hours"
          title="Hours Logged per Day"
          height={280}
        />
      </Box>
    </Stack>
  );
}

// ─── Top Issues by Time (Bar Chart + Table) ────────────────
function TopIssuesView({ data }) {
  const issues = data.issueSummary || [];
  if (issues.length === 0) {
    return (
      <SectionMessage appearance="information">
        <Text>No issue data available for this period.</Text>
      </SectionMessage>
    );
  }

  const top10 = issues.slice(0, 10);

  const chartData = top10.map(function (iss) {
    return {
      issue: iss.key,
      hours: Math.round((iss.totalSeconds / 3600) * 100) / 100,
    };
  });

  const tableHead = {
    cells: [
      { key: 'key', content: 'Issue' },
      { key: 'summary', content: 'Summary' },
      { key: 'type', content: 'Type' },
      { key: 'time', content: 'Time Logged' },
      { key: 'entries', content: 'Entries' },
    ],
  };

  const tableRows = top10.map(function (iss) {
    return {
      key: iss.key,
      cells: [
        { key: 'key', content: <Text weight="bold">{iss.key}</Text> },
        { key: 'summary', content: <Text>{iss.summary.length > 40 ? iss.summary.substring(0, 40) + '...' : iss.summary}</Text> },
        { key: 'type', content: <Lozenge>{iss.issueType}</Lozenge> },
        { key: 'time', content: <Lozenge appearance="inprogress">{formatHours(iss.totalSeconds)}</Lozenge> },
        { key: 'entries', content: <Badge>{iss.entryCount}</Badge> },
      ],
    };
  });

  return (
    <Stack space="space.200">
      <Heading as="h5">Top Issues by Time Logged</Heading>
      {chartData.length > 0 ? (
        <Box xcss={chartContainerStyle}>
          <BarChart
            data={chartData}
            xAccessor="issue"
            yAccessor="hours"
            title="Hours by Issue"
            height={280}
          />
        </Box>
      ) : null}
      <DynamicTable head={tableHead} rows={tableRows} rowsPerPage={10} />
    </Stack>
  );
}

// ═══════════════════════════════════════════════════════════
// ─── Main Dashboard Gadget ────────────────────────────────
// ═══════════════════════════════════════════════════════════
function DashboardGadget() {
  const context = useProductContext();

  // State
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [periodOverride, setPeriodOverride] = useState(null);
  const [viewOverride, setViewOverride] = useState(null);

  // Extract gadget configuration
  const config = useMemo(function () {
    if (!context?.extension?.gadgetConfiguration) return null;
    return context.extension.gadgetConfiguration;
  }, [context]);

  const projectKey = config?.projectKey || '';
  const configuredPeriod = config?.period || 'month';
  const configuredView = config?.viewMode || 'overview';

  const activePeriod = periodOverride ? periodOverride.value : configuredPeriod;
  const activeView = viewOverride ? viewOverride.value : configuredView;

  const periodSelectValue = useMemo(function () {
    return PERIOD_OPTIONS.find(function (o) { return o.value === activePeriod; }) || PERIOD_OPTIONS[1];
  }, [activePeriod]);

  const viewSelectValue = useMemo(function () {
    return VIEW_OPTIONS.find(function (o) { return o.value === activeView; }) || VIEW_OPTIONS[0];
  }, [activeView]);

  // Fetch data
  const loadData = useCallback(async function () {
    if (!projectKey) {
      setError('No project configured. Click the gadget edit button (pencil icon) to set a project key.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await invoke('getDashboardWorklogs', { projectKey, period: activePeriod });
      if (result.error) {
        setError(result.error);
      } else {
        setData(result);
      }
    } catch (err) {
      setError('Failed to load work log data: ' + (err.message || ''));
    }
    setLoading(false);
  }, [projectKey, activePeriod]);

  useEffect(function () {
    loadData();
  }, [loadData]);

  // ─── Render ────────────────────────────────────────────
  if (!context) {
    return <Spinner size="large" />;
  }

  if (!projectKey) {
    return (
      <Box xcss={containerStyle}>
        <SectionMessage appearance="warning">
          <Text>No project configured. Click the edit (pencil) icon on this gadget to set a project key.</Text>
        </SectionMessage>
      </Box>
    );
  }

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.200">
        {/* Header bar with inline controls */}
        <Box xcss={topBarStyle}>
          <Inline space="space.200" alignBlock="center" spread="space-between">
            <Inline space="space.100" alignBlock="center">
              <Heading as="h5">{projectKey}</Heading>
              <Text size="small">Work Log Insights</Text>
            </Inline>
            <Inline space="space.100" alignBlock="center">
              <Box>
                <Select
                  options={PERIOD_OPTIONS}
                  value={periodSelectValue}
                  onChange={function (val) { setPeriodOverride(val); }}
                  spacing="compact"
                  placeholder="Period"
                />
              </Box>
              <Box>
                <Select
                  options={VIEW_OPTIONS}
                  value={viewSelectValue}
                  onChange={function (val) { setViewOverride(val); }}
                  spacing="compact"
                  placeholder="View"
                />
              </Box>
              <Button appearance="subtle" onClick={loadData}>Refresh</Button>
            </Inline>
          </Inline>
        </Box>

        {/* Error */}
        {error ? (
          <SectionMessage appearance="error">
            <Text>{error}</Text>
          </SectionMessage>
        ) : null}

        {/* Loading */}
        {loading ? (
          <Inline space="space.100" alignBlock="center">
            <Spinner size="medium" />
            <Text>Loading work log data...</Text>
          </Inline>
        ) : null}

        {/* Content */}
        {!loading && !error && data ? (
          <Stack space="space.300">
            {/* Summary cards always show */}
            <SummaryCards data={data} />

            {/* Conditional views */}
            {activeView === 'overview' ? (
              <Stack space="space.300">
                <TopContributorsView data={data} />
                <IssueTypeView data={data} />
                <DailyActivityView data={data} />
                <TopIssuesView data={data} />
              </Stack>
            ) : null}

            {activeView === 'contributors' ? <TopContributorsView data={data} /> : null}
            {activeView === 'issueTypes' ? <IssueTypeView data={data} /> : null}
            {activeView === 'daily' ? <DailyActivityView data={data} /> : null}
            {activeView === 'topIssues' ? <TopIssuesView data={data} /> : null}

            {/* Period info */}
            {data.periodStart && data.periodEnd ? (
              <Box xcss={headerBarStyle}>
                <Text size="small">
                  Period: {data.periodStart} to {data.periodEnd} | {(data.entries || []).length} entries from {data.issueCount || 0} issues
                </Text>
              </Box>
            ) : null}
          </Stack>
        ) : null}

        {/* No data */}
        {!loading && !error && !data ? (
          <SectionMessage appearance="information">
            <Text>No work log data found. Ensure the project key is correct and has logged work.</Text>
          </SectionMessage>
        ) : null}
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <DashboardGadget />
  </React.StrictMode>
);
