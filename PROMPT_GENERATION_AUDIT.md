# Prompt Generation System Audit Report

## Critical Issues Found

### 1. **Wireframe Positioning Conflicts with Facing Direction** ⚠️ CRITICAL

**Problem:**
- Wireframe positioning says: "Head centerline aligned at exactly 50% width", "Equal negative space on left and right", "No yaw or head tilt", "Both shoulders fully visible and symmetrical"
- This forces a **fully frontal, centered, symmetrical** view
- But facing direction (e.g., "right-front") requires: "Body rotated 15–25° toward the RIGHT edge", "Right shoulder is closer to the viewer than the left"
- **These instructions directly conflict!**

**Location:** 
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1083-1105 (wireframe block)
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1312-1433 (facing direction block)

**Impact:** When wireframe config exists AND facing direction is not "front", the AI receives contradictory instructions. The wireframe forces frontal symmetry while facing direction requires angled rotation.

---

### 2. **Wireframe Includes Unnecessary Facial Feature Details** ⚠️ HIGH

**Problem:**
- User only wants: head dimensions, shoulder/chest frame positioning
- But wireframe includes: eye line, nose tip, mouth center positions
- These facial feature positions are not needed for frame composition

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1091-1094

**Current Output:**
```
VERTICAL ANCHORS (LOCKED):
– Top of head: 15% from top edge.
– Eye line: 38% from top edge.        ← NOT NEEDED
– Nose tip: 50% from top edge.        ← NOT NEEDED
– Mouth center: 58% from top edge.    ← NOT NEEDED
– Shoulder line: 74% from top edge.
– Bottom crop: 84% from top edge.
```

**User Expectation:**
```
FRAME DIMENSIONS:
– Top of head: 15% from top edge.
– Head dimensions: 48% width × 68% height.
– Shoulder width: 36% of canvas width.
– Shoulder line: 74% from top edge.
– Bottom crop: 84% from top edge.
```

---

### 3. **Wireframe Forces Frontal View Regardless of Facing Direction** ⚠️ CRITICAL

**Problem:**
- Wireframe says: "Head centerline aligned at exactly 50% width" (forces center)
- Wireframe says: "Both shoulders fully visible and symmetrical" (forces frontal)
- Wireframe says: "No yaw or head tilt unless explicitly stated" (prevents rotation)
- But facing direction "right-front" needs: angled body, asymmetrical shoulders, rotation

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1086-1089, 1097-1098

**Impact:** When facing direction is NOT "front", the wireframe positioning overrides it and forces a frontal view.

---

### 4. **Instruction Order Problem** ⚠️ MEDIUM

**Problem:**
- Wireframe positioning block is added BEFORE facing direction block
- In prompt generation, earlier instructions often have more weight
- Wireframe's "frontal" instructions may override facing direction

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` line 1307 (wireframe added)
- `app/api/cron/process-generation-jobs-v2/route.ts` line 1432 (facing direction added)

**Current Order:**
1. Wireframe positioning (forces frontal)
2. Facing direction (requires angled)

**Should Be:**
1. Facing direction (establishes orientation)
2. Wireframe positioning (applies within that orientation)

---

### 5. **Wireframe Should Only Define Frame Boundaries, Not Pose** ⚠️ HIGH

**Problem:**
- Wireframe should define WHERE the character frame is positioned (top, left, right, bottom boundaries)
- Wireframe should NOT define HOW the character is oriented (frontal vs angled)
- Current wireframe mixes frame positioning with pose/orientation instructions

**What Wireframe SHOULD Say:**
```
FRAME POSITIONING (for consistent composition):
– Head frame top edge: 15% from canvas top
– Head frame dimensions: 48% width × 68% height
– Shoulder frame width: 36% of canvas width
– Shoulder frame position: 74% from canvas top
– Bottom crop: 84% from canvas top

Note: Character facing direction is set separately and takes priority over frame positioning.
```

**What Wireframe SHOULD NOT Say:**
- "Head centerline aligned at exactly 50% width" (forces center)
- "Equal negative space on left and right" (forces symmetry)
- "No yaw or head tilt" (prevents rotation)
- "Both shoulders fully visible and symmetrical" (forces frontal)

---

### 6. **Abstract Style Handling Inconsistency** ⚠️ MEDIUM

**Problem:**
- For abstract styles, facing direction is simplified to "General front-right orientation"
- But wireframe positioning is still included with full frontal instructions
- This creates confusion: simplified orientation + detailed frontal positioning

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1436-1448 (abstract orientation)
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1302-1308 (wireframe inclusion)

---

## Recommended Fixes

### Fix 1: Simplify Wireframe to Only Frame Dimensions
Remove facial feature positions (eye line, nose, mouth) and keep only:
- Top of head position
- Head dimensions (width × height)
- Shoulder width
- Shoulder line position
- Bottom crop position

### Fix 2: Make Wireframe Orientation-Agnostic
Remove all orientation/pose instructions from wireframe:
- Remove "Head centerline aligned at exactly 50% width"
- Remove "Equal negative space on left and right"
- Remove "No yaw or head tilt"
- Remove "Both shoulders fully visible and symmetrical"
- Remove "Camera at eye level, straight-on"

### Fix 3: Add Note That Facing Direction Takes Priority
Add explicit note in wireframe block:
"Note: Character facing direction is set separately and takes priority over frame positioning. Frame dimensions apply within the chosen orientation."

### Fix 4: Reorder Instructions
Move facing direction block BEFORE wireframe positioning block so orientation is established first.

### Fix 5: Adjust Wireframe for Angled Views
When facing direction is NOT "front", adjust wireframe instructions to allow for:
- Asymmetrical shoulder positioning
- Head offset from center (if needed for composition)
- Rotation within the frame boundaries

---

## Summary

**Main Issue:** Wireframe positioning is trying to do TWO jobs:
1. Define frame boundaries (what user wants) ✅
2. Control character orientation/pose (conflicts with facing direction) ❌

**Solution:** Wireframe should ONLY define frame boundaries. Facing direction should control orientation. Frame dimensions should apply WITHIN the chosen orientation, not force a specific orientation.

