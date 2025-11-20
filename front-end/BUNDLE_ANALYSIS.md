# Bundle Analysis Guide

This project uses `source-map-explorer` to analyze bundle size and identify optimization opportunities.

## Setup

The tool is already installed. To analyze your bundle:

## Steps

1. **Build the production bundle:**
   ```bash
   npm run build
   ```

2. **Run the analysis:**
   ```bash
   npm run analyze
   ```
   This will show a text-based breakdown in the terminal.

3. **Generate HTML report (recommended):**
   ```bash
   npm run analyze:html
   ```
   This creates `bundle-report.html` which you can open in a browser for a visual treemap.

## What to Look For

### Large Dependencies
- **ECharts** - Should be optimized with modular imports (already done)
- **Material-UI** - Consider tree-shaking unused components
- **Lodash** - Should use individual imports (already done for debounce)
- **React/React-DOM** - Usually can't be optimized much

### Code Splitting Opportunities
- Large components that could be lazy-loaded
- Unused imports
- Duplicate dependencies

### Optimization Targets
- Any dependency > 100KB should be reviewed
- Look for duplicate code across chunks
- Check if vendor bundles can be split further

## Expected Results

After our optimizations:
- ECharts should be smaller (modular imports)
- Lodash should be minimal (individual imports)
- Components should be code-split (lazy loading)

## Next Steps After Analysis

1. Identify the largest dependencies
2. Check if they can be:
   - Tree-shaken better
   - Lazy-loaded
   - Replaced with lighter alternatives
   - Split into separate chunks

