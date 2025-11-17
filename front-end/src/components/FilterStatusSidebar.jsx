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
  Slider,
  Fade,
  Box,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  CircularProgress,
  useTheme,
  useMediaQuery
} from "@mui/material";
import { Delete, Close } from "@mui/icons-material";

// Drawer width constant for consistent spacing across components
const DRAWER_WIDTH = 300;

// --- Unified UI tokens (match Dashboard/Filters) ---
const sidebarPaperSx = {
  width: DRAWER_WIDTH,
  height: "100vh",
  bgcolor: "#fafbff",
  borderLeft: "1px solid #e9ecf5",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  fontFamily: "'Roboto', sans-serif",
};

const headerBarSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 1,
  px: 1.25,
  py: 1,
  mb: 1,
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderBottom: "1px solid #e9ecf5",
  boxShadow: "0 6px 14px rgba(20, 20, 43, 0.06)",
};

const titleSx = { fontSize: 16, fontWeight: 700, color: "#1d1e2c", whiteSpace: "nowrap" };

const cardSx = {
  bgcolor: "#ffffff",
  border: "1px solid #e9ecf5",
  borderRadius: "10px",
  boxShadow: "0 6px 14px rgba(20, 20, 43, 0.06)",
  transition: "transform .15s ease, box-shadow .15s ease",
  "&:hover": { transform: "translateY(-1px)", boxShadow: "0 10px 22px rgba(20,20,43,.08)" },
  mb: 1,
};

const sectionLabelSx = (color = "#3DA58A") => ({
  fontSize: 14,
  fontWeight: 700,
  color,
  whiteSpace: "nowrap",
});

const captionSx = { display: "block", fontSize: 12, mb: 0.25, whiteSpace: "nowrap" };

const inputCompactSx = {
  "& .MuiInputBase-input": { fontSize: 13, py: 0.75 },
  "& .MuiOutlinedInput-root": { height: 34 },
};

const sliderSx = {
  color: "#3DA58A",
  "& .MuiSlider-thumb": { width: 16, height: 16 },
  "& .MuiSlider-track": { height: 4 },
  "& .MuiSlider-rail": { height: 4 },
};

const closeBtnHandlers = {
  onMouseDown: (e) => (e.currentTarget.style.transform = "translateY(1px)"),
  onMouseUp:   (e) => (e.currentTarget.style.transform = "translateY(0)"),
  onMouseLeave:(e) => (e.currentTarget.style.transform = "translateY(0)"),
};

const FilterCard = ({
  filterName,
  filterData,
  capitalizeFilterName,
  handleRemoveFilter,
  handleFilterChange,
  type,
  color = "#3DA58A"
}) => (
  <Card sx={cardSx}>
    <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="subtitle2" sx={sectionLabelSx(color)}>
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
          <Typography variant="caption" sx={captionSx}>
            {param.replace("_", " ")}
          </Typography>
          <TextField
            type="number"
            size="small"
            margin="dense"
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
            sx={inputCompactSx}
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
  selectedForceModel,
  selectedParameters,
  onParameterChange,
  showParameters,
  setShowParameters,
  selectedElasticityModel,
  selectedElasticityParameters,
  onElasticityParameterChange,
  showElasticityParameters,
  setShowElasticityParameters,
  setZeroForce,
  onSetZeroForceChange,
  activeTab,
  canUseModels,
  elasticityParams,
  onElasticityParamsChange,
  forceModelParams,
  onForceModelParamsChange,
  elasticModelParams,
  onElasticModelParamsChange,
  open,
  onToggle,
  fparamsProgress,
  eparamsProgress
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

  // Theme and media query to determine drawer variant based on screen size
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  // Use persistent variant on desktop (md+) to push content, temporary on mobile for overlay
  const variant = isMdUp ? "persistent" : "temporary";

  // Debug logging
  // console.log("selectedElasticityModel:", selectedElasticityModel);
  // console.log("elasticityParameterOptions:", elasticityParameterOptions);

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
    <Fade in={open}>
      <Drawer
        anchor="right"
        variant={variant}
        open={open}
        onClose={onToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": sidebarPaperSx,
          // Keep drawer below app bar on desktop, use default drawer z-index on mobile
          zIndex: (t) => (isMdUp ? t.zIndex.appBar - 1 : t.zIndex.drawer),
        }}
      >
        {/* Header */}
        <Box sx={headerBarSx}>
          <Typography variant="h6" sx={titleSx}>
            Applied Filters & Parameters
          </Typography>
          <Tooltip title="Close">
            <IconButton size="small" color="error" onClick={onToggle} {...closeBtnHandlers}>
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Scrollable content */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 1.25, pb: 1.25 }}>
        
      {/* Elasticity Spectra Tab - Show elastic model params and elasticity params */}
      {activeTab === "elasticitySpectra" && (
        <>
          {/* Elastic Model Parameters - Show when elastic model is chosen AND in single-curve mode */}
          {canUseModels && selectedElasticityModel && (
            <Card sx={cardSx}>
              <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                  Elastic Model Parameters
                </Typography>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 0.5 }}>
                  <Box>
                    <Typography variant="caption" sx={captionSx}>Max Ind [nm]</Typography>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={elasticModelParams.maxInd}
                      onChange={(e) => onElasticModelParamsChange({ ...elasticModelParams, maxInd: parseInt(e.target.value) || 800 })}
                      inputProps={{ min: 1, max: 2000 }}
                      fullWidth
                      sx={inputCompactSx}
                    />
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={captionSx}>Min Ind [nm]</Typography>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={elasticModelParams.minInd}
                      onChange={(e) => onElasticModelParamsChange({ ...elasticModelParams, minInd: parseInt(e.target.value) || 0 })}
                      inputProps={{ min: 0, max: 1000 }}
                      fullWidth
                      sx={inputCompactSx}
                    />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}
          
          {/* Elasticity Parameters - Always show on elasticity spectra tab */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                Elasticity Parameters
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={elasticityParams.interpolate}
                    onChange={(e) => onElasticityParamsChange({ ...elasticityParams, interpolate: e.target.checked })}
                    size="small"
                  />
                }
                label={<Typography variant="caption" sx={{ fontSize: 12, whiteSpace: "nowrap" }}>Interpolate</Typography>}
                sx={{ mb: 0.5 }}
              />

              {/* 2-column grid: Order/Window */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 0.5 }}>
                <Box>
                  <Typography variant="caption" sx={captionSx}>Order</Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={elasticityParams.order}
                    onChange={(e) => onElasticityParamsChange({ ...elasticityParams, order: parseInt(e.target.value) || 2 })}
                    inputProps={{ min: 1, max: 9 }}
                    fullWidth
                    sx={inputCompactSx}
                  />
                </Box>

                <Box>
                  <Typography variant="caption" sx={captionSx}>Window</Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={elasticityParams.window}
                    onChange={(e) => onElasticityParamsChange({ ...elasticityParams, window: parseInt(e.target.value) || 61 })}
                    inputProps={{ min: 11, max: 201, step: 2 }}
                    fullWidth
                    sx={inputCompactSx}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
        
        {/* Force Model Parameters - Show when force model is chosen (not on elasticity spectra tab) AND in single-curve mode */}
        {activeTab !== "elasticitySpectra" && canUseModels && selectedForceModel && (
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                Force Model Parameters
              </Typography>
              
              {/* Max Indentation Input */}
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={captionSx}>Max Ind [nm]</Typography>
                <TextField
                  type="number"
                  value={forceModelParams.maxInd}
                  onChange={(e) => onForceModelParamsChange({...forceModelParams, maxInd: parseInt(e.target.value) || 800})}
                  size="small"
                  margin="dense"
                  inputProps={{ min: 1, max: 2000 }}
                  fullWidth
                  sx={inputCompactSx}
                />
              </Box>
              
              {/* Min Indentation Input */}
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={captionSx}>Min Ind [nm]</Typography>
                <TextField
                  type="number"
                  value={forceModelParams.minInd}
                  onChange={(e) => onForceModelParamsChange({...forceModelParams, minInd: parseInt(e.target.value) || 0})}
                  size="small"
                  margin="dense"
                  inputProps={{ min: 0, max: 1000 }}
                  fullWidth
                  sx={inputCompactSx}
                />
              </Box>
              
              {/* Young's Modulus Info - Show for any force model */}
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={{ 
                  display: "block", 
                  fontSize: 11, 
                  color: "#666", 
                  textAlign: "center"
                }}>
                  Young's modulus (8±2)10²
                </Typography>
              </Box>
              
              {/* Poisson Ratio Slider - Only show for Hertz and DriftedHertz models */}
              {(selectedForceModel === "hertz" || selectedForceModel === "driftedhertz") && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography variant="caption" sx={captionSx}>Poisson ratio</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Slider
                      value={forceModelParams.poisson}
                      onChange={(e, value) => onForceModelParamsChange({...forceModelParams, poisson: value})}
                      min={-1}
                      max={0.5}
                      step={0.01}
                      size="small"
                      sx={sliderSx}
                    />
                    <Typography variant="caption" sx={{ fontSize: 11, color: "#3DA58A", fontWeight: 700, minWidth: 44, textAlign: "right" }}>
                      {forceModelParams.poisson.toFixed(3)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Set Zero Force Checkbox - Show when contact point filters are chosen (not on elasticity spectra tab) */}
        {activeTab !== "elasticitySpectra" && Object.keys(cpFilters || {}).length > 0 && (
            <Card sx={cardSx}>
            <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                Set Zero Force
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={setZeroForce}
                    onChange={(e) => onSetZeroForceChange(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="caption" sx={{ fontSize: 12 }}>
                    Zero force at contact point
                  </Typography>
                }
              />
            </CardContent>
          </Card>
        )}
        
        <Stack direction="column" spacing={1}>
          {/* View Force Parameters - Only show on forceIndentation tab AND in single-curve mode */}
          {activeTab === "forceIndentation" && canUseModels && selectedForceModel && (
            <Card sx={cardSx}>
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
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
                
                {/* Progress Indicator */}
                {showParameters && fparamsProgress && fparamsProgress.isLoading && (
                  <Box sx={{ mt: 1.5, px: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <CircularProgress size={16} sx={{ color: "#3DA58A" }} />
                      <Typography variant="caption" sx={{ fontSize: 11, color: "#3DA58A", fontWeight: 600 }}>
                        {fparamsProgress.phase || "Loading..."}
                      </Typography>
                    </Box>
                    {fparamsProgress.total > 0 && (
                      <>
                        <LinearProgress 
                          variant="determinate" 
                          value={(fparamsProgress.done / fparamsProgress.total) * 100}
                          sx={{ 
                            height: 6, 
                            borderRadius: 3,
                            backgroundColor: "#E0E0E0",
                            "& .MuiLinearProgress-bar": {
                              backgroundColor: "#3DA58A"
                            }
                          }}
                        />
                        <Typography variant="caption" sx={{ fontSize: 10, color: "#666", mt: 0.5, display: "block" }}>
                          {fparamsProgress.done} / {fparamsProgress.total} curves
                          {fparamsProgress.totalBatches > 0 && ` • Batch ${fparamsProgress.currentBatch}/${fparamsProgress.totalBatches}`}
                        </Typography>
                      </>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* View Elasticity Parameters - Only show on elasticitySpectra tab AND in single-curve mode */}
          {activeTab === "elasticitySpectra" && canUseModels && selectedElasticityModel && (
            <Card sx={cardSx}>
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={sectionLabelSx("#FF9800")}>
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
                
                {/* Elasticity loading indicator (mirrors Force, now with determinate bar) */}
                {showElasticityParameters && eparamsProgress && eparamsProgress.isLoading && (
                  <Box sx={{ mt: 1.5, px: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <CircularProgress size={16} sx={{ color: "#FF9800" }} />
                      <Typography variant="caption" sx={{ fontSize: 11, color: "#FF9800", fontWeight: 600 }}>
                        {eparamsProgress.phase || "Loading..."}
                      </Typography>
                    </Box>
                    {eparamsProgress.total > 0 && (
                      <>
                        <LinearProgress
                          variant="determinate"
                          value={(eparamsProgress.done / eparamsProgress.total) * 100}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "#FFE0B2",
                            "& .MuiLinearProgress-bar": { backgroundColor: "#FF9800" }
                          }}
                        />
                        <Typography variant="caption" sx={{ fontSize: 10, color: "#666", mt: 0.5, display: "block" }}>
                          {eparamsProgress.done} / {eparamsProgress.total} curves
                          {eparamsProgress.totalBatches > 0 && ` • Batch ${eparamsProgress.currentBatch}/${eparamsProgress.totalBatches}`}
                        </Typography>
                      </>
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

          {/* Force Models – only on Force–Indentation tab */}
          {activeTab === "forceIndentation" &&
            Object.keys(forceModels || {}).map((filterName) => (
              <FilterCard
                key={filterName}
                filterName={filterName}
                filterData={forceModels[filterName]}
                capitalizeFilterName={capitalizeFilterName}
                handleRemoveFilter={handleRemoveFilter}
                handleFilterChange={handleFilterChange}
                type="force"
              />
            ))
          }

          {/* Elasticity Models – only on Elasticity Spectra tab */}
          {activeTab === "elasticitySpectra" &&
            Object.keys(elasticityModels || {}).map((filterName) => (
              <FilterCard
                key={filterName}
                filterName={filterName}
                filterData={elasticityModels[filterName]}
                capitalizeFilterName={capitalizeFilterName}
                handleRemoveFilter={handleRemoveFilter}
                handleFilterChange={handleFilterChange}
                type="elasticity"
              />
            ))
          }
        </Stack>

        {/* Info card when models are disabled */}
        {!canUseModels && (
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1 }}>
              <Typography variant="caption" sx={{ fontSize: 11, color: "#777" }}>
                To view model parameters, enter a Curve ID in the controls bar and select a model.
              </Typography>
            </CardContent>
          </Card>
        )}
        </Box>
      </Drawer>
    </Fade>
  );
};

export default FilterStatusSidebar;