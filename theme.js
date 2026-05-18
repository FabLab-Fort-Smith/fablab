import { createTheme } from "@mui/material/styles";

const theme = createTheme({
    palette: {
        mode: "dark",
        primary: {
            main: "#39ff14",
            light: "#7fff5a",
            dark: "#2da810",
            contrastText: "#050805",
        },
        secondary: {
            main: "#ff2bd6",
            light: "#ff7aec",
            dark: "#7a1366",
            contrastText: "#050805",
        },
        info: {
            main: "#5cf2ff",
            dark: "#167a86",
        },
        success: {
            main: "#39ff14",
            dark: "#2da810",
        },
        warning: {
            main: "#ffb000",
            dark: "#8a5e00",
        },
        error: {
            main: "#ff3838",
            dark: "#7a1414",
        },
        background: {
            default: "#050805",
            paper: "#0a100a",
        },
        text: {
            primary: "#b8ffc8",
            secondary: "#6fa07a",
            disabled: "#3d5a44",
        },
        divider: "#1a2a1a",
        action: {
            active: "#39ff14",
            hover: "rgba(57,255,20,0.06)",
            selected: "rgba(57,255,20,0.12)",
            disabled: "rgba(57,255,20,0.3)",
            disabledBackground: "rgba(57,255,20,0.08)",
        },
    },
    typography: {
        fontFamily: `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace`,
        h1: { fontFamily: `'Major Mono Display', 'JetBrains Mono', monospace`, letterSpacing: "-0.04em" },
        h2: { fontFamily: `'Major Mono Display', 'JetBrains Mono', monospace`, letterSpacing: "-0.04em" },
        h3: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
        h4: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 },
        h5: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 },
        h6: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 600 },
        body1: { fontFamily: `'JetBrains Mono', monospace`, fontSize: "13px" },
        body2: { fontFamily: `'JetBrains Mono', monospace`, fontSize: "12px" },
        button: {
            fontFamily: `'JetBrains Mono', monospace`,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
        },
        caption: { fontFamily: `'JetBrains Mono', monospace`, fontSize: "10.5px" },
        overline: { fontFamily: `'JetBrains Mono', monospace`, letterSpacing: "0.14em" },
    },
    shape: {
        borderRadius: 0,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: "#050805",
                    color: "#b8ffc8",
                    fontFamily: `'JetBrains Mono', ui-monospace, monospace`,
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#39ff14",
                    borderColor: "#39ff14",
                    backgroundColor: "transparent",
                    transition: "all 0.12s ease",
                    "&:hover": {
                        backgroundColor: "#39ff14",
                        color: "#050805",
                        boxShadow: "0 0 16px #39ff14",
                        borderColor: "#39ff14",
                    },
                },
                containedPrimary: {
                    backgroundColor: "#39ff14",
                    color: "#050805",
                    "&:hover": {
                        backgroundColor: "#7fff5a",
                        boxShadow: "0 0 20px #39ff14",
                    },
                },
                outlinedPrimary: {
                    borderColor: "#39ff14",
                    color: "#39ff14",
                },
                outlinedSecondary: {
                    borderColor: "#ff2bd6",
                    color: "#ff2bd6",
                    "&:hover": {
                        backgroundColor: "#ff2bd6",
                        color: "#050805",
                        boxShadow: "0 0 16px #ff2bd6",
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: "#0a100a",
                    color: "#b8ffc8",
                    borderRadius: 0,
                    backgroundImage: "none",
                    border: "1px solid #1a2a1a",
                    boxShadow: "none",
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: "#0a100a",
                    border: "1px solid #1a2a1a",
                    borderRadius: 0,
                    backgroundImage: "none",
                    boxShadow: "none",
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: "rgba(8,13,8,0.92)",
                    color: "#b8ffc8",
                    boxShadow: "none",
                    borderBottom: "1px solid #233823",
                    borderRadius: 0,
                    backgroundImage: "none",
                    backdropFilter: "blur(6px)",
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: "#080d08",
                    color: "#b8ffc8",
                    borderRadius: 0,
                    boxShadow: "none",
                    borderRight: "1px solid #233823",
                    backgroundImage: "none",
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                root: { color: "#6fa07a" },
                indicator: { backgroundColor: "#39ff14" },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    fontFamily: `'JetBrains Mono', monospace`,
                    color: "#6fa07a",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    fontSize: "11px",
                    minHeight: 40,
                    "&.Mui-selected": { color: "#39ff14", textShadow: "0 0 6px #39ff14" },
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiInputBase-input": {
                        color: "#b8ffc8",
                        fontFamily: `'JetBrains Mono', monospace`,
                        fontSize: "13px",
                    },
                    "& .MuiInputLabel-root": { color: "#6fa07a", fontFamily: `'JetBrains Mono', monospace` },
                    "& .MuiOutlinedInput-root": {
                        borderRadius: 0,
                        "& fieldset": { borderColor: "#233823" },
                        "&:hover fieldset": { borderColor: "#2d4a2d" },
                        "&.Mui-focused fieldset": { borderColor: "#39ff14", boxShadow: "0 0 12px rgba(57,255,20,0.18)" },
                    },
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: {
                    color: "#6fa07a",
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontSize: "12px",
                    "&.Mui-focused": { color: "#39ff14" },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                    color: "#b8ffc8",
                    fontFamily: `'JetBrains Mono', monospace`,
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "#233823" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#2d4a2d" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#39ff14" },
                },
                input: {
                    "&:-webkit-autofill": {
                        WebkitBoxShadow: "0 0 0 100px #050805 inset",
                        WebkitTextFillColor: "#b8ffc8",
                        caretColor: "#39ff14",
                        borderRadius: 0,
                    },
                },
            },
        },
        MuiCheckbox: {
            styleOverrides: {
                root: {
                    color: "#39ff14",
                    "&.Mui-checked": { color: "#39ff14" },
                },
            },
        },
        MuiFormControlLabel: {
            styleOverrides: {
                label: { color: "#b8ffc8", fontFamily: `'JetBrains Mono', monospace`, fontSize: "13px" },
            },
        },
        MuiRadio: {
            styleOverrides: {
                root: {
                    color: "#39ff14",
                    "&.Mui-checked": { color: "#39ff14" },
                },
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    backgroundColor: "#0a100a",
                    borderRadius: 0,
                    border: "1px solid",
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontSize: "12.5px",
                },
                standardError: { borderColor: "#ff3838", color: "#ff3838", "& .MuiAlert-icon": { color: "#ff3838" } },
                standardSuccess: { borderColor: "#39ff14", color: "#39ff14", "& .MuiAlert-icon": { color: "#39ff14" } },
                standardWarning: { borderColor: "#ffb000", color: "#ffb000", "& .MuiAlert-icon": { color: "#ffb000" } },
                standardInfo: { borderColor: "#5cf2ff", color: "#5cf2ff", "& .MuiAlert-icon": { color: "#5cf2ff" } },
            },
        },
        MuiDivider: {
            styleOverrides: { root: { borderColor: "#1a2a1a" } },
        },
        MuiList: {
            styleOverrides: {
                root: { backgroundColor: "#0a100a", color: "#b8ffc8", padding: 0 },
            },
        },
        MuiListItem: {
            styleOverrides: { root: { color: "#b8ffc8", padding: "6px 14px" } },
        },
        MuiListItemText: {
            styleOverrides: {
                primary: { color: "#b8ffc8", fontFamily: `'JetBrains Mono', monospace`, fontSize: "12.5px" },
                secondary: { color: "#6fa07a", fontFamily: `'JetBrains Mono', monospace`, fontSize: "11px" },
            },
        },
        MuiListItemIcon: {
            styleOverrides: { root: { color: "#39ff14", minWidth: 36 } },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontSize: "10.5px",
                    letterSpacing: "0.08em",
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: "#0a100a",
                    border: "1px solid #233823",
                    color: "#b8ffc8",
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontSize: "11px",
                    borderRadius: 0,
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: "#080d08",
                    border: "1px solid #233823",
                    borderRadius: 0,
                    backgroundImage: "none",
                    boxShadow: "0 0 40px rgba(57,255,20,0.15)",
                },
            },
        },
        MuiDialogTitle: {
            styleOverrides: {
                root: {
                    fontFamily: `'JetBrains Mono', monospace`,
                    color: "#b8ffc8",
                    fontSize: "13px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid #1a2a1a",
                    padding: "12px 18px",
                },
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: { backgroundColor: "#080d08", color: "#b8ffc8", padding: "18px" },
            },
        },
        MuiSelect: {
            styleOverrides: {
                root: { borderRadius: 0, fontFamily: `'JetBrains Mono', monospace`, color: "#b8ffc8" },
                icon: { color: "#6fa07a" },
            },
        },
        MuiMenuItem: {
            styleOverrides: {
                root: {
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontSize: "12.5px",
                    color: "#b8ffc8",
                    "&:hover": { backgroundColor: "rgba(57,255,20,0.06)" },
                    "&.Mui-selected": { backgroundColor: "rgba(57,255,20,0.1)", color: "#39ff14" },
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    fontFamily: `'JetBrains Mono', monospace`,
                    fontSize: "12.5px",
                    borderBottom: "1px solid #1a2a1a",
                    color: "#b8ffc8",
                    padding: "9px 12px",
                },
                head: {
                    color: "#6fa07a",
                    fontSize: "10.5px",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    backgroundColor: "#080d08",
                },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: {
                    "&:hover": { backgroundColor: "rgba(57,255,20,0.04)" },
                },
            },
        },
        MuiLinearProgress: {
            styleOverrides: {
                root: { height: 4, borderRadius: 0, backgroundColor: "#0f1810" },
                bar: { backgroundColor: "#39ff14", boxShadow: "0 0 8px #39ff14" },
            },
        },
        MuiCircularProgress: {
            styleOverrides: { root: { color: "#39ff14" } },
        },
        MuiSwitch: {
            styleOverrides: {
                switchBase: { "&.Mui-checked": { color: "#39ff14" } },
                track: { ".Mui-checked.Mui-checked + &": { backgroundColor: "#39ff14" } },
            },
        },
        MuiBadge: {
            styleOverrides: {
                badge: { backgroundColor: "#ff2bd6", color: "#050805", fontFamily: `'JetBrains Mono', monospace`, fontSize: "10px" },
            },
        },
    },
});

export default theme;
