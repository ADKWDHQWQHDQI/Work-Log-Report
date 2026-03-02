import React, { useState, useEffect } from 'react';
import ForgeReconciler, { useProductContext } from '@forge/react';
import { Text, Heading, Stack, Box, Textfield, Select, Button, SectionMessage, Label, xcss } from '@forge/react';
import { view } from '@forge/bridge';

const containerStyle = xcss({ padding: 'space.200' });
const fieldStyle = xcss({ paddingBlock: 'space.100' });
const footerStyle = xcss({ paddingBlockStart: 'space.200' });

const PERIOD_OPTIONS = [
  { label: 'Last 7 days', value: 'week' },
  { label: 'Last 30 days', value: 'month' },
  { label: 'Last 90 days (Quarter)', value: 'quarter' },
];

const VIEW_OPTIONS = [
  { label: 'Overview (All Charts)', value: 'overview' },
  { label: 'Top Contributors', value: 'contributors' },
  { label: 'Issue Type Distribution', value: 'issueTypes' },
  { label: 'Daily Activity', value: 'daily' },
  { label: 'Top Issues by Time', value: 'topIssues' },
];

function Edit() {
  const context = useProductContext();

  const [projectKey, setProjectKey] = useState('');
  const [period, setPeriod] = useState(null);
  const [viewMode, setViewMode] = useState(null);
  const [error, setError] = useState('');

  // Load existing configuration
  useEffect(() => {
    if (context?.extension?.gadgetConfiguration) {
      const config = context.extension.gadgetConfiguration;
      if (config.projectKey) setProjectKey(config.projectKey);
      if (config.period) {
        const match = PERIOD_OPTIONS.find(function (o) { return o.value === config.period; });
        if (match) setPeriod(match);
      }
      if (config.viewMode) {
        const match = VIEW_OPTIONS.find(function (o) { return o.value === config.viewMode; });
        if (match) setViewMode(match);
      }
    }
  }, [context]);

  const handleSave = async () => {
    const trimmedKey = (projectKey || '').trim().toUpperCase();
    if (!trimmedKey) {
      setError('Project key is required.');
      return;
    }
    setError('');
    await view.submit({
      projectKey: trimmedKey,
      period: period ? period.value : 'month',
      viewMode: viewMode ? viewMode.value : 'overview',
    });
  };

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.150">
        <Heading as="h5">Configure Work Log Insights</Heading>

        <Box xcss={fieldStyle}>
          <Label labelFor="project-key">Project Key *</Label>
          <Textfield
            id="project-key"
            placeholder="e.g. PROJ, SCRUM, DEMO"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
          />
        </Box>

        <Box xcss={fieldStyle}>
          <Label labelFor="period-select">Time Period</Label>
          <Select
            inputId="period-select"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(val) => setPeriod(val)}
            placeholder="Select period..."
          />
        </Box>

        <Box xcss={fieldStyle}>
          <Label labelFor="view-select">Default View</Label>
          <Select
            inputId="view-select"
            options={VIEW_OPTIONS}
            value={viewMode}
            onChange={(val) => setViewMode(val)}
            placeholder="Select view..."
          />
        </Box>

        {error ? (
          <SectionMessage appearance="error">
            <Text>{error}</Text>
          </SectionMessage>
        ) : null}

        <Box xcss={footerStyle}>
          <Button appearance="primary" onClick={handleSave}>Save</Button>
        </Box>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Edit />
  </React.StrictMode>
);
