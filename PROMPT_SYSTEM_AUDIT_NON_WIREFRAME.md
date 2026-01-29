# Prompt Generation System Audit - Non-Wireframe Issues

## Critical Issues Found

### 1. **Custom Rules Placement May Conflict with Other Instructions** ⚠️ HIGH

**Problem:**
- Custom rules are placed AFTER trait rendering instructions
- Custom rules may contain instructions that contradict:
  - Trait rendering rules ("EXACTLY as specified" vs custom rule variations)
  - Art style instructions
  - Body visibility rules
  - Facing direction rules

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` line 1225-1228

**Current Order:**
1. Art style
2. Single character requirement
3. Format line
4. Art style (if not abstract)
5. Description
6. Assigned traits
7. **Trait rendering instructions** ("EXACTLY as specified")
8. **Custom rules** ← May override trait rendering
9. Detail instructions
10. Lighting
11. Colors
12. Border
13. Quality
14. Facing direction
15. Wireframe positioning

**Issue:** If custom rules say "character is just a baggy hoodie with darkness inside nothing else", this conflicts with:
- Trait descriptions that specify specific clothing/accessories
- Trait rendering that says "EXACTLY as specified"
- Body visibility rules

**Impact:** Custom rules may override trait rendering, causing traits to be ignored or modified.

---

### 2. **Trait Rendering Instructions Conflict with Abstract Style** ⚠️ MEDIUM

**Problem:**
- For abstract styles: "Traits are INSPIRATIONS, not literal requirements"
- But then: "Use traits as abstract INSPIRATIONS. NO literal representation required"
- Then custom rules might say: "character is just a baggy hoodie" (literal requirement)

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1185, 1218

**Conflict:**
- Abstract interpretation says traits are inspirations
- Custom rules might specify literal requirements
- Which takes priority?

**Impact:** Unclear whether traits should be literal or abstract, leading to inconsistent results.

---

### 3. **Pixel-Perfect Positioning Still Forces Frontal View** ⚠️ CRITICAL

**Problem:**
- When `pixelPerfect === true` but no wireframe config exists, the default positioning still forces frontal view:
  - "Head centerline aligned at exactly 50% width"
  - "Equal negative space on left and right"
  - "Both shoulders fully visible and symmetrical"
- This conflicts with facing direction (left, right, left-front, right-front)

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1094-1118 (headonly)
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1140-1158 (full body)

**Impact:** When pixel-perfect is enabled without wireframe config, facing direction is ignored and character is forced to face front.

---

### 4. **Single Character Requirement is Too Early and May Conflict** ⚠️ MEDIUM

**Problem:**
- Single character requirement is placed very early (line 1190)
- But custom rules might specify: "character is just a baggy hoodie" (which could be interpreted as no character)
- Abstract style says "non-representational" which might conflict with "character"

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` line 1190

**Current Text:**
```
⚠️ SINGLE CHARACTER REQUIREMENT: This image must contain EXACTLY ONE character. NO multiple characters, NO two characters, NO group shots, NO companions, NO sidekicks, NO background characters. ONLY ONE main character/subject in the entire image.
```

**Issue:** For abstract/non-representational art, "character" might not be the right term. Should it be "subject" or "main element"?

---

### 5. **Trait Descriptions Format May Be Confusing** ⚠️ LOW

**Problem:**
- Trait descriptions format: `LayerName: TraitName - Description`
- But if description is empty, it falls back to: `LayerName: TraitName - TraitName`
- This creates redundancy: "Hoodie: Concrete Jungle Camo - Concrete Jungle Camo"

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1164-1169

**Current Code:**
```typescript
const traitDescriptions = Object.entries(traits)
  .map(([layerName, trait]) => {
    const desc = trait.description || trait.name;
    return `${layerName}: ${trait.name} - ${desc}`;
  })
  .join('\n');
```

**Issue:** If `trait.description` is empty, it uses `trait.name` twice, creating redundant text.

---

### 6. **Border Requirements Placement May Be Too Late** ⚠️ MEDIUM

**Problem:**
- Border requirements are placed near the end (after lighting, colors, quality)
- But borders affect the entire composition and should be considered early
- Border placement instruction ("FULL BLEED") might conflict with frame positioning

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1263-1266

**Current Text:**
```
BORDER: ${borderReqs} - PLACEMENT: Outer edge EXACTLY at canvas edge, NO gaps, FULL BLEED.
```

**Issue:** If wireframe says "Top of head frame: 15% from top edge" but border needs to be at canvas edge, there's no conflict resolution.

---

### 7. **Quality Instructions Are Redundant with Art Style** ⚠️ LOW

**Problem:**
- Quality section repeats information already in art style
- For abstract: "Abstract artistic expression, flowing forms, dreamlike aesthetic" (already in art style)
- For pixel art: "Professional pixel art, crisp edges" (already in art style)
- For minimalist: "Professional flat design" (already in art style)

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1268-1283

**Impact:** Redundant instructions may dilute the prompt or create confusion about priority.

---

### 8. **FINAL Section Repeats Quality Section** ⚠️ LOW

**Problem:**
- FINAL section repeats what's already in QUALITY section
- For abstract: Both say "Abstract surreal style with non-representational elements"
- For pixel art: Both say "Authentic pixel art style"
- For minimalist: Both say "Clean minimalist aesthetic"

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1272, 1276, 1280

**Impact:** Redundant final instructions may not add value and could confuse the AI.

---

### 9. **Body Visibility Block Missing for Non-PFP Collections** ⚠️ MEDIUM

**Problem:**
- Body visibility block is only added for PFP collections
- But non-PFP collections might still benefit from framing instructions
- If a non-PFP collection has wireframe config, it's ignored

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` line 1047: `if (!isPfpCollection) return null;`
- `app/api/cron/process-generation-jobs-v2/route.ts` line 1302: Only includes if `isPfpCollection`

**Impact:** Wireframe config is completely ignored for non-PFP collections, even if user sets it.

---

### 10. **Abstract Style Orientation is Too Vague** ⚠️ MEDIUM

**Problem:**
- For abstract styles, orientation is simplified to: "General front-right orientation"
- But wireframe positioning (if exists) still includes specific frame dimensions
- This creates a mismatch: vague orientation + specific positioning

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1410-1427

**Current Text:**
```
ORIENTATION: General front-right orientation (interpreted abstractly)
COMPOSITION: Focus on head and upper area, interpreted through abstract forms.
```

**Issue:** "General" orientation doesn't give enough guidance, but then specific frame dimensions are added, creating confusion.

---

### 11. **Trait Prompt Field Not Used** ⚠️ HIGH

**Problem:**
- Traits have a `trait_prompt` field that contains AI-generated context
- But the prompt building only uses `trait.description` or `trait.name`
- The `trait_prompt` field is completely ignored

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1164-1169
- Trait interface includes `trait_prompt: string` but it's never used

**Impact:** Valuable AI-generated context for traits is being discarded, potentially reducing generation quality.

---

### 12. **Custom Rules May Override Everything** ⚠️ CRITICAL

**Problem:**
- Custom rules are placed after trait rendering instructions
- Custom rules might say: "character is just a baggy hoodie with darkness inside nothing else"
- This could override:
  - All trait descriptions
  - Art style instructions
  - Body visibility rules
  - Facing direction

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` line 1225

**Issue:** No priority system. Custom rules might be interpreted as overriding everything that came before, or might be ignored. Unclear which.

---

### 13. **Colors and Lighting Descriptions May Conflict with Art Style** ⚠️ MEDIUM

**Problem:**
- Art style might specify: "muted tones with bursts of brightness"
- Colors description might say: "rich textures featuring muted tones with bursts of brightness"
- Lighting description might say: "dramatic chiaroscuro"
- These are placed separately and may create redundancy or conflicts

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1253-1261

**Issue:** If art style already describes colors/lighting, adding separate color/lighting sections might be redundant or conflicting.

---

### 14. **Missing Priority/Order System** ⚠️ CRITICAL

**Problem:**
- No explicit priority system for conflicting instructions
- Custom rules vs trait rendering vs art style - which wins?
- Facing direction vs pixel-perfect positioning - which wins?
- Abstract interpretation vs literal custom rules - which wins?

**Location:** Throughout the prompt building function

**Impact:** AI may interpret conflicting instructions inconsistently, leading to unpredictable results.

---

### 15. **Description Field May Be Redundant** ⚠️ LOW

**Problem:**
- Collection description is included in prompt
- But description is meant for launchpad/marketing, not generation
- Description might say: "A collection that captures the essence of street art"
- This is already covered by art style and traits

**Location:**
- `app/api/cron/process-generation-jobs-v2/route.ts` lines 1207-1210

**Issue:** Marketing description might not be useful for image generation and could add noise.

---

## Recommended Fixes

### Fix 1: Add Priority System
Add explicit priority markers:
- `[PRIORITY 1]` for facing direction and body visibility
- `[PRIORITY 2]` for art style and custom rules
- `[PRIORITY 3]` for trait rendering
- `[PRIORITY 4]` for colors, lighting, borders

### Fix 2: Use Trait Prompt Field
Include `trait_prompt` in trait descriptions if available:
```typescript
const desc = trait.trait_prompt || trait.description || trait.name;
```

### Fix 3: Clarify Custom Rules Scope
Add note: "Custom rules apply to overall composition and character design, but individual traits should still be rendered as specified unless custom rules explicitly override them."

### Fix 4: Fix Pixel-Perfect Default Positioning
Remove frontal-forcing instructions from pixel-perfect defaults when facing direction is not "front".

### Fix 5: Move Custom Rules Earlier
Place custom rules right after art style, before trait rendering, so traits can be interpreted within custom rules context.

### Fix 6: Remove Redundant Sections
Consolidate QUALITY and FINAL sections, or remove FINAL if it's just repeating QUALITY.

### Fix 7: Support Wireframe for Non-PFP
Allow wireframe config to work for non-PFP collections, just without body visibility restrictions.

### Fix 8: Improve Abstract Orientation
For abstract styles with wireframe, use more specific orientation guidance that works with frame dimensions.

### Fix 9: Clarify Single Character Requirement
For abstract styles, change "character" to "subject" or "main element" to be more appropriate.

### Fix 10: Add Conflict Resolution Notes
Add explicit notes when instructions might conflict, explaining which takes priority.

---

### 16. **Wireframe Block Was Missing (FIXED)** ⚠️ CRITICAL

**Problem:**
- During code reordering, the wireframe positioning block addition was accidentally removed
- Function was returning without adding wireframe block
- This meant wireframe config was completely ignored

**Status:** ✅ FIXED - Wireframe block addition restored at end of function

---

## Summary

**Main Issues:**
1. **No priority system** - conflicting instructions have unclear priority
2. **Custom rules placement** - may override everything or be ignored
3. **Trait prompt field unused** - valuable context discarded
4. **Pixel-perfect forces frontal** - conflicts with facing direction
5. **Redundant sections** - QUALITY and FINAL repeat information
6. **Wireframe block was missing** - ✅ FIXED

**Critical Priority:**
1. ✅ Fix wireframe block missing (FIXED)
2. Fix pixel-perfect default positioning (forces frontal view)
3. Add priority system for conflicting instructions
4. Use trait_prompt field
5. Clarify custom rules scope and placement

