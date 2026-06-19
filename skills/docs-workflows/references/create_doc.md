# Create Documentation

## Function
Create comprehensive documentation following Diátaxis framework and OpenAgentKit standards

## Trigger Condition
When user inputs `/create-doc`

## Behavior
Guide users through creating documentation that follows both Diátaxis framework principles and OpenAgentKit documentation standards

## Process Flow

### Step 1: Documentation Type Selection
Use `/doc-type` to determine the correct documentation type:
- Tutorial (Learning + Doing)
- How-to Guide (Working + Doing)  
- Reference (Working + Understanding)
- Explanation (Learning + Understanding)

### Step 2: Content Planning
- [ ] Create mind map of reader goals and use cases
- [ ] Define target audience and their knowledge level
- [ ] Plan information architecture and navigation
- [ ] Identify key concepts and examples needed

### Step 3: Structure Creation
Based on documentation type, use appropriate template:
- `/tutorial` for learning-oriented content
- `/howto` for task-oriented content
- `/reference` for information-oriented content
- `/explanation` for understanding-oriented content

### Step 4: Content Writing
Apply Diátaxis writing principles:
- [ ] "Face-to-face" principle - write conversationally
- [ ] Zero knowledge assumption - define all terms
- [ ] Pyramid principle - most important first
- [ ] Hemingway clarity - short, active sentences
- [ ] Include multimedia elements - diagrams, code examples

### Step 5: Frontmatter Configuration
Ensure proper MDX frontmatter:
```yaml
---
title: "[Page Title]"
description: "[Brief description for SEO]"
---
```

### Step 6: Quality Review (MANDATORY)
- [ ] **Existence Verification**: Verify every function, package, and API endpoint exists in codebase
- [ ] **No Fabricated Content**: Ensure no fake CLI commands, non-existent configs, or made-up features
- [ ] **Preview Marking**: All incomplete features must be marked with "*Coming soon*" or "*In development*"
- [ ] **Code Validation**: Test all code examples are runnable and accurate
- [ ] **Reality Check**: Question if features seem too advanced for project maturity
- [ ] **Diátaxis Compliance**: Verify content type and structure appropriateness
- [ ] **Cross-Reference Validation**: Test all internal and external links

## Integration with OpenAgentKit Standards

### Required Elements
- **Title**: Clear, descriptive title in frontmatter
- **Structure**: Follow Diátaxis framework for content organization
- **Language**: English for all technical content
- **Examples**: Include practical, runnable code samples
- **Accuracy**: All code examples must be verified against actual codebase
- **Honesty**: No fabricated functionality - use "*Coming soon*" for incomplete features

### Optional Enhancements
- **Interactive elements**: Use MDX components when appropriate
- **Multiple language examples**: JavaScript, TypeScript, Python
- **Error handling**: Include error handling in code examples
- **Cross-references**: Link to related documentation

## Usage Examples

```
/create-doc I need to create documentation for our new API authentication system
→ Guide through type selection, structure, and content creation

/create-doc Help me document the agent configuration process
→ Determine if it's tutorial (learning) or how-to (working) based on user needs
```

## Success Criteria (MANDATORY)
- [ ] **Zero Fabricated Content**: No fake CLI commands, non-existent packages, or made-up features
- [ ] **All Code Verified**: Every code example tested against actual codebase
- [ ] **Preview Marking**: All incomplete features clearly marked as "*Coming soon*"
- [ ] **Diátaxis Compliance**: Follows framework principles for content type
- [ ] **OpenAgentKit Standards**: Meets all documentation requirements
- [ ] **User Needs Addressed**: Content effectively serves target audience
- [ ] **Consistent Quality**: Maintains professional tone and structure
