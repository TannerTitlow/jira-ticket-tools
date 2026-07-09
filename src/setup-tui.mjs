import fs from "node:fs";
import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import { PasswordInput, Spinner, TextInput } from "@inkjs/ui";

const h = React.createElement;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getFirstName(displayName) {
  const trimmed = String(displayName || "").trim();
  if (!trimmed) {
    return "there";
  }
  return trimmed.split(/\s+/)[0];
}

async function validateJiraCredentials(values) {
  const jiraBase = String(values.jiraBase || "").trim().replace(/\/$/, "");
  const jiraEmail = String(values.jiraEmail || "").trim();
  const jiraApiToken = String(values.jiraApiToken || "").trim();
  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString("base64");
  const url = `${jiraBase}/rest/api/3/myself`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${auth}`
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        message: "Authentication failed. Please verify your values and retry the setup."
      };
    }

    const data = await response.json();
    return {
      ok: true,
      firstName: getFirstName(data.displayName)
    };
  } catch {
    return {
      ok: false,
      message: "Authentication failed. Please verify your values and retry the setup."
    };
  }
}

function SetupWizard({ initialValues, onDone, onCancel }) {
  const { exit } = useApp();
  const fields = useMemo(
    () => [
      {
        key: "jiraBase",
        label: "Jira base URL",
        placeholder: "https://your-domain.atlassian.net",
        mode: "text"
      },
      {
        key: "jiraEmail",
        label: "Jira email",
        placeholder: "you@company.com",
        mode: "text"
      },
      {
        key: "jiraApiToken",
        label: "Jira API token",
        placeholder: "Paste API token",
        mode: "password"
      }
    ],
    []
  );
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("input");
  const [finalStatus, setFinalStatus] = useState(null);
  const [finalMessage, setFinalMessage] = useState("");
  const [values, setValues] = useState({
    jiraBase: initialValues.jiraBase || "",
    jiraEmail: initialValues.jiraEmail || "",
    jiraApiToken: initialValues.jiraApiToken || ""
  });

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      onCancel();
      exit();
    }
  });

  const field = fields[index];

  const submit = (value) => {
    if (phase !== "input") {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setError(`${field.label} is required.`);
      return;
    }

    const nextValues = {
      ...values,
      [field.key]: trimmed
    };
    setValues(nextValues);

    if (index < fields.length - 1) {
      setIndex(index + 1);
      return;
    }

    setPhase("validating");
    validateJiraCredentials(nextValues).then(async (result) => {
      if (result.ok) {
        const message = `✅ You're all set up, ${result.firstName}!`;
        setFinalStatus("success");
        setFinalMessage(message);
        setPhase("final");
        await sleep(900);
        onDone({
          status: "success",
          values: nextValues,
          firstName: result.firstName,
          message,
          preserveTui: true
        });
        exit();
        return;
      }

      setFinalStatus("failure");
      setFinalMessage(`❌ ${result.message}`);
      setPhase("final");
      await sleep(1400);
      onDone({
        status: "auth_failed",
        message: result.message,
        preserveTui: true
      });
      exit();
    }).catch(async () => {
      const message = "Authentication failed. Please verify your values and retry the setup.";
      setFinalStatus("failure");
      setFinalMessage(`❌ ${message}`);
      setPhase("final");
      await sleep(1400);
      onDone({
        status: "auth_failed",
        message,
        preserveTui: true
      });
      exit();
    });
  };

  const InputComponent = field.mode === "password" ? PasswordInput : TextInput;

  if (phase === "validating") {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Text, { color: "cyan", bold: true }, "jira-ticket-tools setup"),
      h(Text, {}, "Step 4/4"),
      h(Spinner, { label: "Validating Jira credentials..." })
    );
  }

  if (phase !== "input") {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Text, { color: "cyan", bold: true }, "jira-ticket-tools setup"),
      h(Text, { color: finalStatus === "success" ? "green" : "red" }, finalMessage)
    );
  }

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { color: "cyan", bold: true }, "jira-ticket-tools setup"),
    h(Text, {}, `Step ${index + 1}/${fields.length + 1}`),
    h(Text, {}, "Create a token at: https://id.atlassian.com/manage-profile/security/api-tokens"),
    h(Box, { flexDirection: "column", marginTop: 1 },
      h(Text, {}, `${field.label}:`),
      h(InputComponent, {
        key: field.key,
        defaultValue: values[field.key],
        placeholder: field.placeholder,
        onSubmit: submit
      })
    ),
    error ? h(Text, { color: "red" }, error) : null,
    h(Text, { color: "gray" }, "Press Enter to continue. Press Esc to cancel.")
  );
}

function getProviderLabel(provider) {
  if (provider === "opencode") {
    return "OpenCode";
  }
  if (provider === "claude") {
    return "Claude Code";
  }
  return "Cursor";
}

function IntegrationReportBlock({ integrationReport }) {
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { color: "cyan" }, "AI Provider Integration:"),
    ...(integrationReport.results || []).map((item) => {
      const color = item.status === "installed" ? "green" : item.status === "skipped" ? "yellow" : "red";
      const icon = item.status === "installed" ? "✅" : item.status === "skipped" ? "⏭️" : "❌";
      return h(Text, { key: item.provider, color }, `${icon}  ${getProviderLabel(item.provider)}: ${item.message}`);
    }),
    h(Text, {}, ""),
    h(
      Text,
      { color: integrationReport.failed > 0 ? "red" : "green" },
      `Summary: installed=${integrationReport.installed}, skipped=${integrationReport.skipped}, failed=${integrationReport.failed}`
    )
  );
}

function SetupSummary({ configPath, integrationReport, skippedIntegration, onDone }) {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      onDone({ preserveTui: true });
      exit();
    }, 1100);
    return () => {
      clearTimeout(timer);
    };
  }, [exit, onDone]);

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, {}, `Config saved: ${configPath}`),
    skippedIntegration
      ? h(Text, { color: "yellow" }, "⏭️ Integration step skipped (--no-integrate).")
      : h(IntegrationReportBlock, { integrationReport })
  );
}

function IntegrateSummary({ integrationReport, onDone }) {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      onDone({ preserveTui: true });
      exit();
    }, 1100);
    return () => {
      clearTimeout(timer);
    };
  }, [exit, onDone]);

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { color: "cyan", bold: true }, "jira-ticket-tools integrate"),
    h(IntegrationReportBlock, { integrationReport })
  );
}

function UninstallSummary({ uninstallReport, onDone }) {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      onDone({ preserveTui: true });
      exit();
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [exit, onDone]);

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { color: "cyan", bold: true }, "jira-ticket-tools uninstall"),
    ...(uninstallReport.providers || []).flatMap((item) => {
      const providerName = getProviderLabel(item.provider);
      const isNotFound = item.status === "not_found";
      const color = isNotFound ? "yellow" : uninstallReport.dryRun ? "cyan" : "green";
      const icon = isNotFound ? "⏭️" : uninstallReport.dryRun ? "🧪" : "✅";
      const headline = isNotFound
        ? `${icon}  ${providerName}: No integration files found.`
        : `${icon}  ${providerName}: ${uninstallReport.dryRun ? "Would remove" : "Removed"} ${item.foundCount} ${item.foundCount === 1 ? "path" : "paths"}.`;

      const rows = [h(Text, { key: `${item.provider}-headline`, color }, headline)];
      for (const targetPath of item.affectedPaths || []) {
        rows.push(h(Text, { key: `${item.provider}-${targetPath}`, color: "gray" }, `  - ${targetPath}`));
      }
      return rows;
    }),
    uninstallReport.config
      ? h(
        Text,
        {
          color: uninstallReport.config.status === "not_found"
            ? "yellow"
            : uninstallReport.dryRun ? "cyan" : "green"
        },
        uninstallReport.config.status === "not_found"
          ? `⏭️  Config: No config file found at ${uninstallReport.config.path}`
          : `${uninstallReport.dryRun ? "🧪" : "✅"}  Config: ${uninstallReport.dryRun ? "Would remove" : "Removed"} ${uninstallReport.config.path}`
      )
      : null,
    h(
      Text,
      { color: uninstallReport.affectedCount > 0 ? (uninstallReport.dryRun ? "cyan" : "green") : "yellow" },
      `Summary: affected=${uninstallReport.affectedCount}, untouched providers=${uninstallReport.untouchedCount}`
    )
  );
}

function maskConfigValue(key, value) {
  const normalized = String(value || "");
  if (!normalized) {
    return "(not set)";
  }
  if (key !== "JIRA_API_TOKEN") {
    return normalized;
  }
  if (normalized.length <= 8) {
    return "*".repeat(normalized.length);
  }
  const head = normalized.slice(0, 4);
  const tail = normalized.slice(-4);
  return `${head}${"*".repeat(normalized.length - 8)}${tail}`;
}

function ConfigEditor({ initialValues, onDone, onCancel }) {
  const { exit } = useApp();
  const fields = useMemo(
    () => [
      {
        key: "JIRA_BASE",
        label: "Jira base URL",
        placeholder: "https://your-domain.atlassian.net",
        mode: "text"
      },
      {
        key: "JIRA_EMAIL",
        label: "Jira email",
        placeholder: "you@company.com",
        mode: "text"
      },
      {
        key: "JIRA_API_TOKEN",
        label: "Jira API token",
        placeholder: "Paste API token",
        mode: "password"
      }
    ],
    []
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingKey, setEditingKey] = useState("");
  const [phase, setPhase] = useState("input");
  const [values, setValues] = useState({
    JIRA_BASE: initialValues.JIRA_BASE || "",
    JIRA_EMAIL: initialValues.JIRA_EMAIL || "",
    JIRA_API_TOKEN: initialValues.JIRA_API_TOKEN || ""
  });
  const [status, setStatus] = useState("Use Up/Down to select a field. Press Enter to edit.");
  const [statusColor, setStatusColor] = useState("gray");

  const attemptSaveAndExit = async () => {
    const missingField = fields.find((field) => !String(values[field.key] || "").trim());
    if (missingField) {
      setStatusColor("red");
      setStatus(`${missingField.label} is required before saving.`);
      return;
    }

    setPhase("validating");
    const result = await validateJiraCredentials({
      jiraBase: values.JIRA_BASE,
      jiraEmail: values.JIRA_EMAIL,
      jiraApiToken: values.JIRA_API_TOKEN
    });

    if (!result.ok) {
      setPhase("input");
      setStatusColor("red");
      setStatus("❌ Authentication failed. Please verify your values before saving.");
      return;
    }

    setPhase("final");
    setStatusColor("green");
    setStatus(`✅ You're all set up, ${result.firstName}!`);
    await sleep(850);
    onDone({ preserveTui: true, status: "done", values });
    exit();
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onCancel({ preserveTui: true, status: "cancelled" });
      exit();
      return;
    }

    if (phase !== "input") {
      return;
    }

    if (key.escape) {
      if (editingKey) {
        setEditingKey("");
        setStatusColor("yellow");
        setStatus("Edit cancelled. Press Enter to edit a field, or Esc again to validate/save and exit.");
        return;
      }
      void attemptSaveAndExit();
      return;
    }

    if (editingKey) {
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((current) => (current - 1 + fields.length) % fields.length);
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((current) => (current + 1) % fields.length);
      return;
    }

    if (key.return || input === " ") {
      const selected = fields[selectedIndex];
      setEditingKey(selected.key);
      setStatusColor("gray");
      setStatus(`Editing ${selected.label}. Press Enter to submit.`);
    }
  });

  if (phase === "validating") {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Text, { color: "cyan", bold: true }, "jira-ticket-tools config"),
      h(Spinner, { label: "Validating Jira credentials before save..." })
    );
  }

  if (phase === "final") {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Text, { color: "cyan", bold: true }, "jira-ticket-tools config"),
      h(Text, { color: "green" }, status)
    );
  }

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { color: "cyan", bold: true }, "jira-ticket-tools config"),
    ...fields.map((field, index) => {
      const isSelected = index === selectedIndex;
      const isEditing = editingKey === field.key;
      const selectMark = isSelected ? "❯" : " ";
      const InputComponent = field.mode === "password" ? PasswordInput : TextInput;
      const rowLabel = `${selectMark} ${field.label}:`;

      if (isEditing) {
        return h(
          Box,
          { key: field.key, flexDirection: "column" },
          h(Text, { color: "cyan" }, rowLabel),
          h(InputComponent, {
            key: `${field.key}-input`,
            defaultValue: values[field.key],
            placeholder: field.placeholder,
            onSubmit: (nextValue) => {
              const updatedValue = String(nextValue || "").trim();
              setValues((current) => ({ ...current, [field.key]: updatedValue }));
              setEditingKey("");
              setStatusColor("gray");
              setStatus(`Updated ${field.label}. Press Enter to edit another field or Esc to save and exit.`);
            }
          })
        );
      }

      return h(
        Text,
        { key: field.key, color: isSelected ? "cyan" : "white" },
        `${rowLabel} ${maskConfigValue(field.key, values[field.key])}`
      );
    }),
    h(Text, { color: statusColor }, status),
    h(Text, { color: "gray" }, "Esc saves and exits. Ctrl+C exits.")
  );
}

function ExportInputForm({ initialValues, onDone, onCancel }) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingKey, setEditingKey] = useState("");
  const [confirmCreateDir, setConfirmCreateDir] = useState("");
  const [values, setValues] = useState({
    issueKey: initialValues.issueKey || "",
    format: (initialValues.format || "md").toLowerCase(),
    outputDirectory: initialValues.outputDirectory || ""
  });
  const [status, setStatus] = useState("Use Up/Down to select. Press Enter to edit fields or start export.");
  const [statusColor, setStatusColor] = useState("gray");

  const fields = useMemo(
    () => [
      { key: "issueKey", label: "Issue key", placeholder: "PROJ-1234" },
      { key: "format", label: "Format (md|json|xml)", placeholder: "md" },
      { key: "outputDirectory", label: "Output directory (optional)", placeholder: "docs/jira-exports/PROJ-1234" },
      { key: "start", label: "Start export" }
    ],
    []
  );

  const getDefaultOutputDirectory = () => {
    const issueKey = String(values.issueKey || "").trim() || "ISSUE-1234";
    return `docs/jira-exports/${issueKey}`;
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onCancel({ status: "cancelled" });
      exit();
      return;
    }

    if (key.escape) {
      if (editingKey) {
        setEditingKey("");
        setStatusColor("yellow");
        setStatus("Edit cancelled. Press Enter to edit a field, or Esc again to cancel export.");
        return;
      }
      onCancel({ status: "cancelled" });
      exit();
      return;
    }

    if (confirmCreateDir) {
      const normalized = String(input || "").trim().toLowerCase();
      if (key.return || normalized === "y") {
        onDone({
          status: "submit",
          values: {
            issueKey: String(values.issueKey || "").trim(),
            format: String(values.format || "md").trim().toLowerCase(),
            outputDirectory: confirmCreateDir,
            createOutputDirectory: true
          }
        });
        exit();
        return;
      }
      if (normalized === "n") {
        setConfirmCreateDir("");
        setStatusColor("yellow");
        setStatus("Directory creation declined. Update Output directory or cancel.");
      }
      return;
    }

    if (editingKey) {
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((current) => (current - 1 + fields.length) % fields.length);
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((current) => (current + 1) % fields.length);
      return;
    }

    if (key.return || input === " ") {
      const selected = fields[selectedIndex];
      if (!selected) {
        return;
      }
      if (selected.key === "format") {
        const formats = ["md", "json", "xml"];
        const currentIndex = formats.indexOf(values.format);
        const nextFormat = formats[(currentIndex + 1 + formats.length) % formats.length];
        setValues((current) => ({
          ...current,
          format: nextFormat
        }));
        setStatusColor("gray");
        setStatus(`Format set to ${nextFormat}. Press Enter to cycle again.`);
        return;
      }
      if (selected.key === "start") {
        const issueKey = String(values.issueKey || "").trim();
        const format = String(values.format || "md").trim().toLowerCase();
        if (!issueKey) {
          setStatusColor("red");
          setStatus("Issue key is required.");
          return;
        }
        if (!["md", "json", "xml"].includes(format)) {
          setStatusColor("red");
          setStatus("Format must be md, json, or xml.");
          return;
        }

        const outputDirectory = String(values.outputDirectory || "").trim() || getDefaultOutputDirectory();
        if (!fs.existsSync(outputDirectory)) {
          setConfirmCreateDir(outputDirectory);
          setStatusColor("yellow");
          setStatus(`Output directory not found: ${outputDirectory}. Create it? (y/n)`);
          return;
        }

        onDone({
          status: "submit",
          values: {
            issueKey,
            format,
            outputDirectory,
            createOutputDirectory: false
          }
        });
        exit();
        return;
      }

      setStatusColor("gray");
      setEditingKey(selected.key);
      setStatus(`Editing ${selected.label}. Press Enter to submit.`);
    }
  });

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { color: "cyan", bold: true }, "jira-ticket-tools export"),
    ...fields.map((field, index) => {
      const isSelected = selectedIndex === index;
      const isEditing = editingKey === field.key;
      const marker = isSelected ? "❯" : " ";

      if (field.key === "start") {
        return h(Text, { key: field.key, color: isSelected ? "green" : "white", bold: isSelected }, `${marker} ${field.label}`);
      }

      if (isEditing && field.key !== "format") {
        return h(
          Box,
          { key: field.key, flexDirection: "column" },
          h(Text, { color: "cyan" }, `${marker} ${field.label}:`),
          h(TextInput, {
            key: `${field.key}-input`,
            defaultValue: values[field.key],
            placeholder: field.placeholder,
            onSubmit: (nextValue) => {
              const normalized = String(nextValue || "").trim();
              setValues((current) => ({
                ...current,
                [field.key]: field.key === "format" ? normalized.toLowerCase() : normalized
              }));
              setEditingKey("");
              setStatusColor("gray");
              setStatus(`Updated ${field.label}.`);
            }
          })
        );
      }

      return h(
        Box,
        { key: field.key },
        h(Text, { color: isSelected ? "cyan" : "white" }, `${marker} ${field.label}: `),
        field.key === "outputDirectory" && !values.outputDirectory
          ? h(Text, { color: "gray" }, `(${getDefaultOutputDirectory()})`)
          : field.key === "issueKey" && !values.issueKey
            ? h(Text, { color: "gray" }, "(required)")
            : h(Text, { color: isSelected ? "cyan" : "white" }, String(values[field.key] || ""))
      );
    }),
    h(Text, { color: statusColor }, status),
    confirmCreateDir
      ? h(Text, { color: "gray" }, "Press Y to create directory, N to go back, or Enter to confirm create.")
      : h(Text, { color: "gray" }, "Press Esc to cancel.")
  );
}

function ExportFlow({ exportValues, executor, onDone, onCancel }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState("Preparing export");
  const [detail, setDetail] = useState("Validating configuration and input...");
  const [warnings, setWarnings] = useState([]);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [state, setState] = useState("running");

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const report = await executor(
          (nextPhase, nextDetail) => {
            if (!active) {
              return;
            }
            if (nextPhase) {
              setPhase(String(nextPhase));
            }
            if (nextDetail) {
              setDetail(String(nextDetail));
            }
          },
          (warning) => {
            if (!active) {
              return;
            }
            setWarnings((current) => {
              const next = current.concat(String(warning));
              return next.slice(-3);
            });
          }
        );

        if (!active) {
          return;
        }
        setResult(report);
        setState("success");
        setTimeout(() => {
          if (!active) {
            return;
          }
          onDone({ status: "success", preserveTui: true, report });
          exit();
        }, 1200);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage(error && error.message ? error.message : String(error));
        setState("failed");
        setTimeout(() => {
          if (!active) {
            return;
          }
          onDone({ status: "failed", preserveTui: true });
          exit();
        }, 1500);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [executor, exit, onDone]);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      onCancel({ status: "cancelled", preserveTui: true });
      exit();
    }
  });

  if (state === "running") {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Text, { color: "cyan", bold: true }, "jira-ticket-tools export"),
      h(Text, {}, `Issue: ${exportValues.issueKey}`),
      h(Text, {}, `Format: ${exportValues.format}`),
      h(Spinner, { label: phase }),
      detail ? h(Text, { color: "gray" }, detail) : null,
      warnings.length > 0 ? h(Text, { color: "yellow" }, `Warnings: ${warnings.length}`) : null
    );
  }

  if (state === "failed") {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Text, { color: "cyan", bold: true }, "jira-ticket-tools export"),
      h(Text, { color: "red" }, `❌ Export failed: ${errorMessage}`)
    );
  }

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { color: "cyan", bold: true }, "jira-ticket-tools export"),
    h(Text, { color: "green" }, `✅ Exported ${result.issueKey} (${result.format})`),
    h(Text, {}, `Output: ${result.outputPath}`),
    result.format === "md" && result.downloadedAny ? h(Text, {}, `Assets: ${result.assetsDir}`) : null,
    result.format === "md" ? h(Text, { color: result.warningCount > 0 ? "yellow" : "green" }, `Warnings: ${result.warningCount}`) : null
  );
}

function DoctorSummary({ report, onDone }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalWidth = stdout && stdout.columns ? stdout.columns : 80;
  const terminalHeight = stdout && stdout.rows ? stdout.rows : 24;

  const categorizeDoctorCheck = (message) => {
    if (message.startsWith("Dependency found") || message.startsWith("Missing dependency")) {
      return "Dependencies";
    }
    if (
      message.startsWith("Runtime precedence")
      || message.startsWith("Global config")
      || message.startsWith("Local .env")
      || message.startsWith("Loaded .env")
      || message.startsWith("No .env")
      || message.startsWith("Runtime value set")
      || message.startsWith("Environment variable")
    ) {
      return "Environment";
    }
    return "Integration Files";
  };

  const sectionOrder = ["Dependencies", "Environment", "Integration Files"];
  const sections = sectionOrder
    .map((name) => {
      const items = (report.checks || []).filter((item) => categorizeDoctorCheck(item.message) === name);
      const counts = items.reduce(
        (acc, item) => {
          if (item.status === "ok") {
            acc.ok += 1;
          } else if (item.status === "warn") {
            acc.warn += 1;
          } else {
            acc.fail += 1;
          }
          return acc;
        },
        { ok: 0, warn: 0, fail: 0 }
      );
      return { name, items, counts };
    })
    .filter((section) => section.items.length > 0);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expanded, setExpanded] = useState(
    Object.fromEntries(sections.map((section) => [section.name, false]))
  );

  const truncateLine = (text) => {
    const width = Math.max(20, Number(terminalWidth) || 80);
    if (!text || text.length <= width - 1) {
      return text;
    }
    return `${text.slice(0, width - 2)}…`;
  };

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      onDone({ preserveTui: true });
      exit();
      return;
    }

    if (sections.length === 0) {
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((current) => (current - 1 + sections.length) % sections.length);
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((current) => (current + 1) % sections.length);
      return;
    }

    const number = Number(input);
    if (!Number.isNaN(number) && number >= 1 && number <= sections.length) {
      const section = sections[number - 1];
      setSelectedIndex(number - 1);
      setExpanded((current) => ({
        ...current,
        [section.name]: !current[section.name]
      }));
      return;
    }

    if (key.return || input === " ") {
      const section = sections[selectedIndex];
      if (!section) {
        return;
      }
      setExpanded((current) => ({
        ...current,
        [section.name]: !current[section.name]
      }));
    }
  });

  const rows = [
    { type: "text", text: "jira-ticket-tools doctor", color: "cyan", bold: true },
    { type: "text", text: "Use Up/Down to select, Enter/Space to expand, Esc to exit.", color: "gray" },
    { type: "blank" }
  ];

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const isSelected = selectedIndex === index;
    const isExpanded = Boolean(expanded[section.name]);
    const chevron = isExpanded ? "▾" : "▸";
    const selectMark = isSelected ? "❯" : " ";
    rows.push({
      type: "header",
      prefix: `${selectMark} ${index + 1}. ${chevron} ${section.name} `,
      prefixColor: isSelected ? "cyan" : "white",
      ok: section.counts.ok,
      warn: section.counts.warn,
      fail: section.counts.fail
    });

    if (isExpanded) {
      for (const item of section.items) {
        const icon = item.status === "ok" ? "✅" : item.status === "warn" ? "⚠️" : "❌";
        const color = item.status === "ok" ? "green" : item.status === "warn" ? "yellow" : "red";
        rows.push({ type: "text", text: `  ${icon} ${item.message}`, color });
      }
    }

    rows.push({ type: "blank" });
  }

  rows.push({
    type: "text",
    text: `Summary: ${report.okCount} ok, ${report.warnCount} warnings, ${report.failCount} failures`,
    color: report.failCount > 0 ? "red" : "green"
  });
  rows.push({ type: "blank" });

  const maxLines = Math.max(8, (Number(terminalHeight) || 24) - 1);
  let displayRows = rows;
  if (rows.length > maxLines) {
    displayRows = rows.slice(0, maxLines - 1);
    displayRows.push({
      type: "text",
      text: `… ${rows.length - maxLines + 1} more lines hidden. Collapse sections or resize terminal.`,
      color: "yellow"
    });
  }

  return h(
    Box,
    { flexDirection: "column" },
    ...displayRows.map((row, index) => {
      if (row.type === "blank") {
        return h(Text, { key: `doctor-line-${index}` }, " ");
      }

      if (row.type === "header") {
        return h(
          Box,
          { key: `doctor-line-${index}` },
          h(Text, { color: row.prefixColor, bold: true }, truncateLine(row.prefix)),
          h(Text, { color: "gray" }, "["),
          h(Text, { color: "green" }, String(row.ok)),
          h(Text, { color: "gray" }, "|"),
          h(Text, { color: "yellow" }, String(row.warn)),
          h(Text, { color: "gray" }, "|"),
          h(Text, { color: "red" }, String(row.fail)),
          h(Text, { color: "gray" }, "]")
        );
      }

      return h(Text, {
        key: `doctor-line-${index}`,
        color: row.color,
        bold: Boolean(row.bold)
      }, truncateLine(row.text));
    })
  );
}

export async function runSetupTui(initialValues = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve(value || { status: "cancelled" });
    };

    app = render(
      h(SetupWizard, {
        initialValues,
        onDone: (values) => {
          finish(values);
        },
        onCancel: () => {
          finish({ status: "cancelled" });
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ status: "cancelled" });
      }
    }).catch(reject);
  });
}

export async function runSetupSummaryTui({ configPath, integrationReport, skippedIntegration }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve();
    };

    app = render(
      h(SetupSummary, {
        configPath,
        integrationReport,
        skippedIntegration,
        onDone: (value) => {
          finish(value);
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ preserveTui: true });
      }
    }).catch(reject);
  });
}

export async function runIntegrateSummaryTui({ integrationReport }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve();
    };

    app = render(
      h(IntegrateSummary, {
        integrationReport,
        onDone: (value) => {
          finish(value);
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ preserveTui: true });
      }
    }).catch(reject);
  });
}

export async function runDoctorSummaryTui({ report }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve();
    };

    app = render(
      h(DoctorSummary, {
        report,
        onDone: (value) => {
          finish(value);
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ preserveTui: true });
      }
    }).catch(reject);
  });
}

export async function runUninstallSummaryTui({ uninstallReport }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve();
    };

    app = render(
      h(UninstallSummary, {
        uninstallReport,
        onDone: (value) => {
          finish(value);
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ preserveTui: true });
      }
    }).catch(reject);
  });
}

export async function runConfigEditorTui({ configValues }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve(value || { status: "cancelled" });
    };

    app = render(
      h(ConfigEditor, {
        initialValues: configValues,
        onDone: (value) => {
          finish(value);
        },
        onCancel: (value) => {
          finish(value || { status: "cancelled" });
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ status: "cancelled" });
      }
    }).catch(reject);
  });
}

export async function runExportInputTui({ initialValues }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve(value || { status: "cancelled" });
    };

    app = render(
      h(ExportInputForm, {
        initialValues: initialValues || {},
        onDone: (value) => {
          finish(value);
        },
        onCancel: (value) => {
          finish(value || { status: "cancelled" });
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ status: "cancelled" });
      }
    }).catch(reject);
  });
}

export async function runExportFlowTui({ exportValues, executor }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let app;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (app && (!value || !value.preserveTui)) {
        app.clear();
      }
      resolve(value || { status: "cancelled" });
    };

    app = render(
      h(ExportFlow, {
        exportValues,
        executor,
        onDone: (value) => {
          finish(value);
        },
        onCancel: (value) => {
          finish(value || { status: "cancelled" });
        }
      }),
      { exitOnCtrlC: false }
    );

    app.waitUntilExit().then(() => {
      if (!settled) {
        finish({ status: "cancelled" });
      }
    }).catch(reject);
  });
}
