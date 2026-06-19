# Issue Creation Command

## Function
Create GitHub issues using GitHub CLI with standardized format and proper categorization

## Trigger Condition
When user inputs `/issue` followed by issue description

## Behavior
1. Parse user input to extract issue details
2. Generate standardized issue title and body
3. Use GitHub CLI to create issue with appropriate labels
4. Provide confirmation with issue URL

## Issue Format Standards

### Title Format
- Use clear, descriptive titles
- Start with action verb when applicable
- Keep under 100 characters
- Examples:
  - "Add support for custom model providers"
  - "Fix memory leak in conversation manager"
  - "Improve error handling in tool execution"

### Body Structure
```markdown
## Description
Brief description of the issue or feature request

## Problem/Need
What problem does this solve or what need does it address?

## Proposed Solution
How should this be implemented or resolved?

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Additional Context
Any additional information, screenshots, or references
```

### Label Categories
- **bug**: Issues that cause unexpected behavior
- **enhancement**: New features or improvements
- **documentation**: Documentation updates needed
- **performance**: Performance-related issues
- **security**: Security vulnerabilities or concerns
- **breaking-change**: Changes that break existing functionality
- **good-first-issue**: Suitable for new contributors
- **help-wanted**: Community help needed
- **priority-high**: High priority issues
- **priority-medium**: Medium priority issues
- **priority-low**: Low priority issues

## Implementation Steps

1. **Parse Input**: Extract issue type, description, and details from user input
2. **Generate Title**: Create standardized title based on issue type
3. **Format Body**: Structure issue body with required sections
4. **Assign Labels**: Automatically assign appropriate labels
5. **Create Issue**: Use `gh issue create` command
6. **Confirm**: Display created issue URL and details

## GitHub CLI Commands

### Basic Issue Creation
```bash
gh issue create --title "Issue Title" --body "Issue description" --label "bug,priority-medium"
```

### With Assignee
```bash
gh issue create --title "Issue Title" --body "Issue description" --assignee @me --label "enhancement"
```

### With Milestone
```bash
gh issue create --title "Issue Title" --body "Issue description" --milestone "v1.0.0" --label "feature"
```

## Input Examples

### Bug Report
```
/issue Fix memory leak in agent conversation manager causing performance degradation after long sessions
```

### Feature Request
```
/issue Add support for custom model providers to allow integration with local LLM services
```

### Documentation
```
/issue Update API documentation for new streaming response format
```

### Performance Issue
```
/issue Optimize tool execution performance for large batch operations
```

## Quality Checklist
- [ ] Issue title is clear and descriptive
- [ ] Issue body follows standard format
- [ ] Appropriate labels are assigned
- [ ] Acceptance criteria are defined
- [ ] Issue is properly categorized
- [ ] No sensitive information included
- [ ] GitHub CLI is authenticated and working

## Error Handling
- Validate GitHub CLI authentication
- Check repository access permissions
- Handle network connectivity issues
- Provide clear error messages for common failures
- Suggest troubleshooting steps when needed

## Prerequisites
- GitHub CLI installed and authenticated
- Repository access permissions
- Valid GitHub token with issue creation rights
