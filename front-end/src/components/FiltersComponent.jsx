import React from "react";
import {
  Box,
  Button,
  Collapse,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Checkbox,
  ListItemText,
  Typography,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import FilterStatusSidebar from "./FilterStatusSidebar";

const FiltersComponent = ({
  filterDefaults,
  capitalizeFilterName,
  cpDefaults,
  fModelDefaults,
  regularFilters,
  cpFilters,
  selectedRegularFilters, // Changed from selectedRegularFilter
  selectedCpFilters, // Changed from selectedCpFilter
  fModels,
  selectedFModels, // Changed from selectedFModel
  setSelectedFModels, // Changed from setSelectedFmodel
  eModels,
  selectedEModels,
  eModelDefaults,
  setSelectedEModels, // Changed from setSelectedEmodel
  setSelectedRegularFilters, // Changed from setSelectedRegularFilter
  setSelectedCpFilters, // Changed from setSelectedCpFilter
  handleAddFilter,
  handleRemoveFilter,
  handleFilterChange, // Kept for sidebar compatibility
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
  const safeFModels = Array.isArray(selectedFModels) ? selectedFModels : [];
  const safeEModels = Array.isArray(selectedEModels) ? selectedEModels : [];

  // Handle multi-select changes
  const handleRegularChange = (event) => {
    const value = event.target.value;
    const prev = safeRegularFilters;
    setSelectedRegularFilters(value);
    value.filter((name) => !prev.includes(name)).forEach((name) => handleAddFilter(name, false));
    prev.filter((name) => !value.includes(name)).forEach((name) => handleRemoveFilter(name, false));
  };

  const handleCpChange = (event) => {
    const value = event.target.value;
    const prev = safeCpFilters;
    setSelectedCpFilters(value);
    value.filter((name) => !prev.includes(name)).forEach((name) => handleAddFilter(name, true));
    prev.filter((name) => !value.includes(name)).forEach((name) => handleRemoveFilter(name, true));
  };

  const handleForceChange = (event) => {
    const value = event.target.value;
    const prev = safeFModels;
    setSelectedFModels(value);
    value.filter((name) => !prev.includes(name)).forEach((name) => handleAddFilter(name, false, true));
    prev.filter((name) => !value.includes(name)).forEach((name) => handleRemoveFilter(name, false, true));
  };

  const handleElasticityChange = (event) => {
    const value = event.target.value;
    const prev = safeEModels;
    setSelectedEModels(value);
    value.filter((name) => !prev.includes(name)).forEach((name) => handleAddFilter(name, false, false, true));
    prev.filter((name) => !value.includes(name)).forEach((name) => handleRemoveFilter(name, false, false, true));
  };

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
            sx={{ fontSize: 14 }}
          >
            Show Filters
          </Button>
        </Box>
      </Collapse>

      {/* Main Filters Panel */}
      <Collapse in={isOpen}>
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
            <IconButton onClick={toggleFilters} size="small" color="error">
              <Close fontSize="small" />
            </IconButton>
          </Box>

          {/* Four-Column Multi-Select Row */}
          <Grid container spacing={1} sx={{ flexGrow: 1 }}>
            {/* Regular Filter */}
            <Grid item xs={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="regular-filter-label" sx={{ fontSize: 14 }}>
                  Regular
                </InputLabel>
                <Select
                  labelId="regular-filter-label"
                  label="Regular"
                  multiple
                  value={safeRegularFilters}
                  onChange={handleRegularChange}
                  renderValue={(selected) => selected.map(capitalizeFilterName).join(", ") || "None"}
                  sx={{ fontSize: 14 }}
                >
                  {Object.keys(filterDefaults || {}).map((filterName) => (
                    <MenuItem key={filterName} value={filterName}>
                      <Checkbox
                        checked={safeRegularFilters.includes(filterName)}
                        size="small"
                      />
                      <ListItemText
                        primary={capitalizeFilterName(filterName)}
                        primaryTypographyProps={{ fontSize: 14 }}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* CP Filter */}
            <Grid item xs={3}>
              <FormControl fullWidth size="small">
                <InputLabel id="cp-filter-label" sx={{ fontSize: 14 }}>
                  CP
                </InputLabel>
                <Select
                  labelId="cp-filter-label"
                  label="CP"
                  multiple
                  value={safeCpFilters}
                  onChange={handleCpChange}
                  renderValue={(selected) => selected.map(capitalizeFilterName).join(", ") || "None"}
                  sx={{ fontSize: 14 }}
                >
                  {Object.keys(cpDefaults || {}).map((filterName) => (
                    <MenuItem key={filterName} value={filterName}>
                      <Checkbox
                        checked={safeCpFilters.includes(filterName)}
                        size="small"
                      />
                      <ListItemText
                        primary={capitalizeFilterName(filterName)}
                        primaryTypographyProps={{ fontSize: 14 }}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Force Model */}
            {activeTab === "forceIndentation" && (
              <Grid item xs={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="force-model-label" sx={{ fontSize: 14 }}>
                    Force
                  </InputLabel>
                  <Select
                    labelId="force-model-label"
                    label="Force"
                    multiple
                    value={safeFModels}
                    onChange={handleForceChange}
                    renderValue={(selected) => selected.map(capitalizeFilterName).join(", ") || "None"}
                    sx={{ fontSize: 14 }}
                  >
                    {Object.keys(fModelDefaults || {}).map((fmodelName) => (
                      <MenuItem key={fmodelName} value={fmodelName}>
                        <Checkbox
                          checked={safeFModels.includes(fmodelName)}
                          size="small"
                        />
                        <ListItemText
                          primary={capitalizeFilterName(fmodelName)}
                          primaryTypographyProps={{ fontSize: 14 }}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* Elasticity Model */}
            {activeTab === "elasticitySpectra" && (
              <Grid item xs={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="elasticity-model-label" sx={{ fontSize: 14 }}>
                    Elasticity
                  </InputLabel>
                  <Select
                    labelId="elasticity-model-label"
                    label="Elasticity"
                    multiple
                    value={safeEModels}
                    onChange={handleElasticityChange}
                    renderValue={(selected) => selected.map(capitalizeFilterName).join(", ") || "None"}
                    sx={{ fontSize: 14 }}
                  >
                    {Object.keys(eModelDefaults || {}).map((emodelName) => (
                      <MenuItem key={emodelName} value={emodelName}>
                        <Checkbox
                          checked={safeEModels.includes(emodelName)}
                          size="small"
                        />
                        <ListItemText
                          primary={capitalizeFilterName(emodelName)}
                          primaryTypographyProps={{ fontSize: 14 }}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>

          {/* Update Curves Button */}
          <Button
            variant="contained"
            color="success"
            onClick={sendCurveRequest}
            fullWidth
            size="small"
            sx={{ fontSize: 12, py: 0.5, zIndex: 1000 }}
          >
            Update Curves
          </Button>
        </Box>
      </Collapse>

      {/* Sidebar */}
      <FilterStatusSidebar
        regularFilters={regularFilters}
        cpFilters={cpFilters}
        fModels={fModels}
        eModels={eModels}
        fModelDefaults={fModelDefaults}
        capitalizeFilterName={capitalizeFilterName}
        handleRemoveFilter={handleRemoveFilter}
        handleFilterChange={handleFilterChange}
        sx={{ zIndex: 1002 }}
      />
    </Box>
  );
};

export default FiltersComponent;