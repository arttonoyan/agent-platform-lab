# Sample agent prompts

These prompts exercise the MCP tool surface end-to-end. Open the Agent Console (`/chat`) in the web UI, pick the named agent, and paste in any of the prompts below.

## MarketingAnalyticsAgent

Read-only analyst that grounds every answer in live analytics data.

1. *"What's our open rate over the last 14 days, and is the trailing 7 days better or worse than the 7 days before that?"*
2. *"List campaigns that are currently in Draft or Scheduled status."*
3. *"Pick the most recently-sent email campaign and walk me through its delivery, open, and CTR metrics."*
4. *"Which lifecycle segment has the highest customer count, and what does its targeting criteria look like?"*
5. *"Flag any day in the last 30 with an open rate more than 1.5x or less than 0.7x the 30-day average."*

## CampaignOptimizationAgent

Proposer that uses analytics + campaign data to recommend optimisations. It will **never** actually send a campaign unless you say "send it now" - it defaults to `dryRun=true`.

1. *"Look at the Spring HVAC Tune-Up 2026 campaign performance and propose three optimisations for the next iteration."*
2. *"For the 'New Homeowners' segment, recommend a subject line and send window based on the patterns you can see."*
3. *"Validate (dry-run) sending the 'Plumbing Membership Renewal' campaign, then tell me whether the audience size looks right relative to the segment count."*
4. *"Compare HVAC vs. Plumbing repeat-customer campaigns by open rate, then recommend the next move."*

## Campaign Analysis Workflow (`/workflows`)

The sequential workflow chains `MarketingAnalyticsAgent` -> `CampaignOptimizationAgent`. Try:

1. *"Analyse open rate and click-through for the last 14 days, flag underperformers, and recommend three concrete optimisations."*
2. *"Audit the last month of email campaigns and produce a one-page summary suitable for a marketing director."*
3. *"Identify the worst-performing campaign of the last 30 days and propose a remediation plan."*
