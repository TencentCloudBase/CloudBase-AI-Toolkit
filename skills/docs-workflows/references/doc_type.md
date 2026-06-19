# Documentation Type Selector

## Function
Help users identify the correct Diátaxis documentation type for their content

## Trigger Condition
When user inputs `/doc-type`

## Behavior
Guide users through the Diátaxis framework to determine the most appropriate documentation type for their content

## Diátaxis Framework Decision Tree

### Step 1: Identify User State
**Is the user in Learning mode or Working mode?**

**Learning Mode** (Acquiring new skills/knowledge):
- User is new to the topic
- User wants to understand concepts
- User is building foundational knowledge
- User needs guided learning experience

**Working Mode** (Applying existing knowledge):
- User has basic knowledge of the topic
- User needs to complete specific tasks
- User needs to look up information
- User is solving problems

### Step 2: Identify Knowledge Type
**Is the content about Understanding or Doing?**

**Understanding** (Theoretical knowledge):
- Explaining concepts and principles
- Providing context and background
- Describing how things work
- Information lookup and reference

**Doing** (Practical knowledge):
- Step-by-step instructions
- Hands-on learning
- Task completion
- Problem solving

### Step 3: Determine Documentation Type

```
Learning Mode + Doing = TUTORIAL
Learning Mode + Understanding = EXPLANATION
Working Mode + Doing = HOW-TO GUIDE
Working Mode + Understanding = REFERENCE
```

## Documentation Type Characteristics

### Tutorial (Learning + Doing)
- **Purpose**: Skill acquisition through guided learning
- **Tone**: Instructional, supportive, encouraging
- **Structure**: Progressive learning with hands-on practice
- **Use when**: Teaching new skills, onboarding, educational content

### How-to Guide (Working + Doing)
- **Purpose**: Task completion and problem solving
- **Tone**: Practical, direct, solution-focused
- **Structure**: Direct, actionable steps
- **Use when**: Specific tasks, troubleshooting, operational procedures

### Reference (Working + Understanding)
- **Purpose**: Information lookup and verification
- **Tone**: Neutral, factual, authoritative
- **Structure**: Comprehensive, structured data
- **Use when**: API docs, command references, technical specifications

### Explanation (Learning + Understanding)
- **Purpose**: Concept comprehension and context
- **Tone**: Educational, analytical, thought-provoking
- **Structure**: Conceptual explanation and analysis
- **Use when**: Architecture overviews, concept explanations, background context

## Usage Examples

```
/doc-type I want to help users learn React Hooks from scratch
→ TUTORIAL (Learning + Doing)

/doc-type I need to document how to deploy an application
→ HOW-TO GUIDE (Working + Doing)

/doc-type I want to explain what microservices architecture is
→ EXPLANATION (Learning + Understanding)

/doc-type I need to document API endpoint parameters
→ REFERENCE (Working + Understanding)
```

## Quality Checklist
- [ ] Identified correct user state (Learning vs. Working)
- [ ] Identified correct knowledge type (Understanding vs. Doing)
- [ ] Selected appropriate documentation type
- [ ] Applied correct tone and structure
- [ ] Followed Diátaxis framework principles
