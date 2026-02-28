# Work Log Summary

A Jira app built on Atlassian Forge that helps teams track and visualize time logged across issues and projects.

---

## What it does

### Issue Panel — Work Log Summary
Appears on every Jira issue as a side panel. Shows:
- Total time logged on that issue
- Breakdown per person (hours + percentage share)
- Full list of individual work log entries with dates and comments

### Project Page — Team Work Log Report
Adds a "Team Work Log Report" tab to every Jira project board. Shows:
- **By Person** — total hours logged per team member
- **By Issue** — total hours logged per issue
- **All Entries** — full table of every work log entry
- Period filter: last 7 days / last 30 days / all time

---

## Tech stack

| Layer | Technology |
|---|---|
| Platform | Atlassian Forge (Cloud) |
| Frontend | UI Kit 2 (`@forge/react`) |
| Backend | Forge Resolvers (`@forge/resolver`) |
| API | Jira REST API v3 |
| Runtime | Node.js 24.x |

---

## Deployment

```bash
# Deploy to staging (all users can access)
forge deploy -e staging

# Install on a Jira site
forge install -e staging --product jira --site <your-site>.atlassian.net

# View live logs
forge logs
```

> **Note:** Development environment (`forge deploy`) restricts access to the app owner only. Use `staging` for team-wide access.

---

## Permissions required

- `read:jira-work` — read work logs and issues
- `read:jira-user` — read user display names

