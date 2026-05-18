"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Container,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  Stack,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function PlansPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, plan: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, plan: null });
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({ name: "", monthlyPrice: "", annualPrice: "" });
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (status === "authenticated") {
      if (session.user.role !== "admin") {
        router.push("/dashboard");
      } else {
        fetchPlans();
      }
    }
  }, [status, session]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      const data = await res.json();
      setPlans(data);
    } catch (err) {
      setToast({ severity: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.monthlyPrice) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          monthlyPriceCents: Math.round(parseFloat(formData.monthlyPrice) * 100),
          annualPriceCents: formData.annualPrice
            ? Math.round(parseFloat(formData.annualPrice) * 100)
            : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ severity: "success", message: "Plan created successfully." });
        setAddDialog(false);
        setFormData({ name: "", monthlyPrice: "", annualPrice: "" });
        fetchPlans();
      } else {
        setToast({ severity: "error", message: data.error || "Failed to create plan." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editName || !editDialog.plan) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: editDialog.plan.id,
          name: editName,
          version: editDialog.plan.version,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ severity: "success", message: "Plan updated." });
        setEditDialog({ open: false, plan: null });
        fetchPlans();
      } else {
        setToast({ severity: "error", message: data.error || "Failed to update plan." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.plan) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/admin/plans", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: deleteDialog.plan.id }),
      });
      if (res.ok) {
        setToast({ severity: "success", message: "Plan archived." });
        setDeleteDialog({ open: false, plan: null });
        fetchPlans();
      } else {
        const data = await res.json();
        setToast({ severity: "error", message: data.error || "Failed to delete plan." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { field: "name", headerName: "Plan Name", flex: 1 },
    {
      field: "variations",
      headerName: "Billing Options",
      flex: 2,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {(params.value || []).map((v) => (
            <Chip key={v.id} label={`${v.name} (${v.cadence})`} size="small" variant="outlined" />
          ))}
        </Stack>
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 110,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Edit name">
            <IconButton
              size="small"
              color="primary"
              onClick={() => {
                setEditName(params.row.name);
                setEditDialog({ open: true, plan: params.row });
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Archive plan">
            <IconButton
              size="small"
              color="error"
              onClick={() => setDeleteDialog({ open: true, plan: params.row })}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (status === "loading" || loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (session?.user?.role !== "admin") {
    return <Typography color="error">Access Denied</Typography>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">Membership Plans</Typography>
          <Typography variant="body2" color="text.secondary">
            Create and manage Square subscription plans — no Square dashboard needed.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddDialog(true)}
        >
          Add Plan
        </Button>
      </Box>

      {toast && (
        <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ mb: 2 }}>
          {toast.message}
        </Alert>
      )}

      <Paper sx={{ height: 500 }}>
        <DataGrid
          rows={plans}
          columns={columns}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        />
      </Paper>

      {/* Add Plan Dialog */}
      <Dialog open={addDialog} onClose={() => setAddDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add New Plan</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Plan Name"
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            />
            <TextField
              label="Monthly Price (USD)"
              type="number"
              fullWidth
              value={formData.monthlyPrice}
              onChange={(e) => setFormData((p) => ({ ...p, monthlyPrice: e.target.value }))}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <TextField
              label="Annual Price (USD, optional)"
              type="number"
              fullWidth
              value={formData.annualPrice}
              onChange={(e) => setFormData((p) => ({ ...p, annualPrice: e.target.value }))}
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialog(false)}>Cancel</Button>
          <Button
            onClick={handleAdd}
            variant="contained"
            disabled={!formData.name || !formData.monthlyPrice || submitting}
          >
            {submitting ? "Creating..." : "Create Plan"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, plan: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Plan Name</DialogTitle>
        <DialogContent>
          <TextField
            label="Plan Name"
            fullWidth
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, plan: null })}>Cancel</Button>
          <Button onClick={handleEdit} variant="contained" disabled={!editName || submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, plan: null })}>
        <DialogTitle>Archive Plan?</DialogTitle>
        <DialogContent>
          <Typography>
            Archive <strong>{deleteDialog.plan?.name}</strong>? It will no longer appear as an option
            for new members. Existing subscriptions will not be affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, plan: null })}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={submitting}>
            {submitting ? "Archiving..." : "Archive"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
