# Brain-Optimized City Layout Algorithm v2.0

## Implementation Summary

The `knowledge-to-city.js` script now generates city layouts that mimic an optimized brain:

### 1. Frequency-Weighted Positioning ✓
- **How**: Count mentions across all memory files (MEMORY.md, SOUL.md, memory/*.md)
- **Effect**: More frequent concepts positioned closer to core center
- **Formula**: `coreDistance = 10 + (1 - importance^0.4) * 45`
- **Result**: Correlation of -0.29 between importance and distance (important = closer)

### 2. Connection-Based Clustering ✓
- **How**: Build co-occurrence matrix from paragraphs/sections
- **Effect**: Concepts appearing together in same paragraphs cluster together
- **Algorithm**: Force-directed layout with:
  - Attraction between co-occurring entities (proportional to frequency)
  - Repulsion between close entities (prevents overlap)
  - 150 iterations with cooling schedule

### 3. Dynamic District Sizing ✓
- **How**: District radius scales with sqrt(entity_count) + expansion room
- **Effect**: Districts with more concepts have more area
- **Formula**: `radius = 25 + sqrt(proportion) * 40 + expansionBonus`
- **Result**: Memory district (176 entities) → radius 71; Core (23) → radius 51

### 4. Building Height = Importance ✓
- **Formula**: `importance = frequency × (0.5 + recencyScore) × sourceWeight`
- **Source Weights**:
  - SOUL.md: 5.0 (identity = tallest)
  - MEMORY.md: 3.0
  - memory/*.md: 1.5 × recency multiplier
- **Height tiers**:
  - Top 20%: 40-70 (skyscrapers)
  - Next tier: 25-40 (tall)
  - Medium: 12-25
  - Base: 5-15
- **SOUL.md bonus**: Buildings from SOUL.md get 1.4x height multiplier

### 5. Road/Bridge Generation ✓
- **How**: Connections from co-occurrence matrix
- **Types**:
  - `local`: Same district connections
  - `bridge`: Cross-district connections
- **Strength**: Normalized 0-1 based on co-occurrence count
- **Filtering**: Only connections with count ≥ 2 or strength > 0.3

## Output Format

```json
{
  "algorithm": "brain-optimized-v2",
  "districtBounds": { ... },  // Dynamic sizing
  "buildings": [
    {
      "id": "tool:kelly",
      "label": "Kelly",
      "district": "core",
      "x": 30.6, "z": -12.8,
      "height": 70,
      "importance": 62.91,
      "frequency": 14,
      "recencyScore": 1.0,
      "sourceScore": 3.0,
      "sources": ["MEMORY.md", "memory/2026-02-02.md"]
    }
  ],
  "connections": [
    {
      "from": "tool:opus",
      "to": "tool:sonnet", 
      "strength": 1.0,
      "type": "local"
    }
  ]
}
```

## Test Results (Feb 2, 2026)

- **301 buildings** generated from 13 memory files
- **641 co-occurrence pairs** detected
- **112 meaningful connections** after filtering
- **Top buildings by importance**:
  1. Kelly (core) - 70 height
  2. Dexter (core) - 48.6 height
  3. GitHub (infrastructure) - 42.9 height
  4. LUNR (trading) - 42.1 height
  5. Sonnet (core) - 42.1 height

## Running

```bash
cd ~/Projects/absalom-face
node scripts/knowledge-to-city.js
```

Output: `data/city-state.json`
