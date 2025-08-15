import React from "react";
import {
  Box,
  Button,
  Collapse,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Checkbox,
  ListItemText,
  Typography,
} from "@mui/material";
import FilterStatusSidebar from "./FilterStatusSidebar";

const MultiSelectFilter = ({
  label,
  options,
  value,
  onChange,
  capitalizeFilterName,
  size = "small",
  sx = { fontSize: 14 }
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
        renderValue={(selected) => selected.map(capitalizeFilterName).join(", ") || "None"}
        sx={sx}
      >
        {options.map((name) => (
          <MenuItem key={name} value={name}>
            <Checkbox checked={value.includes(name)} size="small" />
            <ListItemText
              primary={capitalizeFilterName(name)}
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
  capitalizeFilterName,
  size = "small",
  sx = { fontSize: 14 }
}) => (
  <Grid item xs={3}>
    <FormControl fullWidth size={size}>
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
        renderValue={(selected) => selected ? capitalizeFilterName(selected) : "Select..."}
        sx={sx}
      >
        {options.map((name) => (
          <MenuItem key={name} value={name}>
            <ListItemText
              primary={capitalizeFilterName(name)}
              primaryTypographyProps={sx}
            />
          </MenuItem>
        ))}
      </Select>
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
  setSelectedRegularFilters,
  setSelectedCpFilters,
  setSelectedForceModels,
  setSelectedElasticityModels,
  handleAddFilter,
  handleRemoveFilter,
  handleFilterChange,
  sendCurveRequest,
  activeTab,
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
  onElasticityModelChange
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const toggleFilters = () => {
    setIsOpen((prev) => !prev);
  };

  // Ensure array values with fallback
  const safeRegularFilters = Array.isArray(selectedRegularFilters) ? selectedRegularFilters : [];
  const safeCpFilters = Array.isArray(selectedCpFilters) ? selectedCpFilters : [];
  const safeForceModels = Array.isArray(selectedForceModels) ? selectedForceModels : [];
  const safeElasticityModels = selectedElasticityModels || [];
  
  // Debug logging
  console.log("elasticityModelDefaults:", elasticityModelDefaults);
  console.log("safeElasticityModels:", safeElasticityModels);

  // Handle multi-select changes
  const createChangeHandler = (setSelected, type, prevSelected) => (event) => {
    console.log("createChangeHandler called with type:", type);
    console.log("event:", event);
    console.log("event.target:", event.target);
    console.log("event.target.value:", event.target?.value);
    
    if (!event || !event.target) {
      console.error("Invalid event in createChangeHandler");
      return;
    }
    
    const value = event.target.value;
    console.log("Value from event:", value);
    console.log("Previous selected:", prevSelected);
    
    setSelected(value);
    
    // Handle single selection for force models, elasticity models, and CP filters
    if (type === 'force' || type === 'elasticity' || type === 'cp') {
      console.log(`Handling ${type} single selection`);
      // Remove all previous models/filters of this type
      prevSelected.forEach((name) => {
        console.log("Removing filter:", name);
        handleRemoveFilter(name, type);
      });
      // Add the new model/filter
      if (value && value.length > 0) {
        console.log("Adding filter:", value[0]);
        handleAddFilter(value[0], type);
        // Notify parent about model change
        if (type === 'force' && onForceModelChange) {
          onForceModelChange(value[0], true);
        } else if (type === 'elasticity' && onElasticityModelChange) {
          onElasticityModelChange(value[0], true);
        }
      } else {
        // Notify parent about model deselection
        if (type === 'force' && onForceModelChange) {
          onForceModelChange("", false);
        } else if (type === 'elasticity' && onElasticityModelChange) {
          onElasticityModelChange("", false);
        }
      }
    } else {
      // Handle multi-selection for other filters (regular filters)
      value.filter((name) => !prevSelected.includes(name)).forEach((name) => handleAddFilter(name, type));
      prevSelected.filter((name) => !value.includes(name)).forEach((name) => handleRemoveFilter(name, type));
    }
  };

  const handleRegularChange = createChangeHandler(setSelectedRegularFilters, 'regular', safeRegularFilters);
  const handleCpChange = createChangeHandler(setSelectedCpFilters, 'cp', safeCpFilters);
  const handleForceChange = createChangeHandler(setSelectedForceModels, 'force', safeForceModels);
  const handleElasticityChange = createChangeHandler(setSelectedElasticityModels, 'elasticity', safeElasticityModels);

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "15vh",
        bgcolor: "background.paper",
        borderTop: 1,
        borderColor: "divider",
        zIndex: 1000,
      }}
    >
      {/* Toggle Button (Closed State) */}
      <Collapse in={!isOpen}>
        <Box sx={{ position: "fixed", right: 10, top: 10, zIndex: 1001 }}>
          <Button
            variant="contained"
            onClick={toggleFilters}
            size="small"
            sx={{ fontSize: 14, backgroundColor: "#A4A9FC", color:"#141414" }}
          >
            Show Sidebar
          </Button>
        </Box>
      </Collapse>

      {/* Main Filters Panel */}
      <Box>
        <Box
          sx={{
            p: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            overflow: "hidden",
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6" sx={{ fontSize: 14, fontWeight: "medium" }}>
              Filters
            </Typography>

          </Box>

          {/* Four-Column Multi-Select Row */}
          <Grid container spacing={1} sx={{ flexGrow: 1 }}>
            <MultiSelectFilter
              label="Regular"
              options={Object.keys(filterDefaults || {})}
              value={safeRegularFilters}
              onChange={handleRegularChange}
              capitalizeFilterName={capitalizeFilterName}
            />

            <SingleSelectFilter
              label="CP"
              options={Object.keys(cpDefaults || {})}
              value={safeCpFilters}
              onChange={handleCpChange}
              capitalizeFilterName={capitalizeFilterName}
            />

            {activeTab === "forceIndentation" && (
              <SingleSelectFilter
                label="Force"
                options={Object.keys(forceModelDefaults || {})}
                value={safeForceModels}
                onChange={handleForceChange}
                capitalizeFilterName={capitalizeFilterName}
              />
            )}

            {activeTab === "elasticitySpectra" && (
              <SingleSelectFilter
                label="Elasticity"
                options={Object.keys(elasticityModelDefaults || {})}
                value={safeElasticityModels}
                onChange={handleElasticityChange}
                capitalizeFilterName={capitalizeFilterName}
              />
            )}
          </Grid>

          {/* Update Curves Button */}
          <Button
            variant="contained"
            onClick={sendCurveRequest}
            fullWidth
            size="small"
            sx={{
              fontSize: 12,
              py: 0.5,
              zIndex: 1000,
              backgroundColor: "#3DA58A",
              "&:hover": {
                backgroundColor: "#359D7F",
              },
            }}
          >
            Update Curves
          </Button>
        </Box>
      </Box>

      {/* Sidebar */}
      <FilterStatusSidebar
        regularFilters={regularFilters}
        cpFilters={cpFilters}
        forceModels={forceModels}
        elasticityModels={elasticityModels}
        capitalizeFilterName={capitalizeFilterName}
        handleRemoveFilter={handleRemoveFilter}
        handleFilterChange={handleFilterChange}
        sx={{ zIndex: 1002 }}
        toggleFilters={toggleFilters}
        isOpen={isOpen}
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
      />
    </Box>
  );
};

export default FiltersComponent;