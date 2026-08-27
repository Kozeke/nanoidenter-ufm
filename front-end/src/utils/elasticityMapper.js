// utils/modelStatsMapper.js
export function normalizeForceStats(stats, models) {
    console.log("normalizeModelStats")

    if (!stats || !models) return [];
    console.log("normalizeModelStats")
    const forceModel = Object.keys(models.f_models || {})[0];
    console.log("forceModel", forceModel)
    // ─────────────────────────────
    // FORCE MODELS
    // ─────────────────────────────
    if (forceModel) {
      switch (forceModel) {
        case "hertz":
          return [
            {
              label: "Young’s modulus",
              value: stats.force_params?.p0?.formatted,
              mean: stats.force_params?.p0?.mean,
              std: stats.force_params?.p0?.std
            },
          ];
  
        case "hertzeffective":
          return [
            {
              label: "Effective Young’s modulus",
              value: stats.force_params?.p0?.formatted,
              mean: stats.force_params?.p0?.mean,
              std: stats.force_params?.p0?.std
            },
          ];
  
        case "driftedhertz":
          return [
            {
              label: "Young’s modulus",
              value: stats.force_params?.p0?.formatted,
              mean: stats.force_params?.p0?.mean,
              std: stats.force_params?.p0?.std
            },
            {
              label: "Drift coefficient",
              value: stats.force_params?.p1?.formatted,
              mean: stats.force_params?.p1?.mean,
              std: stats.force_params?.p1?.std
            },
          ];
  
        default:
          break;
      }
    }
    return [];
  }
  
  export function normalizeElasticityStats(stats, models) {
    if (!stats || !models) return [];
    const elasticityModel = Object.keys(models.e_models || {})[0];
    
    // Normalize model name to lowercase for case-insensitive matching
    const normalizedModel = elasticityModel ? elasticityModel.toLowerCase() : null;
    
    // ─────────────────────────────
    // ELASTICITY MODELS
    // ─────────────────────────────
    if (normalizedModel) {
      // For Constant model, check both elasticity_params and force_params (backend may send it under force_params)
      const params = stats.elasticity_params || (normalizedModel === "constant" ? stats.force_params : null);
      
      if (params) {
        switch (normalizedModel) {
          case "bilayer":
            return [
              { label: "Cortex Young's modulus", value: params.p0?.formatted },
              { label: "Bulk Young's modulus", value: params.p1?.formatted },
              { label: "Cortex thickness", value: params.p2?.formatted },
            ];

          case "linemax":
            return [
              { label: "Average modulus", value: params.p0?.formatted },
              { label: "Median modulus", value: params.p1?.formatted },
              { label: "Max modulus", value: params.p2?.formatted },
              { label: "Min modulus", value: params.p3?.formatted },
            ];

          case "sigmoid":
          case "sigmoidnew":
            return [
              { label: "Higher modulus", value: params.p0?.formatted },
              { label: "Lower modulus", value: params.p1?.formatted },
              { label: "Thickness", value: params.p2?.formatted },
              { label: "Sharpness", value: params.p3?.formatted },
            ];

          case "constant":
            return [
              { label: "Young's modulus", value: params.p0?.formatted },
            ];

          default:
            console.warn(`Unknown elasticity model: ${elasticityModel} (normalized: ${normalizedModel})`);
            return [];
        }
      }
    }
    
    // Return empty array if no model or no stats
    return [];
  }