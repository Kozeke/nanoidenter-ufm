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
  Box
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
  isOpen
}) => {
  // Check if any filters are applied
  const hasFilters =
    Object.keys(regularFilters || {}).length > 0 ||
    Object.keys(cpFilters || {}).length > 0 ||
    Object.keys(forceModels || {}).length > 0 ||
    Object.keys(elasticityModels || {}).length > 0;

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