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
   // ─────────────────────────────
    // ELASTICITY MODELS
    // ─────────────────────────────
    if (elasticityModel && stats.elasticity_params) {
      switch (elasticityModel) {
        case "bilayer":
          return [
            { label: "Cortex Young's modulus", value: stats.elasticity_params.p0?.formatted },
            { label: "Bulk Young's modulus", value: stats.elasticity_params.p1?.formatted },
            { label: "Cortex thickness", value: stats.elasticity_params.p2?.formatted },
          ];
  
        case "linemax":
          return [
            { label: "Average modulus", value: stats.elasticity_params.p0?.formatted },
            { label: "Median modulus", value: stats.elasticity_params.p1?.formatted },
            { label: "Max modulus", value: stats.elasticity_params.p2?.formatted },
            { label: "Min modulus", value: stats.elasticity_params.p3?.formatted },
          ];
  
        case "sigmoid":
          return [
            { label: "Higher modulus", value: stats.elasticity_params.p0?.formatted },
            { label: "Lower modulus", value: stats.elasticity_params.p1?.formatted },
            { label: "Thickness", value: stats.elasticity_params.p2?.formatted },
            { label: "Sharpness", value: stats.elasticity_params.p3?.formatted },
          ];
  
        default:
          return [];
      }
    }
  }