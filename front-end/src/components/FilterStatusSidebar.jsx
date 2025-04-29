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

const FilterStatusSidebar = ({
  regularFilters,
  cpFilters,
  fModels,
  eModels,
  fModelDefaults,
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
    Object.keys(fModels || {}).length > 0 ||
    Object.keys(eModels || {}).length > 0;

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
            <Card
              key={filterName}
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
                  <Typography variant="subtitle2" sx={{ fontSize: 14, color: "#3DA58A", }}>
                    {capitalizeFilterName(filterName)}
                  </Typography>
                  <Tooltip title="Remove Filter">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveFilter(filterName, false)}
                      aria-label={`Remove ${capitalizeFilterName(filterName)} filter`}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                {Object.keys(regularFilters[filterName] || {}).map((param) => (
                  <Box key={param} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ display: "block", fontSize: 12,  }}>
                      {param.replace("_", " ")}
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      value={regularFilters[filterName][param] ?? ""}
                      onChange={(e) =>
                        handleFilterChange(
                          filterName,
                          param,
                          parseFloat(e.target.value),
                          false
                        )
                      }
                      fullWidth
                      sx={{ "& .MuiInputBase-input": { fontSize: 13, p: 0.5 } }}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* CP Filters */}
          {Object.keys(cpFilters || {}).map((filterName) => (
            <Card
              key={filterName}
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
                  <Typography variant="subtitle2" sx={{ fontSize: 14 }}>
                    {capitalizeFilterName(filterName)}
                  </Typography>
                  <Tooltip title="Remove Filter">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveFilter(filterName, true)}
                      aria-label={`Remove ${capitalizeFilterName(filterName)} CP filter`}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                {Object.keys(cpFilters[filterName] || {}).map((param) => (
                  <Box key={param} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ display: "block", fontSize: 12 }}>
                      {param.replace("_", " ")}
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      value={cpFilters[filterName][param] ?? ""}
                      onChange={(e) =>
                        handleFilterChange(
                          filterName,
                          param,
                          parseFloat(e.target.value),
                          true
                        )
                      }
                      fullWidth
                      sx={{ "& .MuiInputBase-input": { fontSize: 13, p: 0.5 } }}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Force Models */}
          {Object.keys(fModels || {}).map((fmodelName) => (
            <Card
              key={fmodelName}
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
                  <Typography variant="subtitle2" sx={{ fontSize: 14 }}>
                    {capitalizeFilterName(fmodelName)}
                  </Typography>
                  <Tooltip title="Remove Model">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveFilter(fmodelName, false, true)}
                      aria-label={`Remove ${capitalizeFilterName(fmodelName)} force model`}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                {Object.keys(fModels[fmodelName] || fModelDefaults[fmodelName] || {}).map((param) => (
                  <Box key={param} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ display: "block", fontSize: 12 }}>
                      {param.replace("_", " ")}
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      value={
                        fModels[fmodelName]?.[param] ?? fModelDefaults[fmodelName]?.[param] ?? ""
                      }
                      onChange={(e) =>
                        handleFilterChange(
                          fmodelName,
                          param,
                          parseFloat(e.target.value),
                          false,
                          true
                        )
                      }
                      fullWidth
                      sx={{ "& .MuiInputBase-input": { fontSize: 13, p: 0.5 } }}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Elasticity Models */}
          {Object.keys(eModels || {}).map((filterName) => (
            <Card
              key={filterName}
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
                  <Typography variant="subtitle2" sx={{ fontSize: 14 }}>
                    {capitalizeFilterName(filterName)}
                  </Typography>
                  <Tooltip title="Remove Model">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveFilter(filterName, false, false, true)}
                      aria-label={`Remove ${capitalizeFilterName(filterName)} elasticity model`}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                {Object.keys(eModels[filterName] || {}).map((param) => (
                  <Box key={param} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ display: "block", fontSize: 12 }}>
                      {param.replace("_", " ")}
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      value={eModels[filterName][param] ?? ""}
                      onChange={(e) =>
                        handleFilterChange(
                          filterName,
                          param,
                          parseFloat(e.target.value),
                          false,
                          false,
                          true
                        )
                      }
                      fullWidth
                      sx={{ "& .MuiInputBase-input": { fontSize: 13, p: 0.5 } }}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Drawer>
    </Fade>
  );
};

export default FilterStatusSidebar;