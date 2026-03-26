---
name: find-duplicates
description: Used to walk the issues in GitHub for the current project, identify any duplicates by percentage, and create a list of tickets by number, identifying duplicate and original tickets.
---

# Find Duplicates (`/find-duplicates`)

When a user invokes the **find-duplicates**, pull a list of all issues - summaries, numbers, and titles, and perform the following instructions:

## 1. Load all GitHub issues

- Load all GitHub issues.

## 2. Iterate through issues, searching for duplication

- Iterate through each issue and perform a check to see if there is any duplication in either the issue name or description body.
- Calculate how much of the issue is original and how much is a potential duplicate.

## 3. Report findings

- Create a single report file that identifies the issue number, title of the issue, and a percentage duplication.
- For each issue that has a duplicate, identify the duplicate issues, and identify the wording that indicates duplication.
- Create a markdown file with the findings.
- Identify any issues that could be clarified or improved for their descriptions.
