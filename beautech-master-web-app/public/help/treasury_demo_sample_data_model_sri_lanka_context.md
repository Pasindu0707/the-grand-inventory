# Treasury Demo – Sample Data Model (Sri Lanka Context)

---

# 1. Purpose

Provide **meaningful, realistic sample data (JSON)** for all screens (1–7), using:
- Sri Lankan banks
- Gold-backed finance / lending company context (similar to AFS)

Also includes:
- What each KPI means
- How values are derived (for tooltip / UI clarity)

---

# 2. Assumptions (Domain Simplified)

Company Type:
- Gold-backed lending / finance company

Cash Sources:
- Loan repayments
- Customer settlements

Outflows:
- Loan disbursements
- Operational expenses

Banks (Sri Lanka Example):
- HNB (Hatton National Bank)
- Sampath Bank
- Commercial Bank
- BOC
- NDB

---

# 3. Screen 1 – Dashboard Data

## 3.1 KPI Cards

### Total Cash Position

Meaning:
👉 Total balance across all bank accounts (real-time or last sync)

Calculation:
👉 Sum of all bank account balances

```
{
  "totalCash": {
    "value": 1285000000,
    "currency": "LKR",
    "changePct": 4.8,
    "changeValue": 59000000,
    "trend": [1200, 1210, 1225, 1240, 1255, 1270, 1285],
    "tooltip": "Sum of balances across all connected bank accounts (HNB, Sampath, Commercial, BOC, NDB). Updated every 5 mins."
  }
}
```

---

### Available Balance

Meaning:
👉 Usable cash after holds / pending payments

Calculation:
👉 Total Cash – blocked / reserved funds

```
{
  "availableBalance": {
    "value": 940000000,
    "utilizationPct": 73,
    "changePct": -2.1,
    "trend": [900, 910, 920, 915, 930, 945, 940],
    "tooltip": "Available for new payments after accounting for pending approvals and reserved funds."
  }
}
```

---

### Today’s Outflows

Meaning:
👉 Total payments initiated today

```
{
  "outflowsToday": {
    "value": 210000000,
    "transactionCount": 38,
    "changePct": 14.2,
    "distribution": [40, 60, 30, 80],
    "tooltip": "Includes loan disbursements and operational payments processed today."
  }
}
```

---

### Pending Approvals

Meaning:
👉 Payments awaiting approval in workflow

```
{
  "pendingApprovals": {
    "count": 16,
    "highRisk": 5,
    "aboveThreshold": 7,
    "tooltip": "Payments waiting for approval based on defined approval hierarchy (Maker → Checker → Manager → CFO)."
  }
}
```

---

## 3.2 Bank Positions Table

```
{
  "bankPositions": [
    {"bank": "HNB", "account": "001234", "balance": 420000000, "available": 390000000},
    {"bank": "Sampath", "account": "889122", "balance": 310000000, "available": 300000000},
    {"bank": "Commercial", "account": "552211", "balance": 280000000, "available": 250000000},
    {"bank": "BOC", "account": "778899", "balance": 150000000, "available": 140000000},
    {"bank": "NDB", "account": "991122", "balance": 125000000, "available": 110000000}
  ]
}
```

---

# 4. Screen 2 – Payment Queue

```
{
  "payments": [
    {
      "id": "P1001",
      "entity": "Head Office",
      "beneficiary": "Gold Loan Customer A",
      "amount": 25000000,
      "bank": "HNB",
      "status": "Pending",
      "risk": "High",
      "reason": "Above approval threshold"
    },
    {
      "id": "P1002",
      "entity": "Branch Colombo",
      "beneficiary": "Supplier XYZ",
      "amount": 2000000,
      "bank": "Sampath",
      "status": "Pending",
      "risk": "Low"
    }
  ]
}
```

---

# 5. Screen 3 – Approval Workflow

```
{
  "approvalFlow": {
    "paymentId": "P1001",
    "steps": [
      {"role": "Maker", "user": "Kamal", "status": "Approved"},
      {"role": "Checker", "user": "Nimali", "status": "Approved"},
      {"role": "Manager", "user": "Perera", "status": "Pending"},
      {"role": "CFO", "user": "Fernando", "status": "Pending"}
    ]
  }
}
```

---

# 6. Screen 4 – Risk Monitoring

```
{
  "alerts": [
    {
      "id": "R001",
      "type": "High Value",
      "severity": "High",
      "reference": "P1001",
      "insight": "Amount 220% higher than average"
    },
    {
      "id": "R002",
      "type": "New Beneficiary",
      "severity": "Medium",
      "reference": "P1002"
    }
  ]
}
```

---

# 7. Screen 5 – Forecast

```
{
  "forecast": [
    {"date": "2026-03-27", "opening": 1285000000, "inflows": 60000000, "outflows": 90000000, "closing": 1255000000},
    {"date": "2026-03-28", "opening": 1255000000, "inflows": 50000000, "outflows": 70000000, "closing": 1235000000}
  ]
}
```

---

# 8. Screen 6 – Connectivity & Reconciliation

```
{
  "connectivity": [
    {"bank": "HNB", "status": "Connected", "lastSync": "09:42"},
    {"bank": "Sampath", "status": "Delayed", "lastSync": "09:20"}
  ],
  "reconciliation": [
    {
      "ref": "B1001",
      "bank": "HNB",
      "amount": 25000000,
      "status": "Matched"
    },
    {
      "ref": "B1002",
      "bank": "Sampath",
      "amount": 2000000,
      "status": "Unmatched",
      "issue": "Amount mismatch"
    }
  ]
}
```

---

# 9. Screen 7 – Audit Trail

```
{
  "auditLogs": [
    {
      "timestamp": "2026-03-26T10:12:00",
      "user": "Kamal",
      "action": "Created Payment",
      "reference": "P1001"
    },
    {
      "timestamp": "2026-03-26T10:20:00",
      "user": "Nimali",
      "action": "Approved",
      "reference": "P1001"
    }
  ]
}
```

---

# 10. Key UX Insight

You were right to question:
👉 “What does this number actually mean?”

Solution:
- Every KPI MUST have tooltip
- Every number MUST have context (comparison / source)

---

# Next Step

We can now:
👉 Convert this into **frontend-ready mock APIs or React state models**
👉 Or refine per screen with more realistic edge cases

