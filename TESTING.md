# Testing Guide - Battle Simulator Migration

## Quick Start

### To test the new battle simulator:

1. **Start the development server:**
   ```bash
   npm run dev
   ```
   This should open `http://localhost:3000` in your browser.

2. **Test basic navigation:**
   - The analyzer should load with the default army
   - You should see "Analyzing: [Army Name]" in the header
   - Click "Battle Simulator" button → should navigate to battle-sim.html
   - Click "Analyzer" button → should return to index.html

3. **Test state persistence:**
   - Load a different army from the dropdown
   - Click "Battle Simulator"
   - Both Army A and Army B should show the army you just loaded
   - Click "Analyzer"
   - The same army should still be loaded

## Comprehensive Test Suite

### ✅ Test 1: Basic Navigation

**Steps:**
1. Open `http://localhost:3000`
2. Click "Battle Simulator" button

**Expected:**
- Navigates to `battle-sim.html`
- Army A and Army B are both populated with the default army
- Configuration panel shows sensible defaults
- No console errors

---

### ✅ Test 2: Army Loading

**Steps:**
1. In analyzer, select "Imperial Knights - Optimized" from dropdown
2. Wait for analysis to complete
3. Verify army name shows in header
4. Click "Battle Simulator"

**Expected:**
- Battle sim loads
- Both armies show "Imperial Knights - Optimized"
- Points and unit counts match

---

### ✅ Test 3: Run Simulation

**Steps:**
1. In battle-sim page with two armies loaded
2. Configure settings:
   - Starting Distance: 24"
   - Initiative: Army A
   - Max Rounds: 3
3. Click "Run Battle Simulation"

**Expected:**
- Battlefield SVG appears
- Unit positions shown
- Battle log populates
- Summary shows damage dealt/taken
- No console errors

---

### ✅ Test 4: Phase Navigation

**Steps:**
1. After running simulation
2. Click "Next" button
3. Click "Prev" button
4. Click "Show All" button

**Expected:**
- Battlefield updates with unit positions
- Phase indicator updates
- Battle log highlights current phase
- Dead models shown with X marks

---

### ✅ Test 5: Interactive Features

**Steps:**
1. After running simulation
2. Hover over a movement entry in the battle log
3. Hover over an attack entry
4. Hover over a unit on the battlefield

**Expected:**
- Movement: Arrow appears showing from/to positions
- Attack: Line appears between attacker and defender
- Unit: Tooltip appears with unit name, role, models

---

### ✅ Test 6: File Upload

**Steps:**
1. In analyzer, drag & drop a custom army JSON file
2. Wait for army to load
3. Click "Battle Simulator"

**Expected:**
- Custom army appears in battle-sim
- All units and weapons present
- Can run simulation successfully

---

### ✅ Test 7: Converter Integration

**Steps:**
1. Open `http://localhost:3000/converter.html`
2. Upload a .roz or .json roster file
3. Click "Convert"
4. Should auto-navigate to analyzer

**Expected:**
- Converted roster loads in analyzer
- Success message appears
- Click "Battle Simulator"
- Converted roster available in battle-sim

---

### ✅ Test 8: Preference Persistence

**Steps:**
1. In analyzer, change toughness to T10
2. Change "Re-roll hits" to "Re-roll ones"
3. Navigate to battle-sim
4. Navigate back to analyzer

**Expected:**
- Toughness still T10
- Re-roll hits still "Re-roll ones"
- Analysis results reflect these settings

---

### ✅ Test 9: Multiple Army Selection

**Steps:**
1. In battle-sim, select different armies for A and B:
   - Army A: T'au - 800 Points
   - Army B: Imperial Knights
2. Click "Run Battle Simulation"

**Expected:**
- Simulation runs with asymmetric armies
- Different colored markers for each army
- Damage calculations account for different stats

---

### ✅ Test 10: Browser Refresh

**Steps:**
1. Load army in analyzer
2. Click F5 to refresh browser
3. Navigate to battle-sim
4. Click F5 to refresh browser

**Expected:**
- Army persists after refresh in analyzer
- Armies persist after refresh in battle-sim
- No data loss

---

## Visual Inspection Checklist

### Analyzer Page (index.html)

- [ ] Header shows "Battle Simulator" and "Converter" buttons
- [ ] Header shows current army name
- [ ] Battle Sim accordion section is removed
- [ ] No visual artifacts from removed code
- [ ] Tooltips work on unit cards
- [ ] Charts render correctly

### Battle Simulator Page (battle-sim.html)

- [ ] Two-column army selection looks clean
- [ ] Configuration panel is readable
- [ ] Battlefield SVG is centered and properly sized
- [ ] Unit dots are visible and sized appropriately
- [ ] Dead units show X marks clearly
- [ ] Battle log is scrollable
- [ ] Summary cards show correct colors for winner/loser

### Responsive Design

- [ ] Analyzer works on mobile (narrow screen)
- [ ] Battle-sim works on tablet
- [ ] Buttons don't overlap on small screens
- [ ] SVG scales on mobile

---

## Console Error Checks

### Expected: Zero Errors

Open browser DevTools (F12) and check Console tab:

**Should NOT see:**
- ❌ "Failed to fetch"
- ❌ "undefined is not a function"
- ❌ "Cannot read property of undefined"
- ❌ TypeScript errors
- ❌ 404 errors for missing files

**May see (these are OK):**
- ℹ️ Accordion state messages
- ℹ️ Army loaded messages
- ℹ️ State saved messages (if you added console.logs)

---

## Performance Checks

### Page Load Times (on localhost)

- Analyzer: Should load in <1 second
- Battle-sim: Should load in <1 second
- Converter: Should load in <1 second

### Simulation Speed

- Small armies (5-10 units): <50ms
- Medium armies (10-20 units): <100ms
- Large armies (20+ units): <200ms

To check: Open DevTools → Performance tab → Record → Run simulation

---

## Known Issues / Expected Behavior

### ✅ Expected (Not Bugs)

1. **First time loading:** May take slightly longer as browser caches assets
2. **Army vs itself:** Default battle sim scenario is army against itself
3. **Console logs:** May see info logs about state saving (normal)
4. **Simulation randomness:** With `randomCharge: false`, results are deterministic

### ❌ Report if You See These

1. Blank white page after navigation
2. "Army not found" errors
3. Simulation runs but battlefield is empty
4. Armies not loading from state
5. Settings resetting on every page load

---

## Automated Testing (Future)

We'll add these in the future:

```bash
# Unit tests
npm test

# E2E tests (when implemented)
npm run test:e2e

# Type checking
npm run type-check
```

---

## Debugging Tips

### Problem: Battle sim shows no armies

**Solution:**
1. Open DevTools → Application → Local Storage
2. Look for `w40k_app_state`
3. If missing, load army in analyzer first
4. If corrupted, delete it and reload page

### Problem: State not persisting

**Solution:**
1. Check if localStorage is enabled
2. Check browser isn't in incognito mode
3. Check storage quota (DevTools → Application → Storage)
4. Try: `localStorage.clear()` and reload

### Problem: Simulation errors

**Solution:**
1. Check console for error message
2. Verify both armies have units
3. Verify units have weapons
4. Check army JSON structure

### Problem: Visual artifacts

**Solution:**
1. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Clear browser cache
3. Check CSS is loading (DevTools → Network → CSS files)

---

## Reporting Issues

When reporting issues, please include:

1. **Browser & version:** e.g., "Chrome 120"
2. **Steps to reproduce:** Exact clicks/actions
3. **Expected behavior:** What should happen
4. **Actual behavior:** What actually happened
5. **Console errors:** Copy/paste from DevTools
6. **Screenshot:** If visual issue

File issues at: https://github.com/yourusername/w40k_analyze/issues

---

## Success Criteria

All tests pass if:

- ✅ No console errors
- ✅ Navigation works both directions
- ✅ State persists across pages
- ✅ Simulations run successfully
- ✅ UI is responsive and clean
- ✅ Performance is acceptable (<1s loads)

Happy testing! 🎯
