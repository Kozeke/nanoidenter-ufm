import React, { useState } from 'react';
import { saveAs } from 'file-saver'; // For saving the file
import { Menu, Button, Box, Text, Portal } from '@chakra-ui/react';

const ExportButton = ({ curveIds = [], numCurves = 10 }) => {
  const [errors, setErrors] = useState([]); // Error state for feedback
  console.log("exporting curves,",curveIds)
  const handleExport = async (format) => {
    if (format !== 'hdf5') {
      alert(`Export to ${format.toUpperCase()} is not yet implemented`);
      return;
    }

    try {
      // Prepare payload
      const exportPath = `exports/processed_data.hdf5`; // Customize as needed
      const payload = {
        export_hdf5_path: exportPath,
        curve_ids: curveIds.length > 0 ? curveIds : undefined,
        num_curves: curveIds.length > 0 ? undefined : numCurves,
      };

      // Call backend export endpoint
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/export-hdf5`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'error') {
        setErrors(result.errors || [result.message]);
        alert(`Failed to export: ${result.message}`);
        return;
      }

      // Fetch the exported file as a blob
      const fileResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/exports/${encodeURIComponent(exportPath)}`);
      if (!fileResponse.ok) {
        throw new Error('Failed to download exported file');
      }

      const blob = await fileResponse.blob();
      saveAs(blob, 'processed_data.hdf5'); // Trigger file download
      setErrors([]);
      alert(`Successfully exported ${result.exported_curves} curves to HDF5`);
    } catch (err) {
      const errorMessage = err.message.includes('HTTP error')
        ? 'Failed to communicate with server'
        : err.message;
      setErrors([errorMessage]);
      alert(`Failed to export: ${errorMessage}`);
    }
  };

  return (
    <Box pos="relative" display="inline-block">
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button
            bg="#007bff" // Blue, matching original
            color="white"
            borderRadius="4px"
            px="16px"
            py="8px"
            ml="auto"
            mr="150px"
            _hover={{ bg: '#0056b3' }} // Darker blue on hover
            _active={{ bg: '#004085' }}
            textTransform="none" // Prevent uppercase text
          >
            Export
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content
              minW="120px"
              boxShadow="lg"
              mt={1}
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="md"
            >
              <Menu.Item
                value="hdf5"
                onClick={() => handleExport('hdf5')}
                color="black"
                py={2}
                _hover={{ bg: 'gray.100' }}
              >
                HDF5
              </Menu.Item>
              <Menu.Item
                value="json"
                onClick={() => handleExport('json')}
                color="black"
                py={2}
                _hover={{ bg: 'gray.100' }}
              >
                JSON
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      {errors.length > 0 && (
        <Box mt={2}>
          {errors.map((error, index) => (
            <Text key={index} color="red.400" fontSize="xs">
              {error}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ExportButton;