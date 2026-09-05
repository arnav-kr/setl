<p align="center">
  <img src="./logo.svg" alt="SETL Logo" width="180" />
</p>

<p align="center">
  <strong>Automated 3-Way Financial Reconciliation & AI-Powered Exception Auditing</strong>
</p>

<p align="center">
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 18" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-8.2-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://blade.razorpay.com/"><img src="https://img.shields.io/badge/Razorpay_Blade-12.121-02042B?style=flat-square&logo=razorpay&logoColor=3395FF" alt="Razorpay Blade" /></a>
  <a href="https://ai.google.dev/"><img src="https://img.shields.io/badge/Gemini_AI-3.6_Flash-8E75B2?style=flat-square&logo=google&logoColor=white" alt="Gemini AI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License" /></a>
</p>

---

## Overview

**SETL** is an enterprise financial settlement reconciliation platform designed to automate the multi-way tie-out between **Merchant Order Ledgers**, **Razorpay Gateway Settlement Reports**, and **Bank Statement Credit Entries**.

It replaces error-prone spreadsheet macros with a two-tier reconciliation pipeline: a high-throughput **Deterministic Rule Engine** for exact financial tie-outs and a risk-gated **Gemini 3.6 Flash AI Engine** for auditing complex exceptions (chargeback clawbacks, reserve holds, fee drift, and netted refunds).

---

## Pipeline Flow

```
                           INPUT SOURCES
   ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
   │  Merchant Ledger  │ │Gateway Settlements│ │  Bank Statement   │
   │  (Orders & Gross) │ │ (MDR, Tax, UTR)   │ │ (Credits by UTR)  │
   └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │  DETERMINISTIC RULE ENGINE    │
                   │   - Order ID & UTR Mapping    │
                   │   - MDR (2%) & GST (18%) Check│
                   │   - Batch Credit Verification │
                   └───────────────┬───────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼ Matched (100% Tie)          ▼ Unmatched Exceptions
          ┌───────────────────┐         ┌──────────────────────────┐
          │ Reconciled Ledger │         │  GEMINI 3.6 FLASH ENGINE │
          └───────────────────┘         │  - Strict ResponseSchema │
                                        │  - Risk-Gated (≥85% Conf)│
                                        └────────────┬─────────────┘
                                                     │
                                   ┌─────────────────┴─────────────────┐
                                   ▼                                   ▼
                         ┌───────────────────┐               ┌───────────────────┐
                         │   Auto-Resolved   │               │ Quarantined Items │
                         │   (Minor Drift)   │               │ (Human Review)    │
                         └───────────────────┘               └───────────────────┘
```

---

## Key Features

- **3-Way Automated Tie-Out Engine**  
  Reconciles merchant orders, gateway payment entries (gross amount, MDR fees, GST tax, refunds, adjustments), and bank credits by UTR across batch settlements.

- **AI Exception Auditing (Gemini 3.6 Flash)**  
  Evaluates ambiguous discrepancies using strict JSON schema enforcement and a minimum **85% confidence threshold**. Generates double-entry accounting recommendations (`Debit <Account> <Amount>, Credit <Account> <Amount>`) and concise audit trails.

- **Razorpay Blade UI Integration**  
  Built using official `@razorpay/blade` components, featuring animated SVG flow diagrams, interactive financial settlement bridges, exception exposure breakdowns, and theme integration.

- **Integer Paise Financial Engine**  
  All internal financial arithmetic is calculated in integer paise ($1\text{ INR} = 100\text{ Paise}$) to prevent floating-point rounding discrepancies across high-volume transaction datasets.

- **Synthetic Data Generator & Edge Case Suite**  
  Includes a built-in generator script (`npm run generate:demo-csv`) simulating real-world settlement breaks like Chargeback Clawbacks, MDR Spikes, GST Rounding, Partial Reserve Holds, and Batch Mismatches.

- **Audit CSV Export & Local Workflow Persistence**  
  Export complete review findings to CSV. Reviewer status decisions (`Open`, `In review`, `Resolved`) and audit notes persist locally across sessions.

---

## Reconciliation Logic & Exception Categories

SETL categorizes transaction breaks into explicit root causes:

| Root Cause | Description | Resolution Strategy |
| :--- | :--- | :--- |
| `CLEAN_MATCH` | Order amount, MDR fee, GST tax, and bank UTR tie out 100%. | **Reconciled** (Deterministic) |
| `MDR_FEE_VARIANCE` | Payment MDR fee deviates from standard 2% pricing contract. | **Auto-Resolved** (AI / Rule) |
| `GST_ROUNDING_VARIANCE` | 18% GST calculation differs by 1–2 paise due to rounding. | **Auto-Resolved** (AI / Rule) |
| `REFUND_NETTED_WRONG_BATCH` | Customer refund was netted against a different settlement batch. | **Auto-Resolved** (AI / Rule) |
| `PARTIAL_RESERVE_HOLD` | Gateway placed a risk hold on part of the settlement payout. | **Quarantined** (Needs Review) |
| `CHARGEBACK_CLAWBACK` | Customer chargeback dispute debited against settlement batch. | **Quarantined** (Needs Review) |
| `BATCH_TOTAL_MISMATCH` | Gateway batch net total does not match single bank credit UTR. | **Quarantined** (Needs Review) |
| `MISSING_PAYMENT` | Order exists in merchant ledger but no gateway record found. | **Quarantined** (Needs Review) |
| `ORPHAN_BANK_CREDIT` | Bank credit received with UTR not present in gateway reports. | **Quarantined** (Needs Review) |

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **Gemini API Key**: (Optional, required only for live AI exception resolution)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/arnav-kr/setl.git
   cd setl
   ```

2. Install project dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (optional for live AI resolution):
   ```env
   GEMINI_API_KEY=your_google_gemini_api_key
   ```

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite local development server (`http://localhost:5173`). |
| `npm run build` | Compiles TypeScript (`tsc -b`) and builds production bundle (`vite build`). |
| `npm run preview` | Previews the production build locally. |
| `npm run lint` | Runs `oxlint` fast linter across project source files. |
| `npm run generate:demo-csv` | Generates synthetic demo CSV datasets into `public/demo-data/`. |

---

## Project Structure

```
setl/
├── api/                         # Serverless API Handlers (Vercel)
│   ├── gemini-resolve.ts        # Gemini AI exception audit endpoint
│   ├── razorpay-recon.ts        # Razorpay API settlement ingestion
│   └── demo-data.ts             # Demo dataset endpoint
├── demo/                        # Synthetic Data Engine
│   └── generator.ts             # Edge case generator (80 realistic transactions)
├── public/                      # Static Assets & Demo Fixtures
│   └── demo-data/               # Sample CSVs (Merchant, Gateway, Bank)
├── scripts/                     # CLI Scripts
│   └── generate-demo-csvs.ts    # Node generator script
├── src/                         # Core Application Source
│   ├── App.tsx                  # Dashboard UI, Flow Map, & Review Workspace
│   ├── engine.ts                # Deterministic & AI Reconciliation Pipeline
│   ├── csv.ts                   # CSV Parsing utilities for 3 source formats
│   ├── currency.ts              # Integer Paise formatting helpers
│   ├── types.ts                 # TypeScript domain interfaces & schemas
│   ├── main.tsx                 # App entry point with Razorpay BladeProvider
│   └── styles.css               # Flow map animation & Blade custom styles
├── logo.svg                     # Official SETL logo asset
├── package.json                 # Dependency manifest
├── tsconfig.json                # TypeScript configuration
└── vite.config.ts               # Vite configuration
```

---

## Tech Stack

- **UI Framework**: React 18
- **Design System**: `@razorpay/blade` (Razorpay official UI components and tokens)
- **Styling**: `styled-components` v5 & Emotion
- **AI Model**: Google Gemini 3.6 Flash (`gemini-3.6-flash`)
- **Build Tool**: Vite 8
- **Language**: TypeScript 5
- **Linter**: Oxlint

---

## License

This project is licensed under the MIT License.
