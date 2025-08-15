import React from "react";
import {
  Drawer,
  Typography,
  Card,
  CardContent,
  IconButton,
  Stack,
  Tooltip,
  TextField,
  Fade,
  Box,
  Checkbox,
  FormControlLabel
} from "@mui/material";
import { Delete, Close } from "@mui/icons-material";

const FilterCard = ({
  filterName,
  filterData,
  capitalizeFilterName,
  handleRemoveFilter,
  handleFilterChange,
  type,
  color = "#3DA58A"
}) => (
  <Card
    sx={{
      bgcolor: "background.default",
      boxShadow: 2,
      transition: "transform 0.2s, box-shadow 0.2s",
      "&:hover": {
        transform: "scale(1.02)",
        boxShadow: 4,
      },
    }}
  >
    <CardContent sx={{ p: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontSize: 14, color }}>
          {capitalizeFilterName(filterName)}
        </Typography>
        <Tooltip title="Remove Filter">
          <IconButton
            size="small"
            color="error"
            onClick={() => handleRemoveFilter(filterName, type)}
            aria-label={`Remove ${capitalizeFilterName(filterName)} filter`}
          >
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {Object.keys(filterData || {}).map((param) => (
        <Box key={param} sx={{ mt: 0.5 }}>
          <Typography variant="caption" sx={{ display: "block", fontSize: 12 }}>
            {param.replace("_", " ")}
          </Typography>
          <TextField
            type="number"
            size="small"
            value={filterData[param] ?? ""}
            onChange={(e) =>
              handleFilterChange(
                filterName,
                param,
                parseFloat(e.target.value),
                type
              )
            }
            fullWidth
            sx={{ "& .MuiInputBase-input": { fontSize: 13, p: 0.5 } }}
          />
        </Box>
      ))}
    </CardContent>
  </Card>
);

const FilterStatusSidebar = ({
  regularFilters,
  cpFilters,
  forceModels,
  elasticityModels,
  capitalizeFilterName,
  handleRemoveFilter,
  handleFilterChange,
  toggleFilters,
  isOpen,
  selectedForceModel,
  selectedParameters,
  onParameterChange,
  showParameters,
  setShowParameters,
  selectedElasticityModel,
  selectedElasticityParameters,
  onElasticityParameterChange,
  showElasticityParameters,
  setShowElasticityParameters
}) => {
  // Define parameter options for each force model
  const getParameterOptions = (forceModel) => {
    switch (forceModel) {
      case "hertz":
        return ["E[Pa]"];
      case "hertzeffective":
        return ["E[Pa]"];
      case "driftedhertz":
        return ["E[Pa]", "m[N/m]"];
      default:
        return [];
    }
  };

  // Define parameter options for each elasticity model
  const getElasticityParameterOptions = (elasticityModel) => {
    switch (elasticityModel) {
      case "linemax":
        return ["E[Pa]", "M<E>[Pa]", "Emax[Pa]", "Emin"];
      case "bilayer":
        return ["E0[Pa]", "Eb[Pa]", "d[nm]"];
      case "constant":
        return ["E[Pa]"];
      case "sigmoid":
        return ["EH[Pa]", "EL[Pa]", "T[nm]", "k[Pa/nm]"];
      default:
        return [];
    }
  };

  const parameterOptions = getParameterOptions(selectedForceModel);
  const elasticityParameterOptions = getElasticityParameterOptions(selectedElasticityModel);

  // Debug logging
  console.log("selectedElasticityModel:", selectedElasticityModel);
  console.log("elasticityParameterOptions:", elasticityParameterOptions);

  const handleParameterChange = (parameter) => {
    const newSelectedParams = selectedParameters.includes(parameter)
      ? selectedParameters.filter(p => p !== parameter)
      : [...selectedParameters, parameter];
    
    onParameterChange(newSelectedParams);
  };

  const handleElasticityParameterChange = (parameter) => {
    // For elasticity models, allow multiple parameter selection like force models
    const newSelectedParams = selectedElasticityParameters.includes(parameter)
      ? selectedElasticityParameters.filter(p => p !== parameter)
      : [...selectedElasticityParameters, parameter];
    
    onElasticityParameterChange(newSelectedParams);
  };

  // Check if any filters are applied or if view parameters should be shown
  const hasFilters =
    Object.keys(regularFilters || {}).length > 0 ||
    Object.keys(cpFilters || {}).length > 0 ||
    Object.keys(forceModels || {}).length > 0 ||
    Object.keys(elasticityModels || {}).length > 0 ||
    selectedForceModel ||
    selectedElasticityModel;

  return (
    <Fade in={isOpen}>
      <Drawer
        anchor="right"
        variant="persistent"
        open={hasFilters}
        sx={{
          width: 200,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: 200,
            height: "100vh",
            bgcolor: "background.paper",
            borderLeft: 1,
            borderColor: "divider",
            p: 1,
            boxSizing: "border-box",
            zIndex: 1002, // Above FiltersComponent
            overflowY: "auto",
          },
        }}
      >
        <Typography
          variant="h6"
          sx={{ fontSize: 16, fontWeight: "medium", mb: 1 }}
        >
          Applied Filters
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6" sx={{ fontSize: 14, fontWeight: "medium" }}>
            Filters
          </Typography>
          <IconButton onClick={toggleFilters} size="small" color="error">
            <Close fontSize="small" />
          </IconButton>
        </Box>
        <Stack direction="column" spacing={1}>
          {/* View Force Parameters */}
          {selectedForceModel && (
            <Card
              sx={{
                bgcolor: "background.default",
                boxShadow: 2,
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "scale(1.02)",
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontSize: 14, color: "#3DA58A" }}>
                    {selectedForceModel ? `View ${selectedForceModel.charAt(0).toUpperCase() + selectedForceModel.slice(1)} Parameters` : "View Force Parameters"}
                  </Typography>
                  <Checkbox
                    checked={showParameters}
                    onChange={(e) => setShowParameters(e.target.checked)}
                    size="small"
                  />
                </Box>
                {showParameters && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {parameterOptions.length > 0 ? (
                      parameterOptions.map((parameter) => (
                        <FormControlLabel
                          key={parameter}
                          control={
                            <Checkbox
                              checked={selectedParameters.includes(parameter)}
                              onChange={() => handleParameterChange(parameter)}
                              size="small"
                              sx={{ padding: "2px" }}
                            />
                          }
                          label={
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "12px",
                                color: "#555",
                              }}
                            >
                              {parameter}
                            </Typography>
                          }
                          sx={{ margin: "0", padding: "2px" }}
                        />
                      ))
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: "12px",
                          color: "#999",
                          fontStyle: "italic",
                        }}
                      >
                        No parameters available for this force model
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* View Elasticity Parameters */}
          {selectedElasticityModel && (
            <Card
              sx={{
                bgcolor: "background.default",
                boxShadow: 2,
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "scale(1.02)",
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontSize: 14, color: "#FF9800" }}>
                    {selectedElasticityModel ? `View ${selectedElasticityModel.charAt(0).toUpperCase() + selectedElasticityModel.slice(1)} Parameters` : "View Elasticity Parameters"}
                  </Typography>
                  <Checkbox
                    checked={showElasticityParameters}
                    onChange={(e) => setShowElasticityParameters(e.target.checked)}
                    size="small"
                  />
                </Box>
                {showElasticityParameters && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {elasticityParameterOptions.length > 0 ? (
                      elasticityParameterOptions.map((parameter) => (
                        <FormControlLabel
                          key={parameter}
                          control={
                            <Checkbox
                              checked={selectedElasticityParameters.includes(parameter)}
                              onChange={() => handleElasticityParameterChange(parameter)}
                              size="small"
                              sx={{ padding: "2px" }}
                            />
                          }
                          label={
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "12px",
                                color: "#555",
                              }}
                            >
                              {parameter}
                            </Typography>
                          }
                          sx={{ margin: "0", padding: "2px" }}
                        />
                      ))
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: "12px",
                          color: "#999",
                          fontStyle: "italic",
                        }}
                      >
                        No parameters available for this elasticity model
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Regular Filters */}
          {Object.keys(regularFilters || {}).map((filterName) => (
            <FilterCard
              key={filterName}
              filterName={filterName}
              filterData={regularFilters[filterName]}
              capitalizeFilterName={capitalizeFilterName}
              handleRemoveFilter={handleRemoveFilter}
              handleFilterChange={handleFilterChange}
              type="regular"
            />
          ))}

          {/* CP Filters */}
          {Object.keys(cpFilters || {}).map((filterName) => (
            <FilterCard
              key={filterName}
              filterName={filterName}
              filterData={cpFilters[filterName]}
              capitalizeFilterName={capitalizeFilterName}
              handleRemoveFilter={handleRemoveFilter}
              handleFilterChange={handleFilterChange}
              type="cp"
              color="#000000" // Example differentiation
            />
          ))}

          {/* Force Models */}
          {Object.keys(forceModels || {}).map((filterName) => (
            <FilterCard
              key={filterName}
              filterName={filterName}
              filterData={forceModels[filterName]}
              capitalizeFilterName={capitalizeFilterName}
              handleRemoveFilter={handleRemoveFilter}
              handleFilterChange={handleFilterChange}
              type="force"
            />
          ))}

          {/* Elasticity Models */}
          {Object.keys(elasticityModels || {}).map((filterName) => (
            <FilterCard
              key={filterName}
              filterName={filterName}
              filterData={elasticityModels[filterName]}
              capitalizeFilterName={capitalizeFilterName}
              handleRemoveFilter={handleRemoveFilter}
              handleFilterChange={handleFilterChange}
              type="elasticity"
            />
          ))}
        </Stack>
      </Drawer>
    </Fade>
  );
};

export default FilterStatusSidebar;