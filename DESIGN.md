# OmnisRouter — Design System

> **One locked foundation:**  
> background `#040506` · accent `#0356c5` · headline `Fraunces` · body/UI `Satoshi` · technical `Geist Mono`

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color System](#2-color-system)
3. [Typography System](#3-typography-system)
4. [Spacing & Layout](#4-spacing--layout)
5. [Component Library](#5-component-library)
6. [Motion & Animation System](#6-motion--animation-system)
7. [Screen-by-Screen Design Specs](#7-screen-by-screen-design-specs)
8. [Icon & Status System](#8-icon--status-system)
9. [shadcn/ui Customization Rules](#9-shadcnui-customization-rules)
10. [Anti-Slop Checklist](#10-anti-slop-checklist)
11. [Tailwind Config Reference](#11-tailwind-config-reference)
12. [CSS Variables Reference](#12-css-variables-reference)

---

## 1. Design Philosophy

OmnisRouter is a **trust product, not a bridge product.** The visual system must communicate three things simultaneously:

- **Control** — the user is always in charge before money moves
- **Intelligence** — the system understands and explains, it doesn't just execute
- **Precision** — every detail is there for a reason

### Personality Targets

| Feel | Not |
|------|-----|
| Dark infrastructure command center | Crypto casino landing page |
| Editorial fintech — serious, legible | Generic SaaS gradient hero |
| Signal intelligence moving through a system | Random particle playground |
| Founder-grade premium | A template with effects pasted on top |
| Calm when idle, alive when active | A gaming website |

### Visual Identity in One Sentence

A deep-space near-black canvas where Deep Signal Blue (`#0356c5`) moves through the interface like a live signal — confirming routes, activating states, and building trust through visible precision.

---

## 2. Color System

### Core Tokens

```css
:root {
  /* Backgrounds */
  --bg-page:           #040506;           /* Main page background */
  --bg-section:        #06080A;           /* Section depth variation */
  --bg-elevated:       #0A0D10;           /* Cards, nav, code blocks, panels */
  --bg-card:           rgba(9, 12, 15, 0.76);   /* Glass card surfaces */
  --bg-accent-tint:    rgba(3, 86, 197, 0.06);  /* Soft blue-tinted surface */

  /* Accent — Deep Signal Blue */
  --accent:            #0356c5;
  --accent-hover:      #0B63D9;
  --accent-glow:       rgba(3, 86, 197, 0.28);
  --accent-dim:        rgba(3, 86, 197, 0.10);
  --accent-border:     rgba(3, 86, 197, 0.32);
  --accent-faint:      rgba(3, 86, 197, 0.06);

  /* Text */
  --text-primary:      #F4F5F0;           /* Headlines, card titles */
  --text-secondary:    #8D9AA3;           /* Body copy, descriptions */
  --text-muted:        #4A5568;           /* Disabled, placeholder */
  --text-code:         #C9D3D0;           /* Mono code content */
  --text-accent:       #0356c5;           /* Italic emphasis, active labels */

  /* Borders */
  --border-subtle:     rgba(255, 255, 255, 0.08);   /* Default card borders */
  --border-strong:     rgba(255, 255, 255, 0.14);   /* Stronger dividers */
  --border-accent:     rgba(3, 86, 197, 0.32);      /* Highlighted elements */
  --border-focus:      rgba(3, 86, 197, 0.55);      /* Focus ring */

  /* Status Colors */
  --status-success:    #22C55E;           /* Confirmed, complete */
  --status-success-bg: rgba(34, 197, 94, 0.10);
  --status-warning:    #F59E0B;           /* Approval required */
  --status-warning-bg: rgba(245, 158, 11, 0.10);
  --status-error:      #EF4444;           /* Denied, failed */
  --status-error-bg:   rgba(239, 68, 68, 0.10);
  --status-pending:    #0356c5;           /* Attestation pending, in-flight */
  --status-pending-bg: rgba(3, 86, 197, 0.10);

  /* Motion */
  --motion-blue:       #0356c5;
  --motion-blue-bright:#0B63D9;
  --motion-blue-soft:  rgba(3, 86, 197, 0.22);
  --motion-blue-faint: rgba(3, 86, 197, 0.08);
}
```

### Semantic Color Usage

| Situation | Color |
|-----------|-------|
| CTA buttons | `--accent` → `--accent-hover` |
| Italic headline emphasis | `--text-accent` (`#0356c5`) |
| Eyebrow labels / mono tags | `#0356c5` (or branded blue — not teal from reference) |
| Active nav item | `--accent` underline or left border |
| Gas credits available | `--status-success` |
| Gas credits exhausted | `--status-warning` |
| Payment denied | `--status-error` |
| Attestation pending | `--status-pending` |
| Transfer complete | `--status-success` |
| Emergency pause ON | `--status-error` pulsing dot |
| Card borders (default) | `--border-subtle` |
| Card borders (hover/active) | `--border-accent` |
| Focus ring | `--border-focus` + `rgba(3, 86, 197, 0.14)` shadow |

### Do Not

- Do not use pure `#000000` as background (use `#040506`)
- Do not use teal/mint (`#73C7AE`) — the design brief overrides this with `#0356c5` blue
- Do not use more than one accent color family
- Do not use generic purple gradients

---

## 3. Typography System

### Font Stack

```css
/* Headline / Display */
font-family: "Fraunces", Georgia, serif;

/* Body / UI */
font-family: "Satoshi", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

/* Technical / Code / Labels */
font-family: "Geist Mono", "Courier New", monospace;
```

**Loading (Next.js / Google Fonts):**
```ts
// Fraunces — available on Google Fonts
// Satoshi — available from Fontshare: https://api.fontshare.com/v2/css?f[]=satoshi@300,400,700&display=swap
// Geist Mono — available from Vercel or npm
```

### Type Scale

| Role | Font | Size | Weight | Line Height | Letter Spacing | Color |
|------|------|------|--------|-------------|----------------|-------|
| Hero Eyebrow | Geist Mono | 11px | 500 | 1.4 | 0.14em | `#0356c5` |
| Hero H1 | Fraunces | `clamp(52px, 7vw, 96px)` | 400 | 0.95 | -0.04em | `#F4F5F0` |
| Hero H1 Emphasis | Fraunces Italic | Same as H1 | 400 | 0.95 | -0.04em | `#0356c5` |
| Section H2 | Fraunces | `clamp(36px, 5vw, 64px)` | 400 | 1.02 | -0.03em | `#F4F5F0` |
| Section H2 Emphasis | Fraunces Italic | Same as H2 | 400 | 1.02 | -0.03em | `#0356c5` |
| Section H3 | Fraunces | 28–36px | 400 | 1.1 | -0.02em | `#F4F5F0` |
| Body Large | Satoshi | 18px | 300 | 1.7 | 0 | `#8D9AA3` |
| Body Regular | Satoshi | 16px | 400 | 1.65 | 0 | `#8D9AA3` |
| Card Title | Satoshi | 15–16px | 700 | 1.4 | 0 | `#F4F5F0` |
| Card Body | Satoshi | 14–15px | 400 | 1.6 | 0 | `#8D9AA3` |
| Nav Label | Satoshi | 14px | 500 | 1 | 0 | `#8D9AA3` |
| Button Label | Satoshi | 13px | 700 | 1 | 0.01em | `#F4F5F0` or `#04110D` |
| Technical Label | Geist Mono | 10–12px | 500 | 1.4 | 0.14em | `#0356c5` |
| Code / Terminal | Geist Mono | 13–14px | 400 | 1.6 | 0 | `#C9D3D0` |
| Receipt Metadata | Geist Mono | 11px | 400 | 1.5 | 0.08em | `#8D9AA3` |
| TX Hash | Geist Mono | 11px | 400 | 1.4 | 0.04em | `#4A5568` |

### Section Rhythm Pattern

Every major section follows this exact three-layer structure:

```html
<section>
  <!-- Layer 1: Technical precision -->
  <p class="eyebrow">INTENT PARSING ACTIVE</p>

  <!-- Layer 2: Emotional/strategic weight -->
  <h2>
    Cross-chain payments that feel like
    <em>payments.</em>
  </h2>

  <!-- Layer 3: Practical clarity -->
  <p class="section-copy">
    OmnisRouter checks the route, validates your rules,
    handles gas logic, and asks for approval before a
    single token moves.
  </p>
</section>
```

**Rhythm:**  `mono label → elegant serif claim → calm sans-serif explanation`

This creates: **technical precision → emotional weight → practical clarity**

### Typography CSS

```css
.eyebrow {
  font-family: "Geist Mono", monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 16px;
}

h1, .hero-title {
  font-family: "Fraunces", Georgia, serif;
  font-size: clamp(52px, 7vw, 96px);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.04em;
  color: var(--text-primary);
}

h1 em, h2 em, .hero-title em {
  font-family: "Fraunces", Georgia, serif;
  font-style: italic;
  font-weight: 400;
  color: var(--accent);
}

h2, .section-title {
  font-family: "Fraunces", Georgia, serif;
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.section-copy {
  font-family: "Satoshi", sans-serif;
  font-size: 18px;
  font-weight: 300;
  line-height: 1.7;
  color: var(--text-secondary);
  max-width: 560px;
}

.card-title {
  font-family: "Satoshi", sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.mono-label {
  font-family: "Geist Mono", monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

.code-block {
  font-family: "Geist Mono", monospace;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.6;
  color: var(--text-code);
}
```

---

## 4. Spacing & Layout

### Base Unit

All spacing is based on a **4px grid**. Use multiples: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128`.

### Section Padding

| Section | Padding Top/Bottom |
|---------|--------------------|
| Hero | `128px / 160px` |
| Feature sections | `96px / 96px` |
| Dense data sections | `64px / 64px` |
| Footer | `80px / 48px` |

### Container Widths

```css
.container {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px;
}

@media (max-width: 768px) {
  .container { padding: 0 16px; }
}
```

### Card Inner Spacing

- **Standard card:** `24px` padding on all sides
- **Compact card:** `16px` padding
- **Large feature card:** `32–40px` padding
- **Between card sections:** `20px` gap

### Grid System

```css
/* Feature grid — 3 column */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

/* 2-col layout */
.split-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}

/* Payment log timeline */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

@media (max-width: 768px) {
  .feature-grid { grid-template-columns: 1fr; }
  .split-grid { grid-template-columns: 1fr; gap: 32px; }
}
```

---

## 5. Component Library

All components use the dark surface system and Deep Signal Blue accent. Below are the full specs.

---

### 5.1 Buttons

#### Primary Button

```css
.btn-primary {
  font-family: "Satoshi", sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: #F4F5F0;
  background: var(--accent);          /* #0356c5 */
  border: none;
  border-radius: 10px;
  padding: 12px 24px;
  cursor: pointer;
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
  letter-spacing: 0.01em;
  line-height: 1;
}
.btn-primary:hover {
  background: var(--accent-hover);    /* #0B63D9 */
  box-shadow: 0 0 28px rgba(3, 86, 197, 0.40);
  transform: translateY(-1px);
}
.btn-primary:active {
  transform: translateY(0);
  box-shadow: none;
}
```

#### Secondary Button (Ghost)

```css
.btn-secondary {
  font-family: "Satoshi", sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 12px 24px;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease;
}
.btn-secondary:hover {
  border-color: var(--border-accent);
  color: var(--accent);
}
```

#### Destructive Button (Reject / Deny)

```css
.btn-destructive {
  font-family: "Satoshi", sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--status-error);
  background: var(--status-error-bg);
  border: 1px solid rgba(239, 68, 68, 0.28);
  border-radius: 10px;
  padding: 12px 24px;
  cursor: pointer;
  transition: background 0.18s ease;
}
.btn-destructive:hover {
  background: rgba(239, 68, 68, 0.18);
}
```

#### Approve Button (Full-width, Approval Screen)

```css
.btn-approve {
  width: 100%;
  font-family: "Satoshi", sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #F4F5F0;
  background: var(--accent);
  border: none;
  border-radius: 12px;
  padding: 16px 24px;
  cursor: pointer;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
.btn-approve:hover {
  background: var(--accent-hover);
  box-shadow: 0 0 40px rgba(3, 86, 197, 0.35);
}
```

---

### 5.2 Cards

#### Standard Card

```css
.card {
  background: var(--bg-card);                 /* rgba(9,12,15,0.76) */
  border: 1px solid var(--border-subtle);     /* rgba(255,255,255,0.08) */
  border-radius: 16px;
  padding: 24px;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  border-color: var(--border-accent);
  box-shadow: 0 0 40px rgba(3, 86, 197, 0.08);
}
```

#### Floating Proof Card (Hero Panel)

```css
.card-proof {
  background: rgba(9, 12, 15, 0.76);
  border: 1px solid rgba(3, 86, 197, 0.28);
  border-radius: 18px;
  padding: 28px;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow:
    0 0 80px rgba(3, 86, 197, 0.16),
    0 30px 90px rgba(0, 0, 0, 0.48);
  /* Mouse parallax applied via JS transform */
}
```

#### Status Card (Payment Log Step)

```css
.card-status {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-status.active {
  border-color: var(--border-accent);
  background: var(--bg-accent-tint);
}
.card-status.complete {
  border-color: rgba(34, 197, 94, 0.24);
  background: rgba(34, 197, 94, 0.06);
}
.card-status.failed {
  border-color: rgba(239, 68, 68, 0.24);
  background: rgba(239, 68, 68, 0.06);
}
```

#### Receipt Card

```css
.card-receipt {
  background: var(--bg-card);
  border: 1px solid rgba(34, 197, 94, 0.28);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 0 60px rgba(34, 197, 94, 0.06);
}
```

---

### 5.3 Status Badges & Pills

```css
.badge {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border-radius: 6px;
  padding: 4px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.badge-pending   { background: var(--status-pending-bg); color: var(--accent); border: 1px solid rgba(3,86,197,0.28); }
.badge-success   { background: var(--status-success-bg); color: var(--status-success); border: 1px solid rgba(34,197,94,0.24); }
.badge-warning   { background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid rgba(245,158,11,0.24); }
.badge-error     { background: var(--status-error-bg);   color: var(--status-error); border: 1px solid rgba(239,68,68,0.24); }
.badge-sponsored { background: var(--accent-dim);        color: var(--accent); border: 1px solid var(--accent-border); }
```

**Badge dot (pulsing):**

```css
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.pulse {
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
.status-dot.pending { background: var(--accent); }
.status-dot.success { background: var(--status-success); }
.status-dot.error   { background: var(--status-error); }
.status-dot.warning { background: var(--status-warning); }
```

---

### 5.4 Gas Credit Indicator

```css
.gas-credit-bar {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 16px 20px;
}

.gas-credit-track {
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 10px;
}

.gas-credit-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 12px rgba(3, 86, 197, 0.5);
}

/* When credits exhausted */
.gas-credit-fill.exhausted {
  background: var(--status-warning);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
}
```

**Usage label pattern:**
```
SPONSORED GAS CREDITS          18 / 20 remaining
████████████████████░░  [Geist Mono, small]
```

---

### 5.5 Payment Timeline Component

```css
.timeline {
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Vertical connector line */
.timeline::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 32px;
  bottom: 32px;
  width: 1px;
  background: var(--border-subtle);
}

.timeline-step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 0;
  position: relative;
}

.timeline-step-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
}

.timeline-step.active .timeline-step-icon {
  border-color: var(--accent-border);
  background: var(--accent-dim);
  box-shadow: 0 0 20px rgba(3, 86, 197, 0.25);
}

.timeline-step.complete .timeline-step-icon {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.10);
}

.timeline-step-content .step-label {
  font-family: "Satoshi", sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.timeline-step.complete .step-label { color: var(--status-success); }
.timeline-step.active  .step-label { color: var(--text-primary); }
.timeline-step.pending .step-label { color: var(--text-muted); }

.timeline-step-content .step-meta {
  font-family: "Geist Mono", monospace;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
```

**Step Labels (in order):**
1. Intent parsed
2. Route checked
3. Rules validated
4. Approval required / Approved
5. Payment submitted
6. Attestation pending
7. Minting on Solana
8. Complete

---

### 5.6 Agent Chat Interface

The chat panel is the command interface. It must feel like a premium terminal, not a chatbot.

```css
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-page);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  /* Custom scrollbar */
  scrollbar-width: thin;
  scrollbar-color: rgba(3, 86, 197, 0.3) transparent;
}

/* Agent message */
.message-agent {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--accent);
  border-radius: 0 12px 12px 12px;
  padding: 16px 20px;
  max-width: 90%;
  font-family: "Satoshi", sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
}

/* User message */
.message-user {
  background: var(--accent-dim);
  border: 1px solid var(--accent-border);
  border-radius: 12px 12px 0 12px;
  padding: 12px 16px;
  max-width: 80%;
  align-self: flex-end;
  font-family: "Satoshi", sans-serif;
  font-size: 14px;
  color: var(--text-primary);
}

/* Route preview inside agent message */
.message-route-card {
  background: var(--bg-card);
  border: 1px solid var(--border-accent);
  border-radius: 10px;
  padding: 16px;
  margin-top: 12px;
  font-family: "Geist Mono", monospace;
  font-size: 12px;
  color: var(--text-code);
}

.chat-input-area {
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  gap: 12px;
  align-items: center;
  background: var(--bg-elevated);
}

.chat-input {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px 16px;
  font-family: "Satoshi", sans-serif;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.18s ease;
}
.chat-input::placeholder { color: var(--text-muted); }
.chat-input:focus { border-color: var(--accent-border); }
```

---

### 5.7 Spending Rules Panel

```css
.rules-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.rules-row:last-child { border-bottom: none; }

.rules-label {
  font-family: "Satoshi", sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.rules-description {
  font-family: "Satoshi", sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.rules-value {
  font-family: "Geist Mono", monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent);
  text-align: right;
}
```

---

### 5.8 Rule Result Banner

Shown on the Approval screen before the user confirms.

```css
.rule-result {
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: "Satoshi", sans-serif;
  font-size: 13px;
  font-weight: 500;
}
.rule-result.approved  { background: var(--status-success-bg); color: var(--status-success); border: 1px solid rgba(34,197,94,0.22); }
.rule-result.warning   { background: var(--status-warning-bg); color: var(--status-warning); border: 1px solid rgba(245,158,11,0.22); }
.rule-result.denied    { background: var(--status-error-bg);   color: var(--status-error);   border: 1px solid rgba(239,68,68,0.22); }
```

---

### 5.9 Navigation Bar

```css
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(4, 5, 6, 0.82);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 0 32px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.navbar-logo {
  font-family: "Fraunces", Georgia, serif;
  font-size: 20px;
  font-weight: 400;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}
.navbar-logo em {
  font-style: italic;
  color: var(--accent);
}

.navbar-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  font-family: "Satoshi", sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 8px 14px;
  border-radius: 8px;
  text-decoration: none;
  transition: color 0.15s, background 0.15s;
}
.nav-link:hover { color: var(--text-primary); background: var(--border-subtle); }
.nav-link.active { color: var(--accent); }
```

---

### 5.10 Code / Terminal Block

```css
.terminal-block {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

.terminal-header {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.terminal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.terminal-dot:nth-child(1) { background: rgba(239, 68, 68, 0.6); }
.terminal-dot:nth-child(2) { background: rgba(245, 158, 11, 0.6); }
.terminal-dot:nth-child(3) { background: rgba(34, 197, 94, 0.5); }

.terminal-body {
  padding: 20px 20px;
  font-family: "Geist Mono", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-code);
}

.terminal-prompt { color: var(--accent); }
.terminal-key    { color: var(--text-primary); }
.terminal-value  { color: #A5D6A7; }     /* Soft green for values */
.terminal-string { color: #FFCC80; }     /* Soft amber for strings */
.terminal-number { color: #90CAF9; }     /* Light blue for numbers */
```

---

## 6. Motion & Animation System

### Philosophy

The motion system has two modes:
- **Hero:** visually expressive, alive — WebGL/Three.js, blue signal fields, depth
- **Interior (app screens):** calm, purposeful — scroll reveals, status transitions, micro-interactions

**Never** animate purely for decoration. Every animation implies a real state change or guides attention.

### Easing Tokens

```css
:root {
  --ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1);     /* Main reveal easing */
  --ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);       /* State transitions */
  --ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);  /* Micro-interactions (subtle) */
}
```

### Hero Animation Sequence

| Element | Delay | Duration | Motion |
|---------|-------|----------|--------|
| Eyebrow label | 0.2s | 0.5s | fade up 12px |
| H1 line 1 | 0.35s | 0.7s | fade up 20px |
| H1 line 2 | 0.5s | 0.7s | fade up 20px |
| Italic emphasis | 0.7s | 0.6s | fade up + blue glow in |
| Body copy | 0.9s | 0.6s | fade up 12px |
| CTA group | 1.1s | 0.5s | fade up 8px |
| Floating proof card | 0.8s | 0.9s | fade in + float up 24px |

```css
.animate-hero-item {
  opacity: 0;
  transform: translateY(var(--y, 20px));
  animation: fadeUp var(--duration, 0.7s) var(--ease-out-expo) forwards;
  animation-delay: var(--delay, 0s);
}

@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}
```

### Scroll Reveal (All Interior Sections)

```css
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.8s var(--ease-out-expo), transform 0.8s var(--ease-out-expo);
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered cards */
.reveal-group .card:nth-child(1) { transition-delay: 0s; }
.reveal-group .card:nth-child(2) { transition-delay: 0.08s; }
.reveal-group .card:nth-child(3) { transition-delay: 0.16s; }
.reveal-group .card:nth-child(4) { transition-delay: 0.24s; }
```

**IntersectionObserver trigger (JS):**
```js
const observer = new IntersectionObserver(
  (entries) => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
  { threshold: 0.12 }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
```

### Blue Light Sweep

```css
.hero-sweep {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent 0%,
    rgba(3, 86, 197, 0.0)  35%,
    rgba(3, 86, 197, 0.22) 50%,
    rgba(3, 86, 197, 0.0)  65%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: sweep 8s ease-in-out infinite;
  animation-delay: 2s;
}

@keyframes sweep {
  0%   { background-position: -100% 0; }
  50%  { background-position: 100% 0; }
  100% { background-position: 100% 0; }
}
```

### Payment Timeline — Step Activation Animation

```css
/* When a step becomes active */
.timeline-step.active .timeline-step-icon {
  animation: step-activate 0.4s var(--ease-out-expo) forwards;
}

@keyframes step-activate {
  0%   { transform: scale(0.85); opacity: 0.4; }
  60%  { transform: scale(1.08); }
  100% { transform: scale(1);    opacity: 1; }
}
```

### Pulsing Signal Dot

```css
@keyframes signal-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(3, 86, 197, 0.7); }
  50%       { box-shadow: 0 0 0 6px rgba(3, 86, 197, 0); }
}

.signal-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: signal-pulse 2s ease-in-out infinite;
}
```

### Mouse Parallax — Floating Proof Card

```js
const card = document.querySelector('.card-proof');
window.addEventListener('mousemove', (e) => {
  const { innerWidth: w, innerHeight: h } = window;
  const x = (e.clientX / w - 0.5) * 12;  // max 12deg
  const y = (e.clientY / h - 0.5) * -8;  // max 8deg
  card.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${y}deg)`;
});
```

### WebGL Hero Background (Three.js)

Use Three.js for a slow-moving blue light field. Key parameters:

```js
// Particle field settings
const PARTICLE_COUNT = 180;
const PARTICLE_COLOR = 0x0356c5;
const PARTICLE_SIZE = 0.012;
const FIELD_SPEED = 0.0003;

// Light glow settings
// Use PointLight at center, color #0356c5, intensity 1.2, distance 8
// Use AmbientLight #040506 for base

// Mobile: reduce PARTICLE_COUNT to 60, disable OrbitControls
// prefers-reduced-motion: disable all WebGL animation
```

**Mobile & Accessibility Fallback:**
```css
@media (max-width: 768px) {
  .webgl-canvas { display: none; }
  .hero-fallback-bg {
    background: radial-gradient(ellipse at 30% 50%, rgba(3,86,197,0.12) 0%, transparent 60%),
                #040506;
  }
}
@media (prefers-reduced-motion: reduce) {
  .webgl-canvas { display: none; }
  .animate-hero-item { animation: none; opacity: 1; transform: none; }
  .hero-sweep { animation: none; }
}
```

---

## 7. Screen-by-Screen Design Specs

### 7.1 Dashboard

**Purpose:** Situational awareness at a glance — balance, gas credits, recent activity, emergency controls.

**Layout:** Sticky navbar → 2-column grid (main content left, sidebar right) → Recent payments list

**Key Elements:**

```
┌─────────────────────────────────────────────────┐
│ NAVBAR — OmnisRouter [nav links] [wallet badge]  │
├─────────────────┬───────────────────────────────┤
│                 │                               │
│  Injective USDC │  GAS CREDITS                  │
│  Balance Card   │  18 / 20 remaining            │
│  [large number] │  [progress bar]               │
│                 │                               │
├─────────────────┴───────────────────────────────┤
│                                                 │
│  RECENT PAYMENTS                                │
│  [payment log list — 5 most recent]             │
│                                                 │
├─────────────────────────────────────────────────┤
│  EMERGENCY CONTROLS                             │
│  [Pause Agent Spending toggle — prominent red]   │
└─────────────────────────────────────────────────┘
```

**Balance Card:**
- Background: `var(--bg-card)` with `--border-accent` border
- Label: `INJECTIVE USDC BALANCE` — Geist Mono, 11px, accent
- Number: Fraunces, 48px, `--text-primary`
- Sub-label: wallet address truncated — Geist Mono, 11px, muted

**Emergency Pause Toggle:**
- When OFF: `--border-subtle` border, label "Agent spending active" — success dot
- When ON: red border `rgba(239,68,68,0.4)`, label "AGENT PAUSED" — error dot pulsing
- This control must be immediately visible — **never below the fold**

---

### 7.2 Rules Page

**Purpose:** User-controlled spending governance. Must feel authoritative, not like a settings page.

**Layout:** Single column, full-width form with ruled rows.

**Key Fields:**

| Label | Input Type | Default | Notes |
|-------|-----------|---------|-------|
| Max Transfer Amount | Number input (USDC) | 50 | Red warning if > daily cap |
| Daily Cap | Number input (USDC) | 100 | |
| Approval Threshold | Number input (USDC) | 25 | "Payments above this require your approval" |
| Allowed Destination Chain | Dropdown / locked | Solana | MVP: locked to Solana |
| Monthly Gas Credits | Read-only display | 20 | Cannot be user-edited |
| Blocked Addresses | Multi-input | — | Add/remove wallet addresses |
| Emergency Pause | Toggle | OFF | Full-width, prominent |

**Design note:** Each row uses `--border-subtle` bottom divider. The save button is sticky at the bottom of the form (mobile) or full-width at the bottom of the section.

---

### 7.3 Agent Command Page

**Purpose:** The primary action screen. User types a payment intent; the agent responds.

**Layout:** Full-height chat panel (left or center) with a command input at the bottom.

**Command Input Placeholder Text:**
```
Send 40 USDC to this Solana address...
```

**Agent Pre-Approval Response Structure:**

```
[eyebrow] ROUTE FOUND

[section title]
Injective → Solana
40 USDC

[route card — terminal style]
Source:      Injective USDC
Destination: Solana USDC
Rail:        CCTP Standard Transfer
Recipient:   9xQe...EP

[rules summary card]
✓ Within max transfer (50 USDC)
✓ Within daily cap (100 USDC)
⚠ Approval required — above 25 USDC threshold
✓ Solana is an allowed destination
✓ Recipient not blocked

[gas credit card]
Sponsored by AgentPay gas credit
18 / 20 remaining

[CTA]
[Approve Payment →]  [Reject]
```

---

### 7.4 Approval Page

**Purpose:** The final gate. This screen must communicate **weight** — this is where money moves.

**Layout:** Centered, narrow (max-width 560px), vertical stack.

```
[eyebrow] APPROVAL REQUIRED

[h2]
Review your
payment.

──────────────────────────────
You send:    40 USDC
Route:       Injective → Solana (CCTP)
Recipient:   9xQe...EP [copy icon]
Fee:         Sponsored by AgentPay gas credit
Gas credits: 18 / 20 remaining

──────────────────────────────
[rule-result banner]
⚠ Approval required — this payment exceeds your 25 USDC threshold

──────────────────────────────
[btn-approve: APPROVE PAYMENT]
[btn-destructive: Reject]

[fine print — Geist Mono 10px muted]
PAYMENTS CANNOT BE REVERSED AFTER APPROVAL
```

**Visual treatment:**
- The approve button gets full-width, extra vertical padding
- The recipient address uses `--border-accent` underline
- A thin blue glow line runs along the left edge of the approval card

---

### 7.5 Payment Log Page

**Purpose:** Full transparency into every step of a transfer. This is the trust layer.

**Layout:** Timeline component (vertical) with expandable metadata per step.

**Steps to display:**

```
[1] Intent parsed
    "Send 40 USDC to 9xQe...EP on Solana"
    [timestamp] [Geist Mono]

[2] Route checked
    Injective USDC → Solana USDC via CCTP
    [timestamp]

[3] Rules validated
    Approval required above threshold
    [timestamp]

[4] Approved by user
    Payment approved at [time]
    [timestamp]

[5] Payment submitted
    TX: inj_0xabc... [explorer link]
    [timestamp]

[6] Attestation pending
    "Your USDC has left Injective. Circle is confirming the burn..."
    [pulsing blue dot]

[7] Minting on Solana
    Relayer submitting mint tx...
    [timestamp]

[8] Complete
    40 USDC received by 9xQe...EP
    Solana TX: 5xyz... [explorer link]
    [timestamp]
```

**Expandable step:** clicking any step reveals a `card-status` detail panel with full metadata JSON in a terminal block.

---

### 7.6 Receipt Page

**Purpose:** Final proof of transfer. Shareable, printable, trustworthy.

**Layout:** Centered receipt card, max-width 480px.

```
[eyebrow] PAYMENT COMPLETE

[h2]
40 USDC
delivered.

──────────────────────────────
Recipient:     9xQe...EP
Source chain:  Injective
Destination:   Solana
Route:         CCTP Standard Transfer
Fee paid by:   AgentPay gas credit
Status:        ✅ CONFIRMED

──────────────────────────────
Source TX:     inj_0xabc... [link]
Destination TX: 5xyz... [link]

──────────────────────────────
[btn-secondary: Download Receipt]
[btn-secondary: New Payment]
```

---

## 8. Icon & Status System

Use a consistent set of minimal icons throughout. Recommended: `lucide-react`.

| Context | Icon | Color |
|---------|------|-------|
| Route check | `ArrowRight` or `Route` | `--accent` |
| Rules validated | `ShieldCheck` | `--status-success` |
| Approval required | `AlertCircle` | `--status-warning` |
| Denied | `ShieldX` | `--status-error` |
| Attestation pending | `Loader2` (spinning) | `--accent` |
| Complete | `CheckCircle2` | `--status-success` |
| Gas credit | `Zap` | `--accent` |
| Gas exhausted | `ZapOff` | `--status-warning` |
| Emergency pause | `PauseCircle` | `--status-error` |
| Copy address | `Copy` | `--text-muted` |
| Explorer link | `ExternalLink` | `--text-muted` |
| Wallet | `Wallet` | `--text-secondary` |
| Chain / network | `Network` | `--text-secondary` |

**Icon sizing:**
- In cards / rows: `16px`
- In timeline steps: `18px`
- In badges: `12px`
- In hero features: `20px`

---

## 9. shadcn/ui Customization Rules

Use shadcn for structure, never for default visual identity. Reskin everything.

### Global Component Overrides (`globals.css` or `tailwind.config.ts`)

```css
/* All shadcn cards */
.card {
  background: var(--bg-card) !important;
  border-color: var(--border-subtle) !important;
  border-radius: 16px !important;
  color: var(--text-primary) !important;
}

/* All shadcn buttons — override default */
.btn, [data-slot="button"] {
  font-family: "Satoshi", sans-serif;
  font-size: 13px;
  font-weight: 700;
  border-radius: 10px;
}

/* Focus ring — all interactive elements */
*:focus-visible {
  outline: 2px solid rgba(3, 86, 197, 0.55);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(3, 86, 197, 0.14);
}

/* Input fields */
input, textarea, select {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--text-primary);
  font-family: "Satoshi", sans-serif;
}
input:focus, textarea:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px rgba(3, 86, 197, 0.14);
}
input::placeholder { color: var(--text-muted); }

/* Dialogs / modals */
[role="dialog"] {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
}

/* Badges */
[data-slot="badge"] {
  font-family: "Geist Mono", monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-radius: 6px;
}

/* Tooltips */
[role="tooltip"] {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  font-family: "Satoshi", sans-serif;
  font-size: 12px;
  border-radius: 8px;
}
```

---

## 10. Anti-Slop Checklist

Run every screen through this before shipping.

### Visual Hierarchy
- [ ] One dominant element per section — clear focal point
- [ ] Hero H1 is 3–4× larger than body copy
- [ ] Approve button is the highest-contrast CTA on the Approval screen
- [ ] Reading order is obvious without thinking — top to bottom, left to right
- [ ] Important elements have noticeably more breathing room

### Typography
- [ ] Three fonts used: Fraunces, Satoshi, Geist Mono — no others
- [ ] Minimum 3 distinct size levels per screen
- [ ] Body text line-height 1.65–1.7, headline line-height 0.95–1.02
- [ ] Body copy max-width ≤ 65 characters per line
- [ ] Eyebrow labels are always uppercase, Geist Mono, spaced

### Color
- [ ] One accent — `#0356c5` — dominates. No competing accents
- [ ] Background never pure `#000000` — always `#040506` or `#06080A`
- [ ] Text never pure `#ffffff` — always `#F4F5F0`
- [ ] Status colors used consistently: green = success, red = error, amber = warning, blue = pending
- [ ] Accent color used only on CTAs, active states, links, and emphasis — never for decoration

### Spacing
- [ ] Spacing grid: 4px base unit, all values divisible by 4
- [ ] Section padding varies — hero gets the most space
- [ ] Card inner padding minimum 20px
- [ ] No elements touching each other without intentional spacing

### Interaction & Polish
- [ ] Every button has hover and active states
- [ ] Focus states are visible for keyboard navigation
- [ ] Loading state designed for every async action (CCTP polling, balance fetch)
- [ ] Error states designed (invalid address, unsupported route, credits exhausted, transfer failed)
- [ ] Empty states designed (no payments yet, no blocked addresses)
- [ ] Mobile layout works without horizontal scroll

### Trust & Credibility
- [ ] Emergency pause button visible on dashboard — never buried
- [ ] Gas credits shown with exact numbers (18/20), not just "available"
- [ ] Every payment shows amounts, routes, and fees before approval
- [ ] TX hashes link to explorers
- [ ] Receipts show "fee paid by" — never hide the cost model
- [ ] No placeholder copy in final screens — all content is real or clearly labelled demo

### Anti-Slop Patterns to Avoid
- [ ] No generic gradient blob hero with white "Get Started" button
- [ ] No 3 identical feature cards with icon + title + 2-line description
- [ ] No vague CTAs ("Learn More", "Sign Up") — use specific action language
- [ ] No stock photo energy — use product screenshots or no images
- [ ] No equal padding on every section — vary deliberately
- [ ] No pure decorative animations — every motion has meaning

---

## 11. Tailwind Config Reference

```js
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-page':    '#040506',
        'bg-section': '#06080A',
        'bg-elevated':'#0A0D10',

        // Accent
        'accent':       '#0356c5',
        'accent-hover': '#0B63D9',

        // Text
        'text-primary':   '#F4F5F0',
        'text-secondary': '#8D9AA3',
        'text-muted':     '#4A5568',
        'text-code':      '#C9D3D0',

        // Status
        'status-success': '#22C55E',
        'status-warning': '#F59E0B',
        'status-error':   '#EF4444',
        'status-pending': '#0356c5',
      },
      fontFamily: {
        fraunces: ['"Fraunces"', 'Georgia', 'serif'],
        satoshi:  ['"Satoshi"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono:     ['"Geist Mono"', '"Courier New"', 'monospace'],
      },
      borderRadius: {
        card:   '16px',
        button: '10px',
        badge:  '6px',
      },
      animation: {
        'fade-up':      'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'signal-pulse': 'signal-pulse 2s ease-in-out infinite',
        'sweep':        'sweep 8s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          'from': { opacity: '0', transform: 'translateY(20px)' },
          'to':   { opacity: '1', transform: 'translateY(0)' },
        },
        'signal-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(3, 86, 197, 0.7)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(3, 86, 197, 0)' },
        },
      },
      boxShadow: {
        'card-proof': '0 0 80px rgba(3, 86, 197, 0.16), 0 30px 90px rgba(0,0,0,0.48)',
        'glow-accent':'0 0 28px rgba(3, 86, 197, 0.40)',
        'glow-success':'0 0 28px rgba(34, 197, 94, 0.30)',
      },
    },
  },
};
```

---

## 12. CSS Variables Reference

The single source of truth. Paste into `globals.css`:

```css
:root {
  /* ─── Backgrounds ─── */
  --bg-page:           #040506;
  --bg-section:        #06080A;
  --bg-elevated:       #0A0D10;
  --bg-card:           rgba(9, 12, 15, 0.76);
  --bg-accent-tint:    rgba(3, 86, 197, 0.06);

  /* ─── Accent ─── */
  --accent:            #0356c5;
  --accent-hover:      #0B63D9;
  --accent-glow:       rgba(3, 86, 197, 0.28);
  --accent-dim:        rgba(3, 86, 197, 0.10);
  --accent-border:     rgba(3, 86, 197, 0.32);
  --accent-faint:      rgba(3, 86, 197, 0.06);

  /* ─── Text ─── */
  --text-primary:      #F4F5F0;
  --text-secondary:    #8D9AA3;
  --text-muted:        #4A5568;
  --text-code:         #C9D3D0;
  --text-accent:       #0356c5;

  /* ─── Borders ─── */
  --border-subtle:     rgba(255, 255, 255, 0.08);
  --border-strong:     rgba(255, 255, 255, 0.14);
  --border-accent:     rgba(3, 86, 197, 0.32);
  --border-focus:      rgba(3, 86, 197, 0.55);

  /* ─── Status ─── */
  --status-success:    #22C55E;
  --status-success-bg: rgba(34, 197, 94, 0.10);
  --status-warning:    #F59E0B;
  --status-warning-bg: rgba(245, 158, 11, 0.10);
  --status-error:      #EF4444;
  --status-error-bg:   rgba(239, 68, 68, 0.10);
  --status-pending:    #0356c5;
  --status-pending-bg: rgba(3, 86, 197, 0.10);

  /* ─── Motion ─── */
  --ease-out-expo:     cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:       cubic-bezier(0.4, 0, 0.2, 1);

  /* ─── Motion Colors ─── */
  --motion-blue:       #0356c5;
  --motion-blue-bright:#0B63D9;
  --motion-blue-soft:  rgba(3, 86, 197, 0.22);
  --motion-blue-faint: rgba(3, 86, 197, 0.08);
}

/* Base resets */
html { background: var(--bg-page); color: var(--text-primary); }
body {
  font-family: "Satoshi", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

---

*OmnisRouter Design System — built for the Injective × Solana CCTP Hackathon MVP*
