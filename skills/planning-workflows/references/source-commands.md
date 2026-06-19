## Source commands (migrated from `.cursor/commands/`)

### spec.md

```md
# /spec - Force use of complete spec workflow

## Command Description
Force use of complete spec workflow for development. Suitable for new feature development, complex architecture design, multi-module integration, database/UI design, and other scenarios.

## Workflow

### 0. Important Reminder
Please note! You must follow the rules below, and each phase must be confirmed by me before proceeding to the next phase;

### 1. Requirements Clarification
If you determine that my input presents a new requirement, you can work independently according to standard software engineering practices, asking me when necessary, and can use the interactiveDialog tool to collect information

### 2. Requirements Analysis
Whenever I input a new requirement, to standardize requirement quality and acceptance criteria, you must first clarify the problem and requirements, and then proceed to the next phase

### 3. Requirements Document and Acceptance Criteria Design
First complete the requirements design using the EARS simple requirements syntax method. If you determine that the requirements involve frontend pages, you need to determine the design style and color scheme in advance in the requirements, and must confirm the requirement details with me. After final confirmation, finalize the requirements, then proceed to the next phase, save in `specs/spec_name/requirements.md`, reference format as follows:

```markdown
# Requirements Document

## Introduction

Requirement description

## Requirements

### Requirement 1 - Requirement Name

**User Story:** User story content

#### Acceptance Criteria

1. Use EARS descriptive clauses: While <optional precondition>, when <optional trigger>, the <system name> shall <system response>, for example: When "mute" is selected, the laptop shall suppress all audio output.
2. ...
...
```

### 4. Technical Solution Design
After completing the requirements design, you will design the technical solution for the requirements based on the current technical architecture and the previously confirmed requirements, concisely but accurately describing the technical architecture (such as architecture, technology stack, technology selection, database/interface design, testing strategy, security), and can use mermaid for drawing when necessary, must confirm with me clearly, save in `specs/spec_name/design.md`, and then proceed to the next phase

### 5. Task Breakdown
After completing the technical solution design, you will break down specific tasks to be done based on the requirements document and technical solution, and must confirm with me clearly, save in `specs/spec_name/tasks.md`, and then proceed to the next phase to begin formal task execution, while timely updating task status, executing as independently and autonomously as possible to ensure efficiency and quality

Task reference format as follows:

```markdown
# Implementation Plan

- [ ] 1. Task information
  - Specific things to do
  - ...
  - _Requirement: Related requirement point number
```

## Applicable Scenarios
- New feature development
- Complex architecture design
- Multi-module integration
- Database/UI design
- Projects requiring detailed planning and documentation
```

### no_spec.md

```md
# /no_spec - Skip spec workflow, execute directly

## Command Description
Skip the spec workflow and execute development tasks directly. Suitable for simple fixes, documentation updates, configuration changes, code refactoring, and other scenarios.

## Applicable Scenarios
- Simple fixes
- Documentation updates
- Configuration changes
- Code refactoring
- Rapid iteration
- Simple tasks that don't require detailed planning and documentation

## Work Mode
When using the `/no_spec` command, AI will:
1. Skip the requirements document design phase
2. Skip the technical solution design phase
3. Skip the task breakdown phase
4. Directly start executing specific development tasks
5. Quickly respond and implement based on user requirements

## Notes
- Suitable for relatively simple and clear tasks
- For complex projects, it's recommended to use the `/spec` command
- Still need to follow basic development standards and best practices
```

