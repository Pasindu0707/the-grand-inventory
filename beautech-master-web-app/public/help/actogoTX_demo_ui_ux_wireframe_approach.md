# Treasury Management Demo – UI/UX Wireframe Approach (Consultant Structured)

---

# 1. Objective

Design a **front-end only Treasury Management System demo** using:

- No backend
- Sample JSON
- Clean, decision-focused UI

The goal is to communicate:

- Visibility
- Control
- Risk awareness
- Approval discipline

---

# 2. Functional Foundations (FinTech Perspective)

All UI screens must align with core treasury functions:

1. Cash Visibility
2. Payment Control
3. Approval Workflow
4. Risk & Exceptions Monitoring
5. Cash Forecasting
6. Audit & Traceability

If a screen does not support one of these → exclude it.

---

# 3. Interaction Model (Decision-Oriented UI)

Each screen must answer a clear user question.

### Dashboard

- What is my current cash position?
- What needs attention today?
- What is coming next?

### Payment Queue

- What payments are pending?
- Which are risky?
- What requires approval?

### Approval Screen

- What is this payment?
- Why is it flagged?
- Should I approve or reject?

---

# 4. Layout System (Reusable Patterns)

## 4.1 Summary + Breakdown Layout

Used for: Dashboard, Bank Positions

Structure:

- KPI Cards Row
- Chart / Trend Section
- Detailed Table

---

## 4.2 Table + Detail Layout

Used for: Payment Queue, Transactions

Structure:

- Filter Bar
- Data Table
- Right-side Detail Panel (on click)

---

## 4.3 Master–Detail Workflow Layout

Used for: Approval Screens

Structure:

- Left: Transaction Summary
- Right: Approval Workflow + Actions

---

## 4.4 Alert / Exception Layout

Used for: Risk Monitoring

Structure:

- Alert Summary Cards
- Alert Table
- Detail Panel

---

# 5. Wireframe Strategy

## 5.1 View Scope

- Only **center content panel**
- No top bar
- No sidebar

Purpose:

- Focus attention
- Faster development
- Cleaner demo storytelling

---

## 5.2 Wireframe Style (Visual – Main + Secondary Structure)

Use **clear, boxed wireframes** that show hierarchy:

- **Primary (Main signal)** → what matters first
- **Secondary (Supporting insight)** → why it matters
- **Action (Decision)** → what to do next

---

### A. KPI Cards (Primary + Secondary + Micro)

```
+-------------------------------+
| [🏦] Total Cash               |
| LKR 1.2Bn                     |  ← PRIMARY (big, bold)
| +5.2% ↑   +45M                |  ← SECONDARY (compact)
| ─────── sparkline ───────     |  ← MICRO (trend)
+-------------------------------+
```

Visual rules:

- Primary = 60–70% visual weight
- Secondary = inline, muted color
- Micro = thin, low-contrast

---

### B. Chart Block (Primary + Context + Secondary)

```
+-----------------------------------------------+
| Cash Position Forecast                        |
|                                               |
|        ( Line / Bar Chart Area )              |  ← PRIMARY VISUAL
|                                               |
| ─ ─ Threshold Line ─ ─                        |  ← CONTEXT
|                                               |
| Opening • Closing • Threshold                 |  ← SECONDARY (legend)
+-----------------------------------------------+
```

Visual rules:

- Chart takes \~70% height
- Context lines subtle (dashed)
- Legend minimal, bottom-aligned

---

### C. Table (Primary Data + Secondary Signals)

```
+----------------------------------------------------------------------------------+
| ID | Entity | Amount        | Status     | Risk      | Action                    |
|----------------------------------------------------------------------------------|
| P1 | HO     | 25M           | Pending    | ⚠ High    | View • Approve • Reject   |
|    |        | (↑ +12% vs avg)|            |           |                           |
| P2 | BR1    | 2M            | Pending    | Low       | View • Approve • Reject   |
+----------------------------------------------------------------------------------+
```

Visual rules:

- Primary = row data
- Secondary = subtext under key columns (Amount/Status)
- Use badges for Status, icons for Risk

---

### D. Detail Panel (Context → Insight → Decision)

```
+----------------------------------------------+
| Payment Summary                               |
| Amount: 25M                                   |  ← PRIMARY
| Entity: HO                                    |
|----------------------------------------------|
| ⚠ Risk: High (Threshold exceeded)             |  ← SECONDARY
|----------------------------------------------|
| Approval Flow                                 |
| Maker ✓ → Checker ✓ → Manager ⏳              |
|----------------------------------------------|
| [ Approve ]   [ Reject ]                      |  ← ACTION
+----------------------------------------------+
```

Visual rules:

- Top = WHAT (context)
- Middle = WHY (risk/workflow)
- Bottom = ACTION (buttons)

---

### E. Alerts / Exceptions Block (Scan-first Design)

```
+--------------------------------------------------------------+
| ⚠ High Value Payment | P001 | 25M | Needs Review             |
| ⚠ Low Balance        | HNB  | < Min Threshold               |
| ℹ Pattern Deviation  | BR1  | Unusual timing               |
+--------------------------------------------------------------+
```

Visual rules:

- Icon first → fastest scan
- Short text (1 line)
- Color = severity only

---

### F. Section Composition (Putting it Together – Enhanced Visual Hierarchy)

Show how a full screen should be composed with **Primary → Secondary → Action layering** clearly visible.

```
+--------------------------------------------------------------+
| KPI Row (Primary Snapshot – Generated Cards)                  |
|                                                              |
| +------------------+ +------------------+ +------------------+|
| | [🏦] Total Cash  | | [💳] Outflows    | | [⚠] Alerts       ||
| | LKR 1.2Bn        | | LKR 180M         | | 6 High           ||  ← PRIMARY
| | +5.2% ↑  +45M    | | +12% ↑ vs avg    | | +2 vs yesterday  ||  ← SECONDARY
| | ── sparkline ──  | | ▇▇▇▇▇▇▇          | | (top risks)      ||  ← MICRO
| +------------------+ +------------------+ +------------------+|
|                                                              |
| +------------------+                                         |
| | [⏳] Approvals    |                                         |
| | 12 Pending       |                                         |
| | 3 High ⚠         |                                         |
| |                  |                                         |
| +------------------+                                         |
+--------------------------------------------------------------+

+---------------------------+----------------------------------+
| Chart (Primary Insight)   | Chart (Secondary Insight)        |
| Cash Forecast (Line)      | Cash by Bank (Bar)               |
| ── threshold ──           | Top banks highlighted            |
+---------------------------+----------------------------------+

+--------------------------------------------------------------+
| Alerts (Attention Layer)                                      |
| ⚠ High Value Payment | P001 | 25M | Needs Review             |
| ⚠ Low Balance        | HNB  | < Min Threshold               |
+--------------------------------------------------------------+

+--------------------------------------------------------------+
| Table (Detailed View)                                         |
| ID | Entity | Amount | Status | Risk | Action                |
| P1 | HO     | 25M    | Pending| ⚠    | View • Approve        |
|    |        | (+12%) |        |      |                        |
+--------------------------------------------------------------+
```

### Layer Meaning

- **Top (KPI Row)** → PRIMARY → “What is the situation?”
- **Middle (Charts)** → SECONDARY → “Why / trend?”
- **Below (Alerts)** → ATTENTION → “What needs focus?”
- **Bottom (Table)** → DETAIL → “What exactly / take action”

---

### Visual Priority Rules

1. KPI Row = highest emphasis (large numbers)
2. Primary chart = dominant visual area
3. Secondary chart = supportive comparison
4. Alerts = high contrast, short text
5. Table = dense but structured

---

### Spacing & Alignment

- KPI Row → full width
- Charts → 50 / 50 split
- Alerts → full width strip
- Table → full width (largest block)

Spacing:

- 24px between sections
- 16px inside blocks

---

### Cognitive Flow (Very Important)

User naturally reads:

👉 KPIs → Charts → Alerts → Table

Which maps to:

👉 See → Understand → Focus → Act

---

### General Visual Guidelines

- Align all blocks to same width
- Maintain **24px vertical spacing**
- Limit each block to **max 2–3 secondary elements**
- Use whitespace as separation (not borders only)
- Always preserve **Primary → Secondary → Action hierarchy**

---



---

# 6. Component Design (Detailed Level)

## 6.1 KPI Card (Enhanced – Primary + Secondary Insights)

Purpose: Each KPI card should not only show a number, but enable a **quick decision without drilling down**.

### Structure (Layered Information)

**Primary Layer (Always visible):**

- Label (small text)
- Value (large, bold)
- Primary icon (contextual)

**Secondary Layer (Compact, inline):**

- % change vs previous period (e.g., +5.2%)
- Absolute change (e.g., +LKR 45M)
- Direction indicator (↑ / ↓)
- Small status icon (trend / warning / stable)

**Tertiary Layer (Micro Insight):**

- Mini sparkline (last 7 days / 30 days)
- Context tag (e.g., "vs yesterday", "vs last week")

---

### Example (Treasury KPI)

- Label: Total Cash Position
- Value: LKR 1.2Bn
- Secondary:
  - +5.2% ↑
  - +LKR 45M vs yesterday
- Micro:
  - Sparkline (7-day trend)

---

### Secondary Information Rules (Very Important)

Include secondary info only if it answers: 👉 "Should I act?" or "Is this normal?"

Good secondary metrics:

- Change vs previous period
- Variance vs forecast
- Utilization % (e.g., credit line usage)
- Number of related items (e.g., 12 pending approvals)

Avoid:

- Too many metrics
- Raw data without context

---

### Visual Indicators

| Type     | Indicator |
| -------- | --------- |
| Positive | Green + ↑ |
| Negative | Red + ↓   |
| Neutral  | Grey –    |
| Warning  | Amber ⚠   |

---

### Micro Visualization (Optional but Powerful)

Use small inline graphs inside the card:

- Sparkline (trend)
- Mini bar (distribution)

Guidelines:

- Keep height small (20–30px)
- No axes
- Only trend visualization

---

### Card Layout (Wireframe Style)

[ Icon ]   Total Cash Position LKR 1.2Bn +5.2% ↑   +LKR 45M [ sparkline ]

---

### When to Use Rich KPI Cards

Use enriched KPI cards for:

- Dashboard (mandatory)
- Bank position summary
- Risk summary

Use simple KPI cards for:

- Secondary screens
- Dense layouts

---

## 6.2 Data Table (Payments / Accounts)

Columns:

- ID
- Date
- Entity
- Beneficiary
- Amount
- Bank
- Status
- Risk Flag

Row States:

- Normal
- Highlight (high value)
- Warning (amber)
- Risk (red)
- Completed (grey)

Actions:

- View
- Approve
- Reject

---

## 6.3 Approval Panel

Sections:

1. Payment Summary
2. Risk Indicators
3. Approval Timeline
4. Action Controls

Buttons:

- Approve (Primary)
- Reject (Secondary)
- Request Info (Tertiary)

---

## 6.4 Risk / Exception Card

Fields:

- Risk Type
- Severity Level
- Trigger Reason
- Suggested Action
- Assigned User

---

## 6.5 Transaction Detail View

Sections:

- Summary
- Source Account
- Beneficiary Details
- Approval History
- Notes / Comments
- Attachments (placeholder)

---

# 7. Visual Design System (Minimal & Professional)

## 7.1 Color Usage

| Type     | Color        |
| -------- | ------------ |
| Neutral  | Grey / White |
| Positive | Green        |
| Warning  | Amber        |
| Risk     | Red          |
| Info     | Blue         |

Guideline: Use color only to indicate meaning.

---

## 7.2 Icon System

- Cash → Wallet / Bank
- Bank → Building
- Risk → Alert Triangle
- Approval → Check Circle
- Pending → Clock
- Forecast → Line Chart

---

## 7.3 Spacing System

- Base unit: 8px
- Card padding: 16–20px
- Section gap: 24px
- Table row height: 44–48px

---

## 7.4 Typography

- KPI Value → Large, bold
- Titles → Medium weight
- Labels → Small, muted

---

## 7.5 Responsiveness

- Focus on laptop view
- Stack vertically on smaller screens
- No full responsive complexity needed

---

# 8. UX Principles for Demo

## 8.1 Keep It Focused

Show fewer, stronger components.

## 8.2 Decision-Driven UI

Each screen must guide a decision.

## 8.3 Avoid Accounting Complexity

Avoid:

- Ledger-heavy views
- Debit/credit focus

Prefer:

- Control center
- Operational clarity

---

# 9. Recommended Demo Build Phases

## Phase 1

- Define screens
- Define purpose
- Map layout types

## Phase 2

- Create wireframes (empty blocks)

## Phase 3

- Define components

## Phase 4

- Apply visual system

---

# 10. Final Note (Consultant Positioning)

This demo should feel like:

- Treasury visibility layer
- Payment control center
- Decision support system

Not just a transaction system.

---

# 11. Screen 1 – Executive Dashboard (Full Structured Wireframe)

## 11.1 Purpose

Provide a **single-glance view** of:

- Current cash position
- Today’s activity
- Items needing attention
- Near-term outlook

---

## 11.2 Layout Type

**Summary + Breakdown Layout**

---

## 11.3 Wireframe (Structured)

```
+--------------------------------------------------------------------------------------------------+
| KPI: Total Cash | KPI: Available Balance | KPI: Today Outflows | KPI: Pending Approvals         |
+--------------------------------------------------------------------------------------------------+

+-------------------------------------------+-------------------------------------------+
| Chart: Cash by Bank (Bar)                 | Chart: 7-Day Cash Trend (Line)            |
+-------------------------------------------+-------------------------------------------+

+--------------------------------------------------------------------------------------------------+
| Alerts / Exceptions (Top 5)                                                                  >    |
+--------------------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------------+
| Table: Bank Positions (Top Accounts)                                                           |
+--------------------------------------------------------------------------------------------------+
```

---

## 11.4 KPI Cards (Detailed Specs)

### KPI 1: Total Cash Position

- Value: LKR 1.2Bn
- Secondary:
  - +5.2% ↑ vs yesterday
  - +LKR 45M
- Micro: 7-day sparkline
- Icon: Bank

---

### KPI 2: Available Balance

- Value: LKR 920M
- Secondary:
  - 76% utilization
  - -2% ↓ vs yesterday
- Micro: sparkline
- Icon: Wallet

---

### KPI 3: Today’s Outflows

- Value: LKR 180M
- Secondary:
  - 24 transactions
  - +12% ↑ vs avg
- Micro: mini bar (distribution)
- Icon: Outgoing arrow

---

### KPI 4: Pending Approvals

- Value: 12
- Secondary:
  - 3 high-risk ⚠
  - 5 above threshold
- Micro: none (optional)
- Icon: Clock

---

## 11.5 Charts

### Cash by Bank

- Type: Bar chart
- X-axis: Bank names
- Y-axis: Balance
- Highlight: lowest balance in red

### 7-Day Cash Trend

- Type: Line chart
- Shows opening vs closing trend

---

## 11.6 Alerts / Exceptions Panel

Fields:

- Alert Type
- Severity (color-coded)
- Reference (Payment / Account)
- Short description

Examples:

- High-value payment (> threshold)
- Low balance alert
- Duplicate-like transaction

---

## 11.7 Bank Positions Table

Columns:

- Bank
- Account Number
- Balance
- Available Balance
- Currency
- Status

Highlights:

- Low balance → Red
- Overdraft → Warning

---

## 11.8 UX Behavior

- KPI cards clickable → drill to details
- Alerts clickable → open detail panel
- Table row click → account view

---

## 11.9 Sample JSON (for Frontend Mock)

```
{
  "totalCash": {
    "value": 1200000000,
    "changePct": 5.2,
    "changeValue": 45000000
  },
  "pendingApprovals": {
    "count": 12,
    "highRisk": 3
  },
  "alerts": [
    {"type": "High Value", "severity": "high"},
    {"type": "Low Balance", "severity": "medium"}
  ]
}
```

---

## 11.10 Design Intent

This dashboard should feel like:

- A **command center**
- Not a report
- Not an accounting screen

User should immediately think: 👉 “I know what’s happening and what I need to act on.”

---

# Next Step

Proceed to build: **Screen 2 – Payment Queue (Table + Detail Layout)**



---

# Screen 2 – Payment Queue (Table + Detail + Approval Trigger)

---

# 1. Purpose

This screen represents the **core control layer of treasury**.

It allows users to:
- View all payment requests
- Identify high-risk or urgent payments
- Take action (approve / reject / review)

This is the screen where:
👉 CFO feels control
👉 CISO sees governance
👉 Operations sees workflow clarity

---

# 2. Layout Type

**Table + Detail Layout (with Action Trigger)**

---

# 3. Wireframe (Structured)

```
+------------------------------------------------------------------------------------------------------+
| Filters: Date | Entity | Bank | Status | Risk Level | Search                                          |
+------------------------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------------------------+
| Table: Payment Queue                                                                                |
|------------------------------------------------------------------------------------------------------|
| ID | Date | Entity | Beneficiary | Amount | Bank | Status | Risk | Action                         |
|------------------------------------------------------------------------------------------------------|
| P001 | 25 Mar | HO | ABC Ltd | 25M | HNB | Pending | High ⚠ | View | Approve | Reject          |
| P002 | 25 Mar | Branch 1 | XYZ | 2M | Sampath | Pending | Low | View | Approve | Reject       |
+------------------------------------------------------------------------------------------------------+

                        → On Row Click →

+--------------------------------------------------------------+
| Detail Panel (Right Side Slide-in)                            |
+--------------------------------------------------------------+
| Payment Summary                                               |
| Risk Indicators                                               |
| Approval Workflow                                             |
| Supporting Info                                               |
| Action Buttons                                                |
+--------------------------------------------------------------+
```

---

# 4. Filter Bar (Top Section)

### Fields:
- Date Range Picker
- Entity Dropdown
- Bank Dropdown
- Status (Pending / Approved / Rejected)
- Risk Level (High / Medium / Low)
- Search (ID / Beneficiary)

### UX Notes:
- Keep compact (single row)
- Filters update table instantly
- Show active filters as tags

---

# 5. Payment Table (Core Component)

## Columns
- Payment ID
- Date
- Entity / Branch
- Beneficiary Name
- Amount (formatted, currency-aware)
- Bank
- Status
- Risk Indicator
- Actions

---

## Row States

| State        | Visual Treatment |
|-------------|-----------------|
| Normal      | Default         |
| High Value  | Slight highlight |
| Risk        | Red indicator   |
| Warning     | Amber indicator |
| Completed   | Greyed out      |

---

## Risk Indicators

- High → Red ⚠
- Medium → Amber ⚠
- Low → Grey

Tooltip on hover:
- "Amount exceeds threshold"
- "Unusual beneficiary"

---

## Actions (Inline)

- View (always visible)
- Approve (if permission)
- Reject (if permission)

Design:
- Icons + labels
- Approve → Green
- Reject → Red

---

# 6. Detail Panel (Right Slide-In)

This is where the **decision happens**.

---

## 6.1 Payment Summary

Fields:
- Payment ID
- Amount
- Currency
- Entity
- Bank Account
- Beneficiary
- Payment Type
- Requested Date

---

## 6.2 Risk Indicators

Show list of triggered rules:
- High amount threshold exceeded
- New beneficiary
- Outside normal pattern

Each item:
- Severity icon
- Short explanation

---

## 6.3 Approval Workflow

Display timeline:

Maker → Checker → Manager → CFO

For each step:
- User
- Status (Approved / Pending)
- Timestamp

Visual:
- Horizontal or vertical timeline

---

## 6.4 Supporting Information

- Notes / comments
- Attachments (placeholder)
- Reference documents

---

## 6.5 Action Section (Critical)

Buttons:
- Approve (Primary, green)
- Reject (Secondary, red)
- Request Info (optional)

Optional:
- Comment input before action

---

# 7. UX Behavior

- Clicking row → opens detail panel
- Approve → updates status instantly
- Reject → requires reason (modal)
- Risk items clickable → show explanation

---

# 8. Sample JSON (Frontend Mock)

```
{
  "payments": [
    {
      "id": "P001",
      "amount": 25000000,
      "entity": "HO",
      "beneficiary": "ABC Ltd",
      "bank": "HNB",
      "status": "Pending",
      "risk": "High"
    }
  ]
}
```

---

# 9. Design Intent

This screen should feel like:
- A **control gate for money leaving the organization**

User mindset:
👉 “Nothing goes out without visibility and approval.”

---

# Next Step

Proceed to build:
**Screen 3 – Approval Workflow Deep View (Dedicated Screen)**



---

# Screen 3 – Approval Workflow Deep View (High-Control Decision Screen)

---

# 1. Purpose

This screen is designed to:
- Show **full transparency of approval flow**
- Enforce **governance and control**
- Provide **confidence to CFO and CISO**

This is where the system demonstrates:
👉 No payment moves without structured approval
👉 Every action is traceable
👉 Risk is clearly visible before approval

---

# 2. Layout Type

**Master–Detail Workflow Layout (Decision-Centric)**

---

# 3. Wireframe (Structured)

```
+--------------------------------------------------------------------------------------+
| Header: Payment ID | Amount | Status | Risk Level                                    |
+--------------------------------------------------------------------------------------+

+--------------------------------------+-----------------------------------------------+
| LEFT PANEL                           | RIGHT PANEL                                   |
| (Transaction Context)                | (Approval & Decision)                         |
|--------------------------------------|-----------------------------------------------|
| Payment Summary                      | Approval Workflow Timeline                    |
| Beneficiary Details                  |                                               |
| Bank & Account Info                  | Action Section (Approve / Reject)             |
| Supporting Info                      |                                               |
+--------------------------------------+-----------------------------------------------+

+--------------------------------------------------------------------------------------+
| Audit Trail (Full Width Section)                                                    |
+--------------------------------------------------------------------------------------+
```

---

# 4. Header Section (Sticky)

Fields:
- Payment ID
- Amount (highlighted, large)
- Currency
- Status (Pending / Approved / Rejected)
- Risk Level (color-coded)

Visual:
- Clean horizontal strip
- Risk badge (red / amber / grey)

---

# 5. LEFT PANEL – Transaction Context

## 5.1 Payment Summary

Fields:
- Entity / Branch
- Payment Type
- Requested Date
- Requested By

---

## 5.2 Beneficiary Details

Fields:
- Name
- Account Number
- Bank
- Country

Highlight:
- New / first-time beneficiary → show warning

---

## 5.3 Bank & Source Account

Fields:
- Source Account
- Available Balance
- Post-transaction balance

Highlight:
- If insufficient → show alert

---

## 5.4 Supporting Information

- Notes / Comments
- Attachments (placeholder)
- Reference IDs

---

# 6. RIGHT PANEL – Approval & Decision (Core)

## 6.1 Approval Workflow Timeline

Structure:

Maker → Checker → Manager → CFO

Each step includes:
- Role
- User name
- Status (Approved / Pending / Rejected)
- Timestamp

Visual:
- Vertical timeline with connectors
- Completed → Green
- Current → Highlighted
- Pending → Grey

---

## 6.2 Risk Summary Panel

Show all triggered rules:

Examples:
- High amount threshold exceeded
- Unusual transaction pattern
- New beneficiary

Each item:
- Icon
- Severity
- Short explanation

---

## 6.3 Decision Section (Critical)

Buttons:
- Approve (Primary, green)
- Reject (Secondary, red)
- Request Info (optional)

Additional:
- Comment input box

Rules:
- Reject requires reason
- Approve logs user + timestamp

---

# 7. Audit Trail (Full Width Section)

## Fields:
- Timestamp
- User
- Action
- Module
- Change details

Examples:
- Payment created
- Amount modified
- Approved by Manager
- Rejected by CFO

---

# 8. UX Behavior

- Timeline updates dynamically
- Clicking audit item shows details
- Risk items expandable
- Approval triggers confirmation

---

# 9. Sample JSON (Frontend Mock)

```
{
  "payment": {
    "id": "P001",
    "amount": 25000000,
    "status": "Pending",
    "risk": "High"
  },
  "approvals": [
    {"role": "Maker", "status": "Approved"},
    {"role": "Checker", "status": "Approved"},
    {"role": "Manager", "status": "Pending"}
  ]
}
```

---

# 10. Design Intent

This screen should feel like:
- A **secure approval gateway**
- A **traceable decision system**

User mindset:
👉 “I have full context, I can confidently approve or reject.”

---

# Why This Impresses CFO / CISO

- Clear approval hierarchy
- Full audit visibility
- Risk-aware decisions
- Strong governance representation

---

# Next Step

Proceed to build:
**Screen 4 – Risk & Exceptions Monitoring**



---

# Screen 4 – Risk & Exceptions Monitoring (Intelligence & Control Layer)

---

# 1. Purpose

This screen represents the **intelligence layer of treasury**.

It is designed to:
- Detect unusual or risky activities
- Highlight what needs attention
- Assist decision-making using rule-based + future AI insights

This is where the system communicates:
👉 “We don’t just process payments — we understand them.”

---

# 2. Layout Type

**Alert / Exception Layout (Insight + Action)**

---

# 3. Wireframe (Structured)

```
+------------------------------------------------------------------------------------------------------+
| KPI: Total Alerts | KPI: High Risk | KPI: Medium Risk | KPI: Resolved Today                           |
+------------------------------------------------------------------------------------------------------+

+-------------------------------------------+-------------------------------------------+
| Chart: Alerts by Type                     | Chart: Alerts Trend (7 Days)              |
+-------------------------------------------+-------------------------------------------+

+------------------------------------------------------------------------------------------------------+
| Table: Risk & Exceptions                                                                        |
|------------------------------------------------------------------------------------------------------|
| ID | Type | Entity | Reference | Severity | Status | Detected At | Action                      |
|------------------------------------------------------------------------------------------------------|
| R001 | High Value | HO | P001 | High ⚠ | Open | 25 Mar | View | Resolve | Escalate          |
| R002 | Duplicate | Branch 1 | P002 | Medium ⚠ | Open | 25 Mar | View | Resolve         |
+------------------------------------------------------------------------------------------------------+

                      → On Row Click →

+--------------------------------------------------------------+
| Detail Panel (Right Side Slide-in)                            |
+--------------------------------------------------------------+
| Alert Summary                                                 |
| Trigger Logic / AI Insight                                    |
| Related Transactions                                          |
| Suggested Actions                                             |
| Action Buttons                                                |
+--------------------------------------------------------------+
```

---

# 4. KPI Cards (Risk Overview)

### KPI 1: Total Alerts
- Value: 48
- Secondary:
  - +12% ↑ vs yesterday

---

### KPI 2: High Risk Alerts
- Value: 6
- Secondary:
  - 2 require immediate attention ⚠

---

### KPI 3: Medium Risk Alerts
- Value: 18

---

### KPI 4: Resolved Today
- Value: 22
- Secondary:
  - +5 vs yesterday

---

# 5. Charts

## 5.1 Alerts by Type

Types:
- High Value
- Duplicate
- New Beneficiary
- Pattern Deviation

---

## 5.2 Alerts Trend

- Shows number of alerts over time
- Helps identify increasing risk patterns

---

# 6. Risk & Exceptions Table

## Columns
- Alert ID
- Type
- Entity
- Reference (Payment ID / Account)
- Severity
- Status (Open / Resolved / Escalated)
- Detected Time
- Actions

---

## Severity Indicators

| Level  | Color |
|--------|------|
| High   | Red ⚠ |
| Medium | Amber ⚠ |
| Low    | Grey |

---

## Actions

- View
- Resolve
- Escalate

---

# 7. Detail Panel (Intelligence View)

## 7.1 Alert Summary

Fields:
- Alert Type
- Severity
- Reference ID
- Description

---

## 7.2 Trigger Logic / AI Insight

Explain WHY alert triggered:

Examples:
- "Payment amount exceeds historical average by 220%"
- "Beneficiary not seen in last 12 months"
- "Similar transaction detected within 5 minutes"

---

## 7.3 Related Transactions

Show:
- Similar past transactions
- Linked payments

---

## 7.4 Suggested Actions

Examples:
- Verify beneficiary
- Review approval chain
- Check supporting documents

---

## 7.5 Action Section

Buttons:
- Mark as Reviewed
- Resolve
- Escalate to Manager

---

# 8. UX Behavior

- Alerts auto-highlight high severity
- Clicking alert → opens detail panel
- Resolve → updates status instantly
- Escalate → assigns to next role

---

# 9. Sample JSON (Frontend Mock)

```
{
  "alerts": [
    {
      "id": "R001",
      "type": "High Value",
      "severity": "High",
      "reference": "P001",
      "status": "Open"
    }
  ]
}
```

---

# 10. Design Intent

This screen should feel like:
- A **smart monitoring system**
- Not just rule-based alerts

User mindset:
👉 “The system is helping me identify risks I might miss.”

---

# AI Positioning (Important for Demo)

Even if using simple rules now, position as:
- Pattern detection
- Behavioral analysis
- Future AI-driven risk scoring

---

# Next Step

Proceed to build:
**Screen 5 – Cash Forecast & Liquidity Planning**



---

# Screen 5 – Cash Forecast & Liquidity Planning (CFO Decision Screen)

---

# 1. Purpose

This screen represents the **forward-looking intelligence of treasury**.

It enables CFO to:
- Understand future cash position
- Anticipate shortages or surpluses
- Make funding or investment decisions

This is where the system communicates:
👉 “You are not reacting — you are planning ahead.”

---

# 2. Layout Type

**Forecast + Scenario Layout (Insight + Planning)**

---

# 3. Wireframe (Structured)

```
+------------------------------------------------------------------------------------------------------+
| KPI: Opening Balance | KPI: Projected Inflows | KPI: Projected Outflows | KPI: Closing Balance        |
+------------------------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------------------------+
| Chart: Cash Position Forecast (7 / 30 Days Line Chart)                                               |
+------------------------------------------------------------------------------------------------------+

+-------------------------------------------+-------------------------------------------+
| Inflows Breakdown                         | Outflows Breakdown                        |
| (Table / Mini Chart)                      | (Table / Mini Chart)                      |
+-------------------------------------------+-------------------------------------------+

+------------------------------------------------------------------------------------------------------+
| Table: Daily Cash Forecast                                                                    |
|------------------------------------------------------------------------------------------------------|
| Date | Opening | Inflows | Outflows | Net Movement | Closing | Risk Indicator                   |
+------------------------------------------------------------------------------------------------------+
```

---

# 4. KPI Cards (Forecast Overview)

### KPI 1: Opening Balance
- Value: LKR 1.2Bn
- Context: Today’s starting position

---

### KPI 2: Projected Inflows
- Value: LKR 350M
- Secondary:
  - +10% ↑ vs last week

---

### KPI 3: Projected Outflows
- Value: LKR 420M
- Secondary:
  - +18% ↑ vs last week

---

### KPI 4: Closing Balance (Critical KPI)
- Value: LKR 1.13Bn
- Secondary:
  - -6% ↓ trend
  - Highlight if below threshold ⚠

---

# 5. Forecast Chart (Core Visual)

## Cash Position Forecast

- Type: Line chart
- X-axis: Date (next 7 / 30 days)
- Y-axis: Cash balance

Show:
- Opening balance line
- Closing balance line
- Threshold line (minimum liquidity)

Highlight:
- If forecast dips below threshold → Red zone

---

# 6. Inflows & Outflows Breakdown

## Inflows

Sources:
- Customer collections
- Loan repayments
- Transfers in

Fields:
- Source
- Amount
- Expected date

---

## Outflows

Sources:
- Payments
- Loan disbursements
- Operational expenses

Fields:
- Type
- Amount
- Due date

---

# 7. Daily Forecast Table

## Columns
- Date
- Opening Balance
- Expected Inflows
- Expected Outflows
- Net Movement
- Closing Balance
- Risk Indicator

---

## Risk Indicators

| Condition                | Indicator |
|------------------------|----------|
| Healthy                | Green |
| Low balance threshold  | Amber ⚠ |
| Negative balance       | Red ⚠ |

---

# 8. Scenario Simulation (Optional but Powerful)

Add simple controls:

- Adjust inflow timing
- Delay outflows
- Add hypothetical transaction

Effect:
👉 Chart updates dynamically

---

# 9. UX Behavior

- Hover on chart → show daily values
- Click a day → highlight row in table
- Risk indicators clickable → explanation

---

# 10. Sample JSON (Frontend Mock)

```
{
  "forecast": [
    {
      "date": "2026-03-27",
      "opening": 1200000000,
      "inflows": 50000000,
      "outflows": 70000000,
      "closing": 1180000000
    }
  ]
}
```

---

# 11. Design Intent

This screen should feel like:
- A **financial radar system**
- Not just reporting

User mindset:
👉 “I can see problems before they happen.”

---

# Why This Impresses CFO

- Forward visibility
- Decision support
- Liquidity planning
- Strategic insight

---

# Next Step

Proceed to build:
**Screen 6 – Bank Connectivity & Reconciliation View**




---

# Screen 6 – Bank Connectivity & Reconciliation View (Operational Trust Layer)

---

# 1. Purpose

This screen represents the **operational backbone of treasury visibility**.

It is designed to:
- Show connectivity across banks and accounts
- Track status of incoming bank data
- Support reconciliation between bank activity and internal treasury records
- Build confidence that balances and payment statuses are based on real operational feeds

This is where the system communicates:
👉 “Treasury visibility is connected to actual bank movement, not just internal entries.”

---

# 2. Layout Type

**Status + Reconciliation Layout (Monitoring + Resolution)**

---

# 3. Wireframe (Structured)

```
+------------------------------------------------------------------------------------------------------+
| KPI: Connected Banks | KPI: Active Accounts | KPI: Unreconciled Items | KPI: Last Sync Status        |
+------------------------------------------------------------------------------------------------------+

+-------------------------------------------+-------------------------------------------+
| Bank Connectivity Status                  | Reconciliation Match Rate                 |
| (Status Cards / Table)                    | (Gauge / Trend / KPI Block)               |
+-------------------------------------------+-------------------------------------------+

+------------------------------------------------------------------------------------------------------+
| Table: Reconciliation Queue                                                                       |
|------------------------------------------------------------------------------------------------------|
| Ref ID | Date | Bank | Account | Direction | Amount | Match Status | Exception | Action          |
|------------------------------------------------------------------------------------------------------|
| B001   | 25 Mar | HNB | 1234 | Outflow | 25M | Matched | - | View                                  |
| B002   | 25 Mar | Sampath | 8891 | Inflow | 2M | Unmatched | Amount Diff ⚠ | Review      |
+------------------------------------------------------------------------------------------------------+

                       → On Row Click →

+--------------------------------------------------------------+
| Detail Panel (Right Side Slide-in)                            |
+--------------------------------------------------------------+
| Bank Transaction Summary                                      |
| Internal Record Match                                         |
| Difference Analysis                                           |
| Reconciliation History                                        |
| Resolve Actions                                               |
+--------------------------------------------------------------+
```

---

# 4. KPI Cards (Connectivity + Reconciliation Overview)

### KPI 1: Connected Banks
- Value: 6
- Secondary:
  - 6 live connections
  - 0 offline
- Icon: Building / Network

---

### KPI 2: Active Accounts
- Value: 18
- Secondary:
  - 3 multi-currency
  - 2 high-volume accounts
- Icon: Wallet / Bank Account

---

### KPI 3: Unreconciled Items
- Value: 14
- Secondary:
  - 4 high-priority ⚠
  - -3 vs yesterday
- Icon: Alert Triangle

---

### KPI 4: Last Sync Status
- Value: 09:42 AM
- Secondary:
  - Last successful sync: 2 mins ago
  - 1 delayed feed
- Icon: Refresh / Link

---

# 5. Bank Connectivity Status Section

## Purpose
Provide quick trust indicators for bank integrations.

## Display
For each bank:
- Bank name
- Connection status (Connected / Delayed / Offline)
- Last sync time
- Number of linked accounts
- Feed type / channel label (optional)

## Visual Rules
- Connected → Green
- Delayed → Amber
- Offline → Red

## Suggested Layout
Compact status cards or a short status table.

---

# 6. Reconciliation Match Rate Section

## Purpose
Show how clean the matching process is today.

## Display Options
- Match rate percentage (e.g. 96.8%)
- Mini trend vs yesterday
- Count of matched vs unmatched vs partial match

## Recommended Secondary Metrics
- Auto-matched count
- Manual review pending
- Resolved today

---

# 7. Reconciliation Queue (Core Table)

## Columns
- Reference ID
- Transaction Date
- Bank
- Account
- Direction (Inflow / Outflow)
- Amount
- Match Status
- Exception Type
- Action

---

## Match Status Values
- Matched
- Partial Match
- Unmatched
- Pending Review

## Exception Types
- Amount Difference
- Missing Internal Entry
- Missing Bank Entry
- Duplicate Entry
- Date Mismatch
- Reference Mismatch

---

## Row Highlight Rules
- Matched → neutral / low emphasis
- Partial Match → amber
- Unmatched → red
- Pending Review → blue / neutral emphasis

---

# 8. Detail Panel (Resolution View)

## 8.1 Bank Transaction Summary
Fields:
- Bank reference number
- Value date
- Narration / description
- Direction
- Amount
- Currency

---

## 8.2 Internal Record Match
Fields:
- Linked payment / receipt ID
- Internal amount
- Internal date
- Internal status

---

## 8.3 Difference Analysis
Show side-by-side comparison:
- Bank amount vs internal amount
- Bank date vs internal date
- Reference text comparison

Highlight exact mismatch reason.

---

## 8.4 Reconciliation History
Show:
- Previous review attempts
- User comments
- Resolution timestamps

---

## 8.5 Resolve Actions
Buttons:
- Mark as Matched
- Assign for Review
- Create Exception Case
- Ignore (restricted / admin only)

Optional:
- Comment input
- Attach evidence placeholder

---

# 9. UX Behavior

- Clicking a reconciliation row opens detail panel
- Exception badge hover shows reason
- Status filters refine queue instantly
- Resolved items move out of default queue
- Connectivity cards can expand into linked account list

---

# 10. Sample JSON (Frontend Mock)

```
{
  "connectivity": [
    {
      "bank": "HNB",
      "status": "Connected",
      "lastSync": "2026-03-26T09:42:00",
      "accounts": 4
    },
    {
      "bank": "Sampath",
      "status": "Delayed",
      "lastSync": "2026-03-26T09:18:00",
      "accounts": 3
    }
  ],
  "reconciliationQueue": [
    {
      "refId": "B002",
      "date": "2026-03-25",
      "bank": "Sampath",
      "account": "8891",
      "direction": "Inflow",
      "amount": 2000000,
      "matchStatus": "Unmatched",
      "exception": "Amount Difference"
    }
  ]
}
```

---

# 11. Design Intent

This screen should feel like:
- A **live operational control panel**
- A **trust layer between treasury and bank reality**

User mindset:
👉 “I can see which bank feeds are healthy, and I can resolve mismatches before they become reporting or payment issues.”

---

# Why This Matters in the Demo

- Connects treasury UI to real-world bank operations
- Shows maturity beyond simple approval screens
- Strengthens confidence in data reliability
- Gives a practical bridge to reconciliation and audit readiness

---

# Next Step

Proceed to build:
**Screen 7 – Audit Trail & Activity Log**

---

# Screen 7 – Audit Trail & Activity Log (Governance & Compliance Layer)

---

# 1. Purpose

This screen represents the **final trust layer of the system**.

It is designed to:
- Provide full traceability of all actions
- Support audit, compliance, and investigation
- Ensure accountability across users and roles

This is where the system communicates:
👉 “Nothing happens in the system without a trace.”

---

# 2. Layout Type

**Timeline + Table Layout (Traceability + Investigation)**

---

# 3. Wireframe (Structured)

```
+------------------------------------------------------------------------------------------------------+
| KPI: Total Activities | KPI: Critical Actions | KPI: Failed Actions | KPI: Active Users            |
+------------------------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------------------------+
| Filters: Date | User | Module | Action Type | Status | Search                                       |
+------------------------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------------------------+
| Table: Activity Log                                                                               |
|------------------------------------------------------------------------------------------------------|
| Timestamp | User | Role | Module | Action | Reference | Status | Risk | Details                 |
|------------------------------------------------------------------------------------------------------|
| 10:12 AM | John | Manager | Payments | Approved | P001 | Success | - | View                     |
| 10:08 AM | Sara | Analyst | Payments | Created | P002 | Success | - | View                     |
| 09:55 AM | Admin | System | Bank Sync | Failed | HNB | Failed ⚠ | High | View                |
+------------------------------------------------------------------------------------------------------+

                        → On Row Click →

+--------------------------------------------------------------+
| Detail Panel (Right Side Slide-in)                            |
+--------------------------------------------------------------+
| Activity Summary                                              |
| Before / After Values                                         |
| Related Entities                                              |
| User Context                                                  |
| System Metadata                                               |
+--------------------------------------------------------------+
```

---

# 4. KPI Cards (Audit Overview)

### KPI 1: Total Activities
- Value: 1,248
- Secondary:
  - +8% ↑ vs yesterday

---

### KPI 2: Critical Actions
- Value: 42
- Secondary:
  - Includes approvals, rejections, overrides

---

### KPI 3: Failed Actions
- Value: 6
- Secondary:
  - 2 require investigation ⚠

---

### KPI 4: Active Users
- Value: 18
- Secondary:
  - 3 high-activity users

---

# 5. Filter Bar

## Fields
- Date range
- User
- Role
- Module (Payments, Treasury, Bank Sync, etc.)
- Action Type (Create, Approve, Reject, Update, Delete)
- Status (Success / Failed)
- Search (Reference ID / User / Action)

## UX Notes
- Multi-select filters
- Active filters shown as tags
- Quick reset option

---

# 6. Activity Log Table (Core Component)

## Columns
- Timestamp
- User Name
- Role
- Module
- Action
- Reference ID
- Status
- Risk Indicator
- Details (action button)

---

## Action Types
- Created
- Modified
- Approved
- Rejected
- Deleted
- System Triggered

---

## Status Indicators

| Status  | Color |
|--------|------|
| Success | Green |
| Failed  | Red ⚠ |
| Warning | Amber ⚠ |

---

## Risk Indicators

Highlight high-risk actions such as:
- Manual overrides
- Failed approvals
- Unauthorized attempts

---

# 7. Detail Panel (Investigation View)

## 7.1 Activity Summary

Fields:
- Action type
- User
- Role
- Timestamp
- Module
- Reference ID

---

## 7.2 Before / After Values (Critical)

Show what changed:

Example:
- Amount: 20M → 25M
- Status: Pending → Approved

---

## 7.3 Related Entities

- Linked payment ID
- Bank account
- Workflow step

---

## 7.4 User Context

- User ID
- Role
- Department
- Session info (optional)

---

## 7.5 System Metadata

- IP address (optional)
- System timestamp
- Source (Web / API / Integration)

---

# 8. UX Behavior

- Clicking row opens detail panel
- Expand/collapse long logs
- Highlight critical actions automatically
- Failed actions pinned to top (optional)

---

# 9. Sample JSON (Frontend Mock)

```
{
  "activities": [
    {
      "timestamp": "2026-03-26T10:12:00",
      "user": "John",
      "role": "Manager",
      "module": "Payments",
      "action": "Approved",
      "reference": "P001",
      "status": "Success"
    }
  ]
}
```

---

# 10. Design Intent

This screen should feel like:
- A **complete audit backbone**
- A **compliance-ready system**

User mindset:
👉 “I can trace any action, anytime, with full context.”

---

# Why This Impresses CFO / CISO

- Full traceability
- Accountability across roles
- Supports audits and investigations
- Strengthens compliance posture

---

# Final System Story (All Screens Together)

1. Dashboard → Visibility
2. Payment Queue → Control
3. Approval Workflow → Governance
4. Risk Monitoring → Intelligence
5. Forecast → Planning
6. Bank Connectivity → Operational Trust
7. Audit Trail → Compliance & Traceability

👉 Complete Treasury Story Delivered




---