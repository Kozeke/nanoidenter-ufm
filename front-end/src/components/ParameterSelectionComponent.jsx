import React, { useState, useEffect } from "react";
import { Box, Checkbox, FormControlLabel, Typography } from "@mui/material";

const ParameterSelectionComponent = ({
  selectedForceModel,
  selectedParameters,
  onParameterChange,
  showParameters,
  setShowParameters,
  style,
}) => {
  const [localSelectedParams, setLocalSelectedParams] = useState(selectedParameters || []);

  useEffect(() => {
    setLocalSelectedParams(selectedParameters || []);
  }, [selectedParameters]);

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

  const parameterOptions = getParameterOptions(selectedForceModel);

  const handleParameterChange = (parameter) => {
    const newSelectedParams = localSelectedParams.includes(parameter)
      ? localSelectedParams.filter(p => p !== parameter)
      : [...localSelectedParams, parameter];
    
    setLocalSelectedParams(newSelectedParams);
    onParameterChange(newSelectedParams);
  };

  if (!selectedForceModel) {
    return null;
  }

  return (
    <Box
      sx={{
        border: "1px solid #ccc",
        borderRadius: "8px",
        padding: "12px",
        margin: "8px",
        backgroundColor: "#f9f9f9",
        minWidth: "200px",
        ...style
      }}
    >
             <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
         <Typography
           variant="h6"
           sx={{
             fontSize: "14px",
             fontWeight: "bold",
             color: "#333",
           }}
         >
           View Parameters
         </Typography>
         {parameterOptions.length > 0 && (
           <Checkbox
             checked={showParameters}
             onChange={(e) => setShowParameters(e.target.checked)}
             size="small"
           />
         )}
       </Box>
      
             <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
         {parameterOptions.length > 0 ? (
           parameterOptions.map((parameter) => (
             <FormControlLabel
               key={parameter}
               control={
                 <Checkbox
                   checked={localSelectedParams.includes(parameter)}
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
    </Box>
  );
};

export default ParameterSelectionComponent; 