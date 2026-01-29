# Infinite Loop Analysis - Launchpad Collection Page

## 10 SEPARATE POSSIBLE LOOP CAUSES

### 1. **CRITICAL: `activePhase` computed on every render (Line 995)**
```typescript
const activePhase = collection?.phases?.find(p => p.is_active)
```
**Problem**: This is computed on EVERY render. Used in:
- Line 1043: `handleQuantityChange` depends on `[activePhase, whitelistStatus, userMintStatus]`
- Line 1070: `handleQuantityBlur` depends on `[activePhase, whitelistStatus, userMintStatus]`
- Line 1087: `handleMaxClick` depends on `[activePhase, whitelistStatus, userMintStatus]`
- Passed to child components (MintDetailsSection, PhaseList)

**Loop**: When `collection` changes → `activePhase` is new object → callbacks recreated → child components re-render → might trigger parent re-render → loop

---

### 2. **CRITICAL: `.map()` always creates new array even when returning same objects (Line 197-219)**
```typescript
updatedPhases = prev.phases?.map(p => {
  // ... returns p (same object) or new object
  return p  // Same object reference
})
```
**Problem**: Even when returning `p` (same object), `.map()` ALWAYS creates a NEW array reference. This means `updatedPhases` is always a new array, even if all phase objects are identical.

**Loop**: New array → `phasesChanged` might be true → new collection object → collection changes → effects trigger → loop

---

### 3. **CRITICAL: Direct ref updates in render (Lines 60-62, 348-363, 559-564)**
```typescript
if (collection?.phases !== phasesRef.current) {
  phasesRef.current = collection?.phases
}
```
**Problem**: These run on EVERY render. While "safe" for refs, they can cause:
- Side effects if other code reads these refs during render
- React Strict Mode double-rendering issues
- Potential timing issues with effects

**Loop**: Render → ref update → next render sees different ref → might trigger effects → loop

---

### 4. **CRITICAL: `currentActivePhaseId` computed on every render (Line 456)**
```typescript
const currentActivePhaseId = collection?.phases?.find(p => p.is_active)?.id || null
```
**Problem**: Computed on every render, then used in effect (line 468). Even though we use a ref, the computation happens every time.

**Loop**: Collection changes → `currentActivePhaseId` recalculated → effect sees "new" value → effect runs → might update state → loop

---

### 5. **CRITICAL: `pollUpdates` function not memoized (Line 129)**
```typescript
const pollUpdates = async () => {
  // ... uses currentAddress directly (line 134)
}
```
**Problem**: Function is recreated on every render. Called from:
- Line 331: `setTimeout(() => pollUpdates(), 100)` in initial load effect
- Line 380: `pollUpdates().then(() => scheduleNextPoll())` in polling effect

**Loop**: If polling effect somehow re-runs → gets new `pollUpdates` function → might cause closure issues → loop

---

### 6. **CRITICAL: Audio effect depends on `collection?.audio_url` (Line 408-449)**
```typescript
useEffect(() => {
  // ...
}, [collection?.audio_url, audioVolume])
```
**Problem**: `collection?.audio_url` changes when collection object reference changes, even if the URL value is the same.

**Loop**: Collection updates → new object → `collection?.audio_url` is "new" → effect runs → might update state → loop

---

### 7. **CRITICAL: Image dimensions effect depends on object properties (Line 489-514)**
```typescript
useEffect(() => {
  // ...
}, [collection?.banner_image_url, collection?.mobile_image_url])
```
**Problem**: These are object properties. When `collection` object reference changes, these properties are "new" even if values are same.

**Loop**: Collection updates → new object → properties are "new" → effect runs → `setImageDimensions` → might trigger other effects → loop

---

### 8. **CRITICAL: Whitelist check effect uses computed value inside (Line 466-485)**
```typescript
useEffect(() => {
  const phaseChanged = currentActivePhaseId !== activePhaseIdRef.current
  // Uses currentActivePhaseId which is computed from collection
}, [currentAddress, stableActivePhaseId])
```
**Problem**: Effect depends on `stableActivePhaseId` but uses `currentActivePhaseId` inside, which is computed from `collection?.phases?.find()`. The computation happens on every render.

**Loop**: Collection changes → `currentActivePhaseId` recalculated → effect logic runs → calls `checkWhitelistStatus` → might update state → loop

---

### 9. **CRITICAL: `loadMintHistory` callback depends on `currentAddress` (Line 970-987)**
```typescript
const loadMintHistory = useCallback(async () => {
  // ...
}, [currentAddress, collectionId])
```
**Problem**: Effect on line 989 depends on `loadMintHistory`. When `currentAddress` changes, `loadMintHistory` is recreated, causing effect to re-run.

**Loop**: `currentAddress` changes → `loadMintHistory` recreated → effect runs → might update state → loop

---

### 10. **CRITICAL: `setCollection` in `loadCollection` always creates new object (Line 531)**
```typescript
setCollection(data.collection)
```
**Problem**: `data.collection` from API is always a new object, even if data is identical. This triggers all collection-dependent effects.

**Loop**: `loadCollection` called → `setCollection(newObject)` → collection changes → all effects run → might call `loadCollection` again → loop

---

## ADDITIONAL SUSPECTS:

### 11. **Child component re-renders causing parent re-render**
- `MintDetailsSection` receives `activePhase` which is new on every render
- `PhaseList` receives `collection` which might be new object
- These might trigger callbacks that update parent state

### 12. **`useWallet` hook might be causing re-renders**
- Line 20: `const { isConnected, currentAddress, ... } = useWallet()`
- If this hook updates frequently, it causes component re-render
- Re-render → all computed values recalculated → effects might run → loop

### 13. **`setCountdown` called every second (Line 110)**
- Even with change detection, if countdown values change every second
- This causes re-render every second
- Re-render → all computed values recalculated → might trigger effects → loop

### 14. **`handleQuantityChange` etc. callbacks recreated when `activePhase` changes**
- These are passed to `MintDetailsSection`
- When they're recreated, child component sees "new" props
- Child re-renders → might trigger parent callbacks → loop

### 15. **`checkWhitelistStatus` uses JSON.stringify for comparison (Lines 613, 618)**
- JSON.stringify is expensive and creates new strings
- Comparison might fail due to property order differences
- Always returns "different" → always updates state → loop

---

## ROOT CAUSE ANALYSIS:

The PRIMARY issue is likely **#1 + #2 combined**:
- `activePhase` is computed on every render
- Callbacks depend on `activePhase`
- When collection updates (even with same data), `activePhase` is a "new" object
- Callbacks are recreated
- Child components receive new callback props
- Child components re-render
- This might trigger parent re-renders or state updates
- Loop continues

The SECONDARY issue is **#2**:
- `.map()` always creates new array
- Even when returning same objects, array reference is new
- This causes `phasesChanged` to be true even when nothing changed
- New collection object created
- All collection-dependent effects run
- Loop continues

