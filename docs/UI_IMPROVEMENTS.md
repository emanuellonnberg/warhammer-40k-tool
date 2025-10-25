# UI Improvements & Visualization Plan

**Status:** 🔴 Planning Phase
**Created:** 2025-10-25
**Last Updated:** 2025-10-25

---

## Table of Contents

1. [Current UI Analysis](#current-ui-analysis)
2. [Identified Issues](#identified-issues)
3. [Proposed Improvements](#proposed-improvements)
4. [Implementation Phases](#implementation-phases)
5. [Mockups & Wireframes](#mockups--wireframes)
6. [Progress Tracking](#progress-tracking)

---

## Current UI Analysis

### Current Layout Structure

```
┌─────────────────────────────────────────┐
│  Title & Version                         │
├──────────────────┬──────────────────────┤
│  Left Column     │  Right Column        │
│  - Toughness     │  - Toggles           │
│  - Re-rolls      │  - Overcharge        │
│  - FNP           │  - One-Time Weapons  │
│                  │  - Optimal Range     │
├──────────────────┴──────────────────────┤
│  File Selection  │  Drag & Drop Upload  │
└──────────────────┴──────────────────────┘
┌─────────────────────────────────────────┐
│  Summary Table (full width)             │
│  [All units in sortable table]          │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  Unit Card 1                            │
│  - Stats Table                          │
│  - Abilities & Rules                    │
│  - Weapons Stats                        │
│                                         │
│  Unit Card 2                            │
│  Unit Card 3...                         │
└─────────────────────────────────────────┘
```

### Current Features

**✅ Implemented:**
- Toughness selector (T3-T8)
- Re-roll controls (hits, wounds)
- Feel No Pain selector
- Weapon toggles (overcharge, one-time, optimal range)
- Army file selection + drag-drop upload
- Sortable summary table
- Detailed unit cards with:
  - Stats table (M, T, Sv/Inv.Sv, W, Ld, OC)
  - Expandable abilities
  - Weapon tooltips
  - Weapon stats breakdown

**Current Strengths:**
- Comprehensive data display
- Good detail in unit cards
- Interactive weapon modes
- Clean, readable design

---

## Identified Issues

### 1. Poor Control Organization
**Problem:** Controls scattered across two columns with no logical grouping
**Impact:** Takes excessive vertical space, hard to scan
**Priority:** High

### 2. No Visual Hierarchy
**Problem:** Everything has equal visual weight
**Impact:** Difficult to identify important information quickly
**Priority:** High

### 3. Inefficient Space Usage
**Problem:** Summary table is full-width but has narrow columns
**Impact:** Wasted horizontal space, can't show more data
**Priority:** Medium

### 4. No Quick Overview
**Problem:** No dashboard or summary section
**Impact:** Must scan entire table to understand army
**Priority:** High

### 5. Limited Comparison Capability
**Problem:** Can't easily compare units side-by-side
**Impact:** Difficult to make tactical decisions
**Priority:** Medium

### 6. No Visualizations
**Problem:** All data is tabular/textual
**Impact:** Can't see patterns, trends, or relationships
**Priority:** High

### 7. No Filtering Beyond Sorting
**Problem:** Can only sort, can't filter by role, points, etc.
**Impact:** Hard to find specific units in large lists
**Priority:** Medium

### 8. Mobile Experience
**Problem:** Not optimized for tablets/phones
**Impact:** Poor UX on smaller screens
**Priority:** Low (future)

---

## Proposed Improvements

### Phase 1: Layout Restructure (Foundation)

#### 1.1 Collapsible Control Panel
**Status:** 🔴 Not Started
**Effort:** Low (2-3 hours)
**Impact:** High

**Description:**
Consolidate all controls into organized, collapsible sections.

**Design:**
```
┌────────────────────────────────────────────────────┐
│ ⚙️ Combat Scenario Settings          [Collapse ▼] │
├────────────────────────────────────────────────────┤
│ Target Toughness: [T5 ▼]                          │
│ Re-roll Hits:     [1s ▼]   Re-roll Wounds: [None]│
│ Target FNP:       [5+ ▼]                          │
│                                                    │
│ ⚙️ Weapon Options                    [Collapse ▼] │
│ ☐ Show Overcharge  ☐ One-Time Weapons ☑ Optimal  │
│                                                    │
│ 📁 Army Selection                    [Collapse ▼] │
│ [Dropdown] or [Drag & Drop Area]                  │
└────────────────────────────────────────────────────┘
```

**Features:**
- Tabs or accordion-style sections
- Remember collapsed state (localStorage)
- Collapse by default after first use
- Save 200-300px vertical space

**Implementation:**
- Add collapse/expand buttons
- Use CSS transitions for smooth animation
- Store state in localStorage
- Update event handlers

---

#### 1.2 Dashboard Section (NEW)
**Status:** 🔴 Not Started
**Effort:** Medium (4-5 hours)
**Impact:** High

**Description:**
Add quick overview section showing army-level statistics and top performers.

**Design:**
```
┌─────────────────────────────────────────────────────┐
│ 📊 Army Dashboard                                    │
├─────────────────┬───────────────────────────────────┤
│ T'au Empire     │ Top 3 Units (vs T5)              │
│ 1500 pts        │ 🥇 Crisis Suits    DPP: 0.234    │
│ 8 units         │ 🥈 Broadsides      DPP: 0.198    │
│                 │ 🥉 Riptide         DPP: 0.156    │
│ Average DPP     │                                   │
│ 0.187           │ Efficiency Distribution          │
│                 │ High:   3 units (38%)            │
│ Total Damage    │ Medium: 4 units (50%)            │
│ 234.5 vs T5     │ Low:    1 unit  (12%)            │
└─────────────────┴───────────────────────────────────┘
```

**Features:**
- Army faction and total points
- Unit count
- Average DPP
- Total damage output
- Top 3 performers
- Efficiency distribution
- Color-coded indicators

**Implementation:**
- Calculate army-level stats
- Identify top performers
- Create dashboard component
- Add to display pipeline

---

#### 1.3 Visualization Area (NEW)
**Status:** 🔴 Not Started
**Effort:** High (varies by chart)
**Impact:** Very High

**Description:**
Dedicated area for charts and graphs showing damage patterns and comparisons.

**Design:**
```
┌──────────────────────────────────────────────────┐
│ 📈 Visualizations          [Chart Type ▼] [⚙️]  │
├──────────────────────────────────────────────────┤
│                                                  │
│        [Interactive Chart Area]                  │
│                                                  │
│  - Damage Curve                                  │
│  - DPP Comparison                                │
│  - Efficiency Heatmap                            │
│  - Weapon Breakdown                              │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Chart Types:**
1. **Damage Curve** - Line chart (damage vs toughness)
2. **DPP Bars** - Horizontal bar chart (unit comparison)
3. **Efficiency Heatmap** - Matrix view (units × targets)
4. **Weapon Breakdown** - Pie/donut chart (ranged/melee split)

**Implementation:**
- Integrate Chart.js or Recharts
- Create chart components
- Add chart selection dropdown
- Interactive features (click to highlight)

---

### Phase 2: Enhanced Components

#### 2.1 Improved Summary Table
**Status:** 🔴 Not Started
**Effort:** Medium (3-4 hours)
**Impact:** High

**Features to Add:**
- ✅ **Sticky Header** - Stays visible while scrolling
- ✅ **Quick Filters** - Filter by role, points, efficiency
- ✅ **Row Highlighting** - Hover effect for better scanning
- ✅ **Click to Jump** - Click row to scroll to unit card
- ✅ **Multi-Select** - Select units for comparison
- ✅ **Export Button** - Download as CSV
- ✅ **Sparklines** - Mini damage curves in cells (optional)

**Design Improvements:**
- Better column spacing
- Color-coded values
- Icons for weapon types
- Zebra striping for readability

---

#### 2.2 Enhanced Unit Cards
**Status:** 🔴 Not Started
**Effort:** Medium (4-5 hours)
**Impact:** Medium

**New Features:**
- **Grid View Toggle** - Show 2-3 cards per row
- **Compact Mode** - Less detail, more units visible
- **Pin to Top** - Keep favorites visible
- **Quick Actions:**
  - 📌 Pin unit
  - 📊 Show in chart
  - 🔗 Share unit
  - 📋 Copy stats

**View Modes:**
```
┌─────────────────────────────────────────┐
│ View: [●List] [○Grid] [○Compact]      │
└─────────────────────────────────────────┘

Grid View (2-3 per row):
┌────────┬────────┬────────┐
│ Unit 1 │ Unit 2 │ Unit 3 │
└────────┴────────┴────────┘

Compact View (minimal):
┌──────────────────────────┐
│ Crisis Suits | 150pts    │
│ DPP: 0.234 | Eff: High  │
└──────────────────────────┘
```

---

#### 2.3 Smart Filtering System
**Status:** 🔴 Not Started
**Effort:** Medium (3-4 hours)
**Impact:** High

**Filter Types:**

1. **Role Filter**
   - HQ, Troops, Elites, Fast Attack, Heavy Support, etc.
   - Multi-select checkboxes

2. **Points Range Slider**
   - Min/Max sliders
   - "100-300pts" display

3. **Efficiency Tiers**
   - High / Medium / Low toggles
   - Color-coded

4. **Weapon Type**
   - Units with ranged weapons
   - Units with melee weapons
   - Units with both

5. **Special Rules Filter**
   - Deep Strike, Stealth, Torrent, etc.
   - Multi-select from available abilities

6. **Search Bar**
   - Fuzzy search by unit name
   - Real-time filtering

**Design:**
```
┌────────────────────────────────────────────────┐
│ 🔍 Filter Units                                │
├────────────────────────────────────────────────┤
│ Search: [________________]                     │
│                                                │
│ Role:   ☐HQ ☐Troops ☐Elites ☐Fast ☐Heavy     │
│ Points: [0────●────●────500]                   │
│ Tier:   ☐High ☐Medium ☐Low                    │
│                                                │
│ [Clear Filters]                                │
└────────────────────────────────────────────────┘
```

---

### Phase 3: Visualization Implementation

#### 3.1 Damage Curve Chart
**Status:** 🔴 Not Started
**Effort:** Medium (5-6 hours)
**Impact:** Very High

**Description:**
Line chart showing damage output across different toughness values.

**Visual:**
```
Damage vs Toughness
  ^
  │
30│         ●
  │       ●   ●
20│     ●       ●
  │   ●           ●
10│ ●               ●●
  │                    ●
 0└─────────────────────> Toughness
   T3  T5  T7  T9  T11

Legend:
● Crisis Suits
● Broadsides
● Riptide
```

**Features:**
- Multi-line chart (one per unit)
- Toggle units on/off
- Highlight on hover
- Show data points
- Click to select unit
- Export as PNG

**Use Cases:**
- Identify optimal targets
- Compare unit versatility
- See re-roll impact
- Find coverage gaps

**Implementation:**
- Use Chart.js Line chart
- Calculate damage for T3-T12
- Add interactivity
- Color-code by efficiency

---

#### 3.2 DPP Comparison Bar Chart
**Status:** 🔴 Not Started
**Effort:** Low (2-3 hours)
**Impact:** High

**Description:**
Horizontal bar chart comparing damage per point efficiency.

**Visual:**
```
Unit Efficiency (DPP)

Crisis Suits     ████████████ 0.234
Broadsides       ██████████ 0.198
Riptide          ████████ 0.156
Fire Warriors    ██████ 0.112
Pathfinders      ████ 0.089

Color Legend:
🟢 Green = High (>0.200)
🟡 Yellow = Medium (0.100-0.200)
🔴 Red = Low (<0.100)
```

**Features:**
- Sorted by DPP (descending)
- Color-coded bars
- Show exact values
- Click to highlight unit
- Filter by efficiency tier

**Use Cases:**
- Quick efficiency ranking
- Identify best value units
- Compare similar roles
- Budget optimization

**Implementation:**
- Use Chart.js Horizontal Bar
- Sort units by DPP
- Apply color scheme
- Add click handlers

---

#### 3.3 Efficiency Heatmap
**Status:** 🔴 Not Started
**Effort:** High (6-8 hours)
**Impact:** High

**Description:**
Matrix visualization showing unit efficiency against all toughness values.

**Visual:**
```
Efficiency Heatmap
           T3   T4   T5   T6   T7   T8   T9  T10
Crisis     🟢   🟢   🟡   🟡   🟡   🔴   🔴   🔴
Broadsides 🟡   🟡   🟢   🟢   🟢   🟢   🟡   🟡
Riptide    🟢   🟢   🟢   🟡   🟡   🟡   🔴   🔴
Firewar.   🟢   🟡   🟡   🔴   🔴   🔴   🔴   🔴

Legend:
🟢 High efficiency (>0.200 DPP)
🟡 Medium (0.100-0.200)
🔴 Low (<0.100)
```

**Features:**
- All units × all toughness values
- Color-coded cells
- Click to see details
- Identify sweet spots
- Find army weaknesses

**Use Cases:**
- See all matchups at once
- Identify coverage gaps
- Find optimal targets per unit
- Army composition analysis

**Implementation:**
- Calculate DPP for all combinations
- Create grid layout
- Apply color thresholds
- Add tooltips with values

---

#### 3.4 Weapon Breakdown Pie Chart
**Status:** 🔴 Not Started
**Effort:** Low (2-3 hours)
**Impact:** Medium

**Description:**
Pie or donut chart showing damage distribution by weapon type.

**Visual:**
```
Unit Damage Breakdown

    ╱───────╲
   ╱  Ranged  ╲
  │   65%      │
  │            │
   ╲  Melee   ╱
    ╲  25%   ╱
     ╲─────╱
    Pistol 10%
```

**Features:**
- Ranged / Melee / Pistol split
- Percentage labels
- Toggle between units
- Compare army composition

**Use Cases:**
- Understand unit roles
- Identify ranged/melee balance
- Compare army compositions
- Planning deployment

**Implementation:**
- Use Chart.js Pie/Doughnut
- Calculate percentages
- Add labels and legend
- Unit selector dropdown

---

### Phase 4: Visual Polish

#### 4.1 Enhanced Color Palette
**Status:** 🔴 Not Started
**Effort:** Low (1-2 hours)
**Impact:** Medium

**Current:** Basic Bootstrap colors
**Proposed:** Modern, cohesive palette

```css
/* Primary Colors */
--primary-blue: #1e88e5;
--primary-dark: #0d47a1;
--primary-light: #e3f2fd;

/* Efficiency Colors */
--high-efficiency: #43a047;    /* Green */
--medium-efficiency: #fb8c00;  /* Orange */
--low-efficiency: #e53935;     /* Red */

/* Neutral Colors */
--text-primary: #212121;
--text-secondary: #757575;
--text-disabled: #bdbdbd;
--background: #f5f5f5;
--surface: #ffffff;
--divider: #e0e0e0;

/* Weapon Type Colors */
--ranged-color: #1976d2;
--melee-color: #c2185b;
--pistol-color: #7b1fa2;

/* Chart Colors */
--chart-1: #1e88e5;
--chart-2: #43a047;
--chart-3: #fb8c00;
--chart-4: #e53935;
--chart-5: #7b1fa2;
```

**Implementation:**
- Define CSS variables
- Update all color references
- Test for accessibility (WCAG)
- Add dark mode variants

---

#### 4.2 Typography Improvements
**Status:** 🔴 Not Started
**Effort:** Low (1 hour)
**Impact:** Medium

**Updates:**
- **Headers:** Larger (h1: 2.5rem, h2: 2rem, h3: 1.5rem)
- **Stats/Numbers:** Tabular (monospace) for alignment
- **Damage Values:** Bold, colored
- **Labels:** Smaller (0.875rem), muted color
- **Line Height:** Better spacing (1.6 for body)

```css
h1 { font-size: 2.5rem; font-weight: 700; }
h2 { font-size: 2rem; font-weight: 600; }
h3 { font-size: 1.5rem; font-weight: 600; }

.stat-value {
  font-family: 'Roboto Mono', monospace;
  font-weight: 600;
}

.damage-value {
  font-weight: 700;
  color: var(--primary-blue);
}
```

---

#### 4.3 Spacing & Layout Polish
**Status:** 🔴 Not Started
**Effort:** Low (2 hours)
**Impact:** Medium

**Improvements:**
- More consistent spacing (8px grid)
- Larger card shadows for depth
- Consistent border radius (8px)
- Better hover states
- Smooth transitions (200ms)

```css
/* Spacing System */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

/* Shadows */
--shadow-sm: 0 2px 4px rgba(0,0,0,0.1);
--shadow-md: 0 4px 8px rgba(0,0,0,0.15);
--shadow-lg: 0 8px 16px rgba(0,0,0,0.2);

/* Transitions */
--transition-fast: 150ms ease;
--transition-normal: 200ms ease;
--transition-slow: 300ms ease;
```

---

#### 4.4 Icon System
**Status:** 🔴 Not Started
**Effort:** Low (1-2 hours)
**Impact:** Low-Medium

**Icons to Add:**
- 🎯 Damage
- 📊 Efficiency
- 🔫 Ranged
- ⚔️ Melee
- 🛡️ Defense
- 💰 Points
- 📌 Pin
- 🔗 Share
- 📋 Copy
- 📈 Chart

**Options:**
- Bootstrap Icons (already included)
- Font Awesome
- Custom SVG icons

---

## Implementation Phases

### Phase 1: Quick Wins (Week 1)
**Goal:** Immediate improvements, minimal effort

- [ ] Collapsible Control Panel
- [ ] Dashboard Summary Section
- [ ] Enhanced Color Palette
- [ ] Typography Updates
- [ ] Sticky Table Header

**Estimated Time:** 10-12 hours
**Expected Impact:** High - Better UX, cleaner layout

---

### Phase 2: Core Visualizations (Week 2-3)
**Goal:** Add primary charts

- [ ] Damage Curve Chart
- [ ] DPP Comparison Bars
- [ ] Weapon Breakdown Pie Chart
- [ ] Chart Selection/Toggle

**Estimated Time:** 15-20 hours
**Expected Impact:** Very High - New insights, visual patterns

---

### Phase 3: Advanced Features (Week 4-5)
**Goal:** Enhanced functionality

- [ ] Smart Filtering System
- [ ] Efficiency Heatmap
- [ ] Grid View Toggle
- [ ] Unit Comparison Mode
- [ ] Export/Share Features

**Estimated Time:** 20-25 hours
**Expected Impact:** High - Better usability, power features

---

### Phase 4: Polish & Refinement (Week 6)
**Goal:** Final touches

- [ ] Spacing & Layout Polish
- [ ] Icon Integration
- [ ] Interactive Chart Features
- [ ] Mobile Responsive Tweaks
- [ ] Performance Optimization

**Estimated Time:** 10-15 hours
**Expected Impact:** Medium - Professional finish

---

## Mockups & Wireframes

### Improved Full Layout

```
┌────────────────────────────────────────────────────────────┐
│ 40K Unit Efficiency Analyzer                    🌙 ⚙️ ℹ️   │
├────────────────────────────────────────────────────────────┤
│ ⚙️ Combat Scenario: T5, Re-roll Hits (1s), 5+ FNP  [▼]    │
└────────────────────────────────────────────────────────────┘

┌──────────────────────┬─────────────────────────────────────┐
│ 📊 Army Dashboard    │ 📈 Damage vs Toughness             │
│                      │                                     │
│ T'au Empire          │  30┤         ●●●                    │
│ 1500 pts | 8 units   │    │       ●     ●                  │
│                      │  20┤     ●         ●                │
│ Avg DPP: 0.187       │    │   ●             ●              │
│ Total Dmg: 234.5     │  10┤ ●                 ●●           │
│                      │    └─────────────────────> T        │
│ 🥇 Crisis (0.234)    │      T3  T5  T7  T9  T11           │
│ 🥈 Broadsides        │                                     │
│ 🥉 Riptide           │  ● Crisis  ● Broadsides  ● Riptide │
└──────────────────────┴─────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ 📋 Units Summary                [Grid View] [List] [⚙️]    │
│ 🔍 [Search...] [Role ▼] [Points: 0━━●━━━500] [Tier ▼]   │
├────────────────────────────────────────────────────────────┤
│ Name          │ Pts │ DPP ↓ │ 🔫 Ranged │ ⚔️ Melee │ Eff │
├────────────────────────────────────────────────────────────┤
│ 📌 Crisis     │ 150 │ 0.234 │   28.5    │   6.2   │ ████│
│ Broadsides    │ 180 │ 0.198 │   35.6    │   0.0   │ ████│
│ Riptide       │ 220 │ 0.156 │   30.2    │   4.2   │ ███ │
│ ...           │     │       │           │         │     │
└────────────────────────────────────────────────────────────┘

┌──────────────────┬──────────────────┬──────────────────────┐
│ 📦 Crisis Suits  │ 📦 Broadsides    │ 📦 Riptide          │
│ 150 pts          │ 180 pts          │ 220 pts             │
│ DPP: 0.234       │ DPP: 0.198       │ DPP: 0.156          │
│ ─────────────    │ ─────────────    │ ─────────────       │
│ [Stats Table]    │ [Stats Table]    │ [Stats Table]       │
│ [Abilities]      │ [Abilities]      │ [Abilities]         │
│ 📊 📌 🔗 📋      │ 📊 📌 🔗 📋      │ 📊 📌 🔗 📋         │
└──────────────────┴──────────────────┴──────────────────────┘
```

---

## Progress Tracking

### Completed Features
- ✅ Unit stats table
- ✅ Abilities display with expansion
- ✅ Weapon keyword tooltips
- ✅ Invulnerable save integration

### In Progress
- 🟡 None currently

### Not Started
- 🔴 Collapsible control panel
- 🔴 Dashboard section
- 🔴 Damage curve chart
- 🔴 DPP bar chart
- 🔴 Efficiency heatmap
- 🔴 Weapon breakdown chart
- 🔴 Smart filtering
- 🔴 Grid view toggle
- 🔴 Enhanced color palette

---

## Technical Considerations

### Chart Library Selection

**Option 1: Chart.js**
- ✅ Lightweight (~200KB)
- ✅ Good documentation
- ✅ All chart types needed
- ✅ Active development
- ❌ Less interactive than D3

**Option 2: Recharts**
- ✅ React-based (if migrating)
- ✅ Composable
- ✅ Good TypeScript support
- ❌ Requires React
- ❌ Larger bundle

**Option 3: D3.js**
- ✅ Most powerful
- ✅ Highly customizable
- ❌ Steep learning curve
- ❌ Larger codebase

**Recommendation:** Start with Chart.js for simplicity

### Performance Considerations

- **Lazy Loading:** Load charts only when visible
- **Memoization:** Cache calculation results
- **Virtual Scrolling:** For large unit lists
- **Debouncing:** On filter/search inputs
- **Web Workers:** For heavy calculations (optional)

### Browser Compatibility

- **Target:** Modern browsers (Chrome, Firefox, Safari, Edge)
- **ES6+:** Use modern JavaScript features
- **CSS Grid/Flexbox:** For layouts
- **No IE11 support:** Simplifies development

---

## Success Metrics

### User Experience
- [ ] Reduced time to find specific units (<5 seconds)
- [ ] Easier pattern identification (visual vs tables)
- [ ] Faster decision-making (dashboard overview)
- [ ] Better mobile usability (touch-friendly)

### Technical
- [ ] Page load time <2s
- [ ] Smooth scrolling (60fps)
- [ ] Charts render <500ms
- [ ] Responsive on all screen sizes

### Adoption
- [ ] Positive user feedback
- [ ] Increased session duration
- [ ] Feature usage (% using charts)

---

## Future Enhancements

Beyond this plan:
- **Dark Mode** - Complete theme support
- **Saved Scenarios** - Bookmark configurations
- **Unit Favorites** - Star/pin frequently used units
- **Comparison View** - Side-by-side unit comparison
- **Export Features** - Share via URL, CSV, PNG
- **Mobile App** - Native iOS/Android
- **Accessibility** - WCAG 2.1 AA compliance
- **Keyboard Shortcuts** - Power user features

---

*Last updated: 2025-10-25*
