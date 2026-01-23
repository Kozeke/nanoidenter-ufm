import { useEffect, useState } from "react";
import { getExperiment } from "../api/experiments";
import { useAuthStore } from "../state/useAuthStore";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Stack,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Button,
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/* ───────────────────────────────────────────── */

export default function ExperimentPreviewModal({ id, onClose, onOpen }) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  function formatYoungsModulus(mean, std, decimals = 1) {
    if (mean == null || std == null) return "—";
    return `${mean.toFixed(decimals)} ± ${std.toFixed(decimals)}`;
  }
  
  useEffect(() => {
    if (!id || !token) return;

    let mounted = true;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const result = await getExperiment(token, id);
        if (mounted) setData(result);
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load experiment.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [id, token]);

  if (!id) return null;

  const hasFilters = !!data?.filters;
  const hasFmodel =
    Object.keys(data?.filters?.f_models || {}).length > 0;
  const hasEmodel =
    Object.keys(data?.filters?.e_models || {}).length > 0;

  return (
    <Dialog open={!!id} onClose={onClose} maxWidth="md" fullWidth>
      {/* ───────────── Header ───────────── */}
      <DialogTitle>
        <Stack spacing={0.5}>
          <Typography variant="h6">
            {data?.name || `Experiment #${id}`}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            {data?.created_at && (
              <Typography variant="caption" color="text.secondary">
                {formatDate(data.created_at)}
              </Typography>
            )}
            {data?.status && (
              <Chip
                size="small"
                label={data.status}
                color={
                  data.status === "Completed"
                    ? "success"
                    : "warning"
                }
              />
            )}
          </Stack>
        </Stack>
      </DialogTitle>

      {/* ───────────── Content ───────────── */}
      <DialogContent dividers>
        {loading && (
          <Stack alignItems="center" py={6}>
            <CircularProgress />
            <Typography variant="body2" mt={2}>
              Loading experiment…
            </Typography>
          </Stack>
        )}

        {error && (
          <Typography color="error" align="center" py={4}>
            {error}
          </Typography>
        )}

        {data && !loading && (
          <Stack spacing={2}>
            {/* ───────── Overview ───────── */}
            <Typography variant="subtitle1">Overview</Typography>

            <KeyValue label="Experiment ID" value={data.id} />
            {data.curve_id != null && (
              <KeyValue label="Curve ID" value={data.curve_id} />
            )}
            <Typography variant="body2">
              <strong>Young’s modulus:</strong>{" "}
              {formatYoungsModulus(
                data.youngs_modulus_mean,
                data.youngs_modulus_std
              )} Pa
            </Typography>

            <Divider />

            {/* ───────── Filters ───────── */}
            {hasFilters && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Filters</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <KeyValue
                    label="Regular filters"
                    value={
                      Object.keys(data.filters.regular || {}).join(", ") ||
                      "None"
                    }
                  />
                  <KeyValue
                    label="Contact point filters"
                    value={
                      Object.keys(data.filters.cp_filters || {}).join(", ") ||
                      "None"
                    }
                  />
                </AccordionDetails>
              </Accordion>
            )}

            {/* ───────── Force model ───────── */}
            {hasFmodel && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Force model</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
                    {data.force_model_params?.poisson != null && (
                      <Chip
                        label={`Poisson: ${data.force_model_params.poisson}`}
                      />
                    )}
                    {data.force_model_params?.maxInd != null && (
                      <Chip
                        label={`MaxInd: ${data.force_model_params.maxInd}`}
                      />
                    )}
                    {data.force_model_params?.minInd != null && (
                      <Chip
                        label={`MinInd: ${data.force_model_params.minInd}`}
                      />
                    )}
                  </Stack>

                  <RenderValue
                    value={data.force_model_params}
                    skipKnownFields={knownForceFields}
                  />
                </AccordionDetails>
              </Accordion>
            )}

            {/* ───────── Elasticity params ───────── */}
            {hasEmodel && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Elasticity parameters</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
                    {data.elasticity_params?.window != null && (
                      <Chip
                        label={`Window: ${data.elasticity_params.window}`}
                      />
                    )}
                    {data.elasticity_params?.order != null && (
                      <Chip
                        label={`Order: ${data.elasticity_params.order}`}
                      />
                    )}
                  </Stack>

                  <RenderValue
                    value={data.elasticity_params}
                    skipKnownFields={knownElasticityFields}
                  />
                </AccordionDetails>
              </Accordion>
            )}
          </Stack>
        )}
      </DialogContent>

      {/* ───────────── Footer ───────────── */}
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        {onOpen && (
          <Button variant="contained" onClick={() => onOpen(data)}>
            Open in dashboard
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/* ───────────────────── Helpers ───────────────────── */

function KeyValue({ label, value }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 160 }}
      >
        {label}
      </Typography>
      <Typography variant="body2">
        {value ?? "—"}
      </Typography>
    </Stack>
  );
}

function RenderValue({ value, level = 0, skipKnownFields = [] }) {
  if (value == null) return null;

  if (typeof value !== "object") {
    return (
      <Typography variant="body2" sx={{ ml: level * 2 }}>
        {String(value)}
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ ml: level * 2 }}>
      {Object.entries(value)
        .filter(([k]) => !skipKnownFields.includes(k))
        .map(([key, val]) => (
          <Stack key={key} direction="row" spacing={1}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ minWidth: 140 }}
            >
              {niceName(key)}
            </Typography>
            <Typography variant="body2">
              {formatValue(val)}
            </Typography>
          </Stack>
        ))}
    </Stack>
  );
}

const knownForceFields = ["poisson", "maxInd", "minInd"];
const knownElasticityFields = ["interpolate", "order", "window"];

const niceName = (key) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

const formatValue = (v) =>
  v === true ? "Yes" : v === false ? "No" : v ?? "—";

const formatDate = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};
