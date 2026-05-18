"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Container,
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Autocomplete,
  Alert,
  CircularProgress,
  Tooltip,
  IconButton,
} from "@mui/material";
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import LinkIcon from "@mui/icons-material/Link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SquareTransactionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [linkDialog, setLinkDialog] = useState({ open: false, customerId: null });
  const [selectedUser, setSelectedUser] = useState(null);
  const [linking, setLinking] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (status === "authenticated") {
      if (session.user.role !== "admin") {
        router.push("/dashboard");
      } else {
        fetchTransactions();
        fetchAllUsers();
      }
    }
  }, [status, session]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/square/transactions");
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const res = await fetch("/api/v1/users?limit=1000");
      const data = await res.json();
      setAllUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const openLinkDialog = (customerId) => {
    setLinkDialog({ open: true, customerId });
    setSelectedUser(null);
  };

  const handleLink = async () => {
    if (!selectedUser || !linkDialog.customerId) return;
    setLinking(true);
    try {
      const res = await fetch("/api/v1/admin/square/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userID: selectedUser.userID,
          squareCustomerId: linkDialog.customerId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ severity: "success", message: `Linked and synced ${selectedUser.firstName} ${selectedUser.lastName}.` });
        setLinkDialog({ open: false, customerId: null });
        fetchTransactions();
      } else {
        setToast({ severity: "error", message: data.error || "Link failed." });
      }
    } catch (err) {
      setToast({ severity: "error", message: "An error occurred." });
    } finally {
      setLinking(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === "COMPLETED") return "success";
    if (status === "FAILED" || status === "CANCELED") return "error";
    return "default";
  };

  const columns = [
    {
      field: "createdAt",
      headerName: "Date",
      flex: 1,
      valueFormatter: (value) => value ? new Date(value).toLocaleDateString() : "—",
    },
    {
      field: "amount",
      headerName: "Amount",
      width: 100,
      valueFormatter: (value) => value != null ? `$${value.toFixed(2)}` : "—",
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      renderCell: (params) => (
        <Chip label={params.value} color={getStatusColor(params.value)} size="small" />
      ),
    },
    {
      field: "note",
      headerName: "Note",
      flex: 1,
      renderCell: (params) => (
        <Typography variant="caption" noWrap>{params.value || "—"}</Typography>
      ),
    },
    {
      field: "linkedUser",
      headerName: "Linked Member",
      flex: 1.5,
      renderCell: (params) => {
        const user = params.value;
        if (user) {
          return (
            <Typography variant="body2">
              {user.firstName} {user.lastName} ({user.email})
            </Typography>
          );
        }
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" color="text.secondary">Unknown</Typography>
            <Tooltip title="Link to a member">
              <IconButton
                size="small"
                color="primary"
                onClick={() => openLinkDialog(params.row.customerId)}
                disabled={!params.row.customerId}
              >
                <LinkIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
    {
      field: "customerId",
      headerName: "Square Customer",
      flex: 1,
      renderCell: (params) => (
        <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
          {params.value || "—"}
        </Typography>
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
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">Square Transactions</Typography>
          <Typography variant="body2" color="text.secondary">
            View recent payments and link Square customers to Lab members.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={fetchTransactions}>Refresh</Button>
      </Box>

      {toast && (
        <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ mb: 2 }}>
          {toast.message}
        </Alert>
      )}

      <Paper sx={{ height: "calc(100vh - 220px)" }}>
        <DataGrid
          rows={transactions}
          columns={columns}
          getRowId={(row) => row.id}
          slots={{ toolbar: GridToolbar }}
          slotProps={{ toolbar: { showQuickFilter: true } }}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        />
      </Paper>

      <Dialog open={linkDialog.open} onClose={() => setLinkDialog({ open: false, customerId: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Link Square Customer to Member</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Square Customer ID: <code>{linkDialog.customerId}</code>
            <br />
            Select the Lab member who made this payment. Their subscription will be synced automatically.
          </DialogContentText>
          <Autocomplete
            options={allUsers}
            getOptionLabel={(u) => `${u.firstName} ${u.lastName} (${u.email})`}
            value={selectedUser}
            onChange={(_, v) => setSelectedUser(v)}
            renderInput={(params) => <TextField {...params} label="Search members..." />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialog({ open: false, customerId: null })}>Cancel</Button>
          <Button
            onClick={handleLink}
            variant="contained"
            disabled={!selectedUser || linking}
          >
            {linking ? "Linking..." : "Link & Sync"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
