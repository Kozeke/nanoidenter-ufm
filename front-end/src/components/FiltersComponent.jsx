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
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const toggleFilters = () => {
    setIsOpen((prev) => !prev);
  };

  // Ensure array values with fallback
  const safeRegularFilters = Array.isArray(selectedRegularFilters) ? selectedRegularFilters : [];
  const safeCpFilters = Array.isArray(selectedCpFilters) ? selectedCpFilters : [];
  const safeForceModels = Array.isArray(selectedForceModels) ? selectedForceModels : [];
  const safeElasticityModels = Array.isArray(selectedElasticityModels) ? selectedElasticityModels : [];

  // Handle multi-select changes
  const createChangeHandler = (setSelected, type, prevSelected) => (event) => {
    const value = event.target.value;
    setSelected(value);
    value.filter((name) => !prevSelected.includes(name)).forEach((name) => handleAddFilter(name, type));
    prevSelected.filter((name) => !value.includes(name)).forEach((name) => handleRemoveFilter(name, type));
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

            <MultiSelectFilter
              label="CP"
              options={Object.keys(cpDefaults || {})}
              value={safeCpFilters}
              onChange={handleCpChange}
              capitalizeFilterName={capitalizeFilterName}
            />

            {activeTab === "forceIndentation" && (
              <MultiSelectFilter
                label="Force"
                options={Object.keys(forceModelDefaults || {})}
                value={safeForceModels}
                onChange={handleForceChange}
                capitalizeFilterName={capitalizeFilterName}
              />
            )}

            {activeTab === "elasticitySpectra" && (
              <MultiSelectFilter
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
      />
    </Box>
  );
};

export default FiltersComponent;