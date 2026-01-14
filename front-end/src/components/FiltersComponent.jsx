import React, { Suspense, lazy, useCallback } from "react";
import {
  Box,
  Button,
  Collapse,
  FormControl,
  FormHelperText,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Checkbox,
  ListItemText,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";
// Lazy-load FilterStatusSidebar since it's only needed when the drawer is opened


const FilterStatusSidebar = lazy(() => import("./FilterStatusSidebar"));

// Drawer width constant - must match FilterStatusSidebar DRAWER_WIDTH
const DRAWER_WIDTH = 300;

// --- Shared look to match Dashboard header ---
const headerCardSx = {
  position: "sticky",
  top: 64, // adjust if your top navbar height differs
  zIndex: 5,
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  p: 1.25,
  mb: 1,
  border: "1px solid #e9ecf5",
  borderRadius: "10px",
  boxShadow: "0 8px 18px rgba(20, 20, 43, 0.06)",
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
};

const sectionTitleSx = { fontSize: 14, fontWeight: 600, color: "#1d1e2c", mr: 1 };

const fieldFontSx = { fontSize: 14 }; // keep selects unified

// Primary / secondary button looks — same as Dashboard
const primaryBtnSx = {
  px: 1.5,
  py: 0.75,
  fontSize: 14,
  fontWeight: 600,
  borderRadius: "10px",
  textTransform: "none",
  boxShadow: "0 8px 16px rgba(90, 105, 255, 0.25)",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  "&:hover": { filter: "brightness(0.98)" },
};

const secondaryBtnSx = {
  px: 1.5,
  py: 0.75,
  fontSize: 14,
  fontWeight: 600,
  borderRadius: "10px",
  textTransform: "none",
  color: "#2c2f3a",
  background: "#fff",
  border: "1px solid #e6e9f7",
  boxShadow: "0 2px 8px rgba(30, 41, 59, 0.06)",
  "&:hover": { background: "#fbfbff" },
};

const disabledBtnSx = {
  px: 1.5,
  py: 0.75,
  fontSize: 14,
  fontWeight: 600,
  borderRadius: "10px",
  textTransform: "none",
  color: "#9aa0b5",
  background: "#f5f6fb",
  border: "1px solid #eceef7",
};

// tiny press feedback for all buttons
const pressableHandlers = {
  onMouseDown: (e) => (e.currentTarget.style.transform = "translateY(1px)"),
  onMouseUp:   (e) => (e.currentTarget.style.transform = "translateY(0)"),
  onMouseLeave:(e) => (e.currentTarget.style.transform = "translateY(0)"),
};

const MultiSelectFilter = ({
  label,
  options,
  value,
  onChange,
  formatLabel,
  size = "small",
  sx = fieldFontSx
}) => (
  <Grid item xs={3}>
    <FormControl fullWidth size={size}>
      <InputLabel id={`${label.toLowerCase()}-label`} sx={sx}>
        {label}
      </InputLabel>
      <Select
        labelId={`${label.toLowerCase()}-label`}
        label={label}
        multiple
        value={value}
        onChange={onChange}
        renderValue={(selected) => selected.map(formatLabel).join(", ") || "None"}
        sx={sx}
      >
        {options.map((name) => (
          <MenuItem key={name} value={name}>
            <Checkbox checked={value.includes(name)} size="small" />
            <ListItemText
              primary={formatLabel(name)}
              primaryTypographyProps={sx}
            />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  </Grid>
);

const SingleSelectFilter = ({
  label,
  options,
  value,
  onChange,
  formatLabel,
  size = "small",
  sx = fieldFontSx,
  disabled = false,
  helperText = null
}) => (
  <Grid item xs={3}>
    <FormControl fullWidth size={size} disabled={disabled}>
      <InputLabel id={`${label.toLowerCase()}-label`} sx={sx}>
        {label}
      </InputLabel>
      <Select
        labelId={`${label.toLowerCase()}-label`}
        label={label}
        value={value.length > 0 ? value[0] : ""}
        onChange={(event) => {
          console.log("SingleSelectFilter onChange event:", event);
          console.log("event.target:", event.target);
          console.log("event.target.value:", event.target?.value);
          
          if (event && event.target && event.target.value !== undefined) {
            const selectedValue = event.target.value;
            console.log("Selected value:", selectedValue);
            if (selectedValue) {
              // Create a synthetic event object that matches what createChangeHandler expects
              const syntheticEvent = {
                target: {
                  value: [selectedValue]
                }
              };
              onChange(syntheticEvent);
            } else {
              const syntheticEvent = {
                target: {
                  value: []
                }
              };
              onChange(syntheticEvent);
            }
          } else {
            console.log("Invalid event or missing value, calling onChange with empty array");
            const syntheticEvent = {
              target: {
                value: []
              }
            };
            onChange(syntheticEvent);
          }
        }}
        renderValue={(selected) => selected ? formatLabel(selected) : (disabled ? "Enter Curve ID first" : "Select...")}
        sx={sx}
        disabled={disabled}
      >
        {!disabled && (
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
        )}
        {options.map((name) => (
          <MenuItem key={name} value={name}>
            <ListItemText
              primary={formatLabel(name)}
              primaryTypographyProps={sx}
            />
          </MenuItem>
        ))}
      </Select>
      {helperText && (
        <FormHelperText sx={{ fontSize: 11, mt: 0.5 }}>
          {helperText}
        </FormHelperText>
      )}
    </FormControl>
  </Grid>
);

const FiltersComponent = ({
  filterDefaults,
  capitalizeFilterName,
  cpDefaults,
  forceModelDefaults,
  elasticityModelDefaults,
  regularFilters,
  cpFilters,
  forceModels,
  elasticityModels,
  selectedRegularFilters,
  selectedCpFilters,
  selectedForceModels,
  selectedElasticityModels,
  handleAddFilter,
  handleRemoveFilter,
  handleFilterChange,
  sendCurveRequest,
  activeTab,
  canUseModels,
  onForceModelChange,
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
  onElasticityModelChange,
  setZeroForce,
  onSetZeroForceChange,
  elasticityParams,
  onElasticityParamsChange,
  forceModelParams,
  onForceModelParamsChange,
  elasticModelParams,
  onElasticModelParamsChange,
  open,
  onToggle,
  fparamsProgress,
  eparamsProgress,
  // Disable filters when socket is down
  isSocketConnected,
}) => {
  const safeCapitalize = useCallback(
    (value) => {
      if (typeof capitalizeFilterName === "function") {
        return capitalizeFilterName(value);
      }
      return String(value ?? "");
    },
    [capitalizeFilterName]
  );
  // Derives a flag indicating whether controls should be disabled.
  const isDisabled = !isSocketConnected;

  // Remove local "isOpen" as the source of truth; rely on `open` from props
  // Toggle handler that calls parent's onToggle function
  const toggleFilters = () => {
    if (typeof onToggle === "function") onToggle();
  };

  // Ensure array values with fallback
  const safeRegularFilters = Array.isArray(selectedRegularFilters) ? selectedRegularFilters : [];
  const safeCpFilters = Array.isArray(selectedCpFilters) ? selectedCpFilters : [];
  const safeForceModels = Array.isArray(selectedForceModels) ? selectedForceModels : [];
  const safeElasticityModels = selectedElasticityModels || [];
  
  // Debug logging
  // console.log("elasticityModelDefaults:", elasticityModelDefaults);
  // console.log("safeElasticityModels:", safeElasticityModels);

  // Handle multi-select changes
  const handleRegularChange = (event) => {
    const value = event.target.value || [];
  
    // add newly selected
    value
      .filter((name) => !selectedRegularFilters.includes(name))
      .forEach((name) => handleAddFilter(name, "regular"));
  
    // remove unselected
    selectedRegularFilters
      .filter((name) => !value.includes(name))
      .forEach((name) => handleRemoveFilter(name, "regular"));
  };
  const handleCpChange = (event) => {
    const value = event.target.value || [];
    const next = value[0];
  
    // remove old CP filter
    selectedCpFilters.forEach((name) =>
      handleRemoveFilter(name, "cp")
    );
  
    if (next) {
      handleAddFilter(next, "cp");
    }
  };
  const handleForceChange = (event) => {
    const value = event.target.value || [];
    const next = value[0];
  
    selectedForceModels.forEach((name) =>
      handleRemoveFilter(name, "force")
    );
  
    if (next) {
      handleAddFilter(next, "force");
      onForceModelChange?.(next);
    } else {
      onForceModelChange?.("");
    }
  };
  const handleElasticityChange = (event) => {
    const value = event.target.value || [];
    const next = value[0];
  
    selectedElasticityModels.forEach((name) =>
      handleRemoveFilter(name, "elasticity")
    );
  
    if (next) {
      handleAddFilter(next, "elasticity");
      onElasticityModelChange?.(next);
    } else {
      onElasticityModelChange?.("");
    }
  };
        

  // Theme and media query to determine if content should shift on desktop
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));

  return (
    <Box 
      sx={{ 
        position: "relative", 
        width: "100%",
        // Push content left when sidebar is open on desktop (md+), no margin on mobile
        mr: isMdUp && open ? `${DRAWER_WIDTH}px` : 0,
        transition: "margin-right .25s ease",
      }}
    >

      {/* Filters Toolbar Card */}
      <Box
        sx={{
          ...headerCardSx,
          opacity: isDisabled ? 0.6 : 1,
          pointerEvents: isDisabled ? "none" : "auto",
        }}
      >
        <Typography variant="h6" sx={sectionTitleSx}>Filters</Typography>

        {/* Multi/Single selects row (wrap on small screens) */}
        <Grid container spacing={1} sx={{ flex: 1, alignItems: "center" }}>
        <MultiSelectFilter
          label="Regular"
          options={Object.keys(filterDefaults || {})}
          value={selectedRegularFilters}
          onChange={handleRegularChange}
          formatLabel={safeCapitalize}
        />

        <SingleSelectFilter
          label="CP"
          options={Object.keys(cpDefaults || {})}
          value={selectedCpFilters}
          onChange={handleCpChange}
          formatLabel={safeCapitalize}
        />

        {activeTab === "forceIndentation" && (
          <SingleSelectFilter
            label="Force"
            options={Object.keys(forceModelDefaults || {})}
            value={selectedForceModels}
            onChange={canUseModels ? handleForceChange : () => {}}
            disabled={!canUseModels}
            formatLabel={safeCapitalize}
          />
        )}

        {activeTab === "elasticitySpectra" && (
          <SingleSelectFilter
            label="Elasticity"
            options={Object.keys(elasticityModelDefaults || {})}
            value={selectedElasticityModels}
            onChange={canUseModels ? handleElasticityChange : () => {}}
            disabled={!canUseModels}
            formatLabel={safeCapitalize}
          />
        )}

        </Grid>

        {/* Right-aligned actions */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="contained"
            onClick={sendCurveRequest}
            size="small"
            sx={primaryBtnSx}
            {...pressableHandlers}
          >
            Update Curves
          </Button>

          <Button
            variant="contained"
            onClick={toggleFilters}
            size="small"
            sx={secondaryBtnSx}
            {...pressableHandlers}
          >
            {open ? "Hide Sidebar" : "Show Sidebar"}
          </Button>
        </Box>
      </Box>

      {/* Sidebar - lazy-loaded since it's only needed when drawer is opened */}
      <Suspense fallback={null}>
        <FilterStatusSidebar
          regularFilters={regularFilters}
          cpFilters={cpFilters}
          forceModels={forceModels}
          elasticityModels={elasticityModels}
          capitalizeFilterName={capitalizeFilterName}
          handleRemoveFilter={handleRemoveFilter}
          handleFilterChange={handleFilterChange}
          sx={{ zIndex: 1002 }}
          selectedForceModel={selectedForceModel}
          selectedParameters={selectedParameters}
          onParameterChange={onParameterChange}
          showParameters={showParameters}
          setShowParameters={setShowParameters}
          selectedElasticityModel={selectedElasticityModel}
          selectedElasticityParameters={selectedElasticityParameters}
          onElasticityParameterChange={onElasticityParameterChange}
          showElasticityParameters={showElasticityParameters}
          setShowElasticityParameters={setShowElasticityParameters}
          setZeroForce={setZeroForce}
          onSetZeroForceChange={onSetZeroForceChange}
          activeTab={activeTab}
          canUseModels={canUseModels}
          elasticityParams={elasticityParams}
          onElasticityParamsChange={onElasticityParamsChange}
          forceModelParams={forceModelParams}
          onForceModelParamsChange={onForceModelParamsChange}
          elasticModelParams={elasticModelParams}
          onElasticModelParamsChange={onElasticModelParamsChange}
          open={open}
          onToggle={onToggle}
          fparamsProgress={fparamsProgress}
          eparamsProgress={eparamsProgress}
        />
      </Suspense>
    </Box>
  );
};

export default FiltersComponent;