import React, { useState, useEffect } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Select, TextField, FormControl, InputLabel, Typography } from '@mui/material';

const FileOpener = ({ onProcessSuccess }) => {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0); // 0: Upload, 1: Select Force, 2: Select Z, 3: Metadata
    const [filePath, setFilePath] = useState('');
    const [fileType, setFileType] = useState(''); // json or hdf5
    const [structure, setStructure] = useState(null);
    const [currentGroup, setCurrentGroup] = useState({ groups: {}, datasets: [] });
    const [navigationPath, setNavigationPath] = useState([]); // Track path, e.g., ['curve0', 'segment0']
    const [forcePath, setForcePath] = useState('');
    const [zPath, setZPath] = useState('');
    const [metadata, setMetadata] = useState({
        file_id: 'file_0',
        date: '2025-05-20',
        instrument: 'unknown',
        sample: 'unknown',
        spring_constant: '0.1',
        inv_ols: '22e-9',
        tip_geometry: 'pyramid',
        tip_radius: '1e-6',
        sampling_rate: '1e5',
        velocity: '1e-6'
    });

    const handleOpenFile = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.hdf5';

        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("file", file);

            try {
                const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/load-experiment`, {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                const result = await response.json();

                if (result.status === "success") {
                    alert(result.message);
                } else if (result.status === "structure") {
                    setFilePath(result.filename);
                    setFileType(result.file_type);
                    setStructure(result.structure);
                    setCurrentGroup(result.structure);
                    setNavigationPath([]);
                    setStep(1);
                    setOpen(true);
                    console.log('Initial Structure:', result.structure);
                }
            } catch (err) {
                alert(`Failed to open file: ${err.message}`);
            }
        };

        input.click();
    };

    const navigateToGroup = (groupName) => {
        let group = structure;
        const newPath = [...navigationPath, groupName];

        try {
            for (const part of newPath) {
                if (!group.groups || !group.groups[part]) {
                    console.error(`Group not found: ${part} in path ${newPath.join('/')}`);
                    return;
                }
                group = group.groups[part];
            }
            setCurrentGroup({ ...group });
            setNavigationPath(newPath);
            console.log(`Navigated to: ${newPath.join('/')}`, 'Current Group:', group);
        } catch (error) {
            console.error('Navigation error:', error);
            alert('Error navigating group structure');
        }
    };

    const goBack = () => {
        if (navigationPath.length === 0) return;
        const newPath = navigationPath.slice(0, -1);
        let group = structure;

        try {
            for (const part of newPath) {
                if (!group.groups || !group.groups[part]) {
                    console.error(`Group not found: ${part} in path ${newPath.join('/')}`);
                    return;
                }
                group = group.groups[part];
            }
            setCurrentGroup({ ...group });
            setNavigationPath(newPath);
            console.log(`Went back to: ${newPath.join('/') || 'Root'}`, 'Current Group:', group);
        } catch (error) {
            console.error('Go back error:', error);
            alert('Error navigating back');
        }
    };

    const handleSelectForce = (path) => {
        setForcePath(path);
        setCurrentGroup(structure);
        setNavigationPath([]);
        setStep(2);
        console.log('Selected Force:', path);
    };

    const handleSelectZ = (path) => {
        setZPath(path);
        setStep(3);
        console.log('Selected Z:', path);
    };

    const handleMetadataChange = (e) => {
        setMetadata({ ...metadata, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/process-file`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ file_path: filePath, file_type: fileType, force_path: forcePath, z_path: zPath, metadata })
            });

            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const result = await response.json();
            alert(result.message);
            setOpen(false);
            setStep(0);
            window.location.reload();

            // Trigger parent callback with response data
            //   if (onProcessSuccess) {
            //     onProcessSuccess(result); // Pass result, e.g., { curves: 100, message: "JSON file processed", ... }
            //   }

        } catch (err) {
            alert(`Failed to process file: ${err.message}`);
        }
    };

    useEffect(() => {
        if (open && step <= 2) {
            console.log('Current Group State:', currentGroup);
        }
    }, [currentGroup, open, step]);

    return (
        <div>
            <Button variant="contained" onClick={handleOpenFile}>Open File</Button>
            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>
                    {step === 1 && "Select Force Dataset"}
                    {step === 2 && "Select Z Dataset"}
                    {step === 3 && "Enter Metadata"}
                </DialogTitle>
                <DialogContent>
                    {step <= 2 && (
                        <div>
                            <Typography variant="body1" gutterBottom>
                                Current Path: {navigationPath.length ? navigationPath.join('/') : 'Root'}
                            </Typography>
                            <FormControl fullWidth>
                                <InputLabel>Select Item</InputLabel>
                                <Select
                                    value=""
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value.includes('(Dataset')) {
                                            const cleanPath = value.split(' (Dataset')[0];
                                            step === 1 ? handleSelectForce(cleanPath) : handleSelectZ(cleanPath);
                                        } else {
                                            navigateToGroup(value);
                                        }
                                    }}
                                >
                                    {Object.keys(currentGroup.groups || {})
                                        .filter(key => key !== 'datasets')
                                        .map((name) => (
                                            <MenuItem key={name} value={name}>
                                                {name} (Group)
                                            </MenuItem>
                                        ))}
                                    {(currentGroup.groups.datasets || []).map((ds) => (
                                        <MenuItem key={ds.path} value={`${ds.path} (Dataset, Shape: ${ds.shape}, Dtype: ${ds.dtype})`}>
                                            {ds.name} (Dataset, Shape: {ds.shape}, Dtype: {ds.dtype})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            {navigationPath.length > 0 && (
                                <Button onClick={goBack} variant="outlined" style={{ marginTop: '10px' }}>
                                    Go Back
                                </Button>
                            )}
                        </div>
                    )}
                    {step === 3 && (
                        <div>
                            {Object.entries(metadata).map(([key, value]) => (
                                <TextField
                                    key={key}
                                    name={key}
                                    label={key.replace('_', ' ').toUpperCase()}
                                    value={value}
                                    onChange={handleMetadataChange}
                                    fullWidth
                                    margin="normal"
                                />
                            ))}
                        </div>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    {step === 3 && <Button onClick={handleSubmit}>Submit</Button>}
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default FileOpener;