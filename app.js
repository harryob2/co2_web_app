const connectButton = document.getElementById("connectButton");
const disconnectButton = document.getElementById("disconnectButton");
const readButton = document.getElementById("readButton");
const clearButton = document.getElementById("clearButton");
const statusEl = document.getElementById("status");
const filePathInput = document.getElementById("filePath");
const baudRateInput = document.getElementById("baudRate");
const fileInput = document.getElementById("fileInput");
const pointCountEl = document.getElementById("pointCount");
const chartCanvas = document.getElementById("co2Chart");

// Time controls
const startDateInput = document.getElementById("startDate");
const startTimeInput = document.getElementById("startTime");
const endDateInput = document.getElementById("endDate");
const endTimeInput = document.getElementById("endTime");
const applyRangeButton = document.getElementById("applyRange");
const resetZoomButton = document.getElementById("resetZoom");
const dataRangeInfo = document.getElementById("dataRangeInfo");
const presetButtons = document.querySelectorAll(".preset-btn");
const prevDayButton = document.getElementById("prevDay");
const nextDayButton = document.getElementById("nextDay");

let port = null;
let reader = null;
let writer = null;
let chart = null;

// Store full dataset for filtering
let fullDataset = [];
let minDate = null;
let maxDate = null;

// Current view window for 24h navigation
let currentWindowStart = null;
let currentWindowEnd = null;

const COMMAND_TIMEOUT_MS = 15000;
const IDLE_TIMEOUT_MS = 1000;

// Flipper Zero USB identifiers (STMicroelectronics CDC)
const FLIPPER_USB_FILTERS = [
  { usbVendorId: 0x0483, usbProductId: 0x5740 },
];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.borderColor = isError ? "#ff928b" : "var(--flipper-border)";
}

function toggleConnectedUI(isConnected) {
  connectButton.disabled = isConnected;
  disconnectButton.disabled = !isConnected;
  readButton.disabled = !isConnected;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function supportsWebSerial() {
  return "serial" in navigator;
}

async function connectSerial() {
  if (!supportsWebSerial()) {
    setStatus("Web Serial not supported. Use Upload CSV.", true);
    return;
  }

  try {
    setStatus("Select Flipper Zero from the list...");
    // Filter to only show Flipper Zero USB devices (hides Bluetooth)
    port = await navigator.serial.requestPort({ filters: FLIPPER_USB_FILTERS });
    const baudRate = Number(baudRateInput.value) || 230400;
    await port.open({ baudRate });

    const textEncoder = new TextEncoderStream();
    const textDecoder = new TextDecoderStream();

    textEncoder.readable.pipeTo(port.writable);
    port.readable.pipeTo(textDecoder.writable);

    writer = textEncoder.writable.getWriter();
    reader = textDecoder.readable.getReader();

    setStatus("Initializing CLI...");
    await writer.write("\r\n");
    await sleep(300);
    try {
      await Promise.race([
        reader.read(),
        new Promise((_, r) => setTimeout(() => r(new Error("init_timeout")), 1000)),
      ]);
    } catch {
      // Ignore timeout - just clearing buffer
    }

    toggleConnectedUI(true);
    setStatus("Connected. Reading CSV...");
    
    // Auto-read CSV immediately after connection
    await readCsvFromFlipper();
  } catch (error) {
    setStatus(`Connection failed: ${error.message}`, true);
    await disconnectSerial();
  }
}

async function disconnectSerial() {
  try {
    if (reader) {
      await reader.cancel();
      reader.releaseLock();
      reader = null;
    }
    if (writer) {
      writer.releaseLock();
      writer = null;
    }
    if (port) {
      await port.close();
      port = null;
    }
  } catch (error) {
    setStatus(`Disconnect warning: ${error.message}`, true);
  } finally {
    toggleConnectedUI(false);
  }
}

async function readCsvFromFlipper() {
  if (!writer || !reader) {
    setStatus("Not connected. Click Connect Flipper.", true);
    return;
  }

  const filePath = filePathInput.value.trim();
  if (!filePath) {
    setStatus("CSV path is empty.", true);
    return;
  }

  try {
    const dirPath = filePath.split("/").slice(0, -1).join("/") || "/";
    const fileName = filePath.split("/").pop();

    setStatus(`Checking ${dirPath}...`);
    const listResponse = await runCommand(`storage list ${dirPath}`);
    if (!listResponse.toLowerCase().includes(fileName.toLowerCase())) {
      setStatus(`File not found: ${fileName}`, true);
      return;
    }

    setStatus(`Reading ${filePath}...`);
    const response = await runCommand(`storage read ${filePath}`);
    if (!response.trim()) {
      setStatus("No data received. Check CLI access.", true);
      return;
    }
    if (response.toLowerCase().includes("error")) {
      setStatus("CLI reported an error while reading.", true);
      return;
    }
    const csvText = normalizeCsvResponse(response);
    renderCsv(csvText);
    setStatus("CSV loaded.");
  } catch (error) {
    setStatus(`Read failed: ${error.message}`, true);
  }
}

async function runCommand(command) {
  console.log("Sending command:", command);
  await writer.write(`${command}\r\n`);
  const response = await readUntilIdle();
  console.log("Response length:", response.length, "chars");
  console.log("Response preview:", response.substring(0, 500));
  return response;
}

function normalizeCsvResponse(response) {
  const lines = response
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const startIndex = lines.findIndex((line) =>
    line.toLowerCase().startsWith("timestamp")
  );

  if (startIndex === -1) {
    return lines.join("\n");
  }

  return lines.slice(startIndex).join("\n");
}

async function readUntilIdle() {
  let buffer = "";
  const startTime = Date.now();

  while (Date.now() - startTime < COMMAND_TIMEOUT_MS) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("chunk_timeout")), IDLE_TIMEOUT_MS);
      });

      const { value, done } = await Promise.race([
        reader.read(),
        timeoutPromise,
      ]);

      if (done) {
        break;
      }
      if (value) {
        buffer += value;
        if (buffer.includes(">:") || buffer.includes("Flipper")) {
          await sleep(100);
          try {
            const extra = await Promise.race([
              reader.read(),
              new Promise((_, r) => setTimeout(() => r(new Error("done")), 200)),
            ]);
            if (extra.value) buffer += extra.value;
          } catch {
            // ignore timeout
          }
        }
      }
    } catch (err) {
      if (err.message === "chunk_timeout" && buffer.length > 0) {
        break;
      }
      if (Date.now() - startTime >= COMMAND_TIMEOUT_MS) {
        break;
      }
    }
  }

  return buffer;
}

function parseTimestamp(timestamp) {
  // Try various timestamp formats
  // Format: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" or just epoch
  if (!timestamp) return null;
  
  // If it's a number, treat as epoch
  if (!isNaN(timestamp)) {
    const num = Number(timestamp);
    // If it looks like milliseconds (> year 2001 in seconds)
    return num > 1000000000000 ? new Date(num) : new Date(num * 1000);
  }
  
  // Try parsing as ISO or common formats
  const date = new Date(timestamp);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try "DD/MM/YYYY HH:MM:SS" format
  const parts = timestamp.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):?(\d+)?/);
  if (parts) {
    return new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5], parts[6] || 0);
  }
  
  return null;
}

function parseCsv(csvText) {
  const rows = csvText
    .trim()
    .split(/\r?\n/)
    .map((row) => row.split(","))
    .filter((row) => row.length >= 2);

  const [header, ...dataRows] = rows;
  const hasHeader =
    header &&
    header[0].toLowerCase().includes("timestamp") &&
    header[1].toLowerCase().includes("co2");

  const rowsToParse = hasHeader ? dataRows : rows;

  return rowsToParse
    .map((row) => {
      const timestamp = row[0].trim();
      const date = parseTimestamp(timestamp);
      return {
        timestamp,
        date,
        value: Number(row[1]),
      };
    })
    .filter((row) => row.timestamp && Number.isFinite(row.value))
    // Remove calibration readings (sensor outputs exactly 500 during calibration)
    .filter((row) => row.value !== 500);
}

function updateDateBounds() {
  if (fullDataset.length === 0) {
    minDate = null;
    maxDate = null;
    dataRangeInfo.textContent = "Load data to see available range";
    return;
  }

  // Find min and max dates from data
  const dates = fullDataset.filter(d => d.date).map(d => d.date);
  if (dates.length === 0) {
    dataRangeInfo.textContent = "No valid timestamps in data";
    return;
  }

  minDate = new Date(Math.min(...dates));
  maxDate = new Date(Math.max(...dates));

  // Update date inputs with min/max attributes
  const minDateStr = minDate.toISOString().split('T')[0];
  const maxDateStr = maxDate.toISOString().split('T')[0];
  
  startDateInput.min = minDateStr;
  startDateInput.max = maxDateStr;
  endDateInput.min = minDateStr;
  endDateInput.max = maxDateStr;

  // Set default values to full range
  startDateInput.value = minDateStr;
  endDateInput.value = maxDateStr;

  // Format for display
  const formatDate = (d) => d.toLocaleString();
  dataRangeInfo.textContent = `Data range: ${formatDate(minDate)} → ${formatDate(maxDate)}`;
}

function filterDataByRange(startDateTime, endDateTime) {
  if (!startDateTime || !endDateTime) {
    return fullDataset;
  }

  return fullDataset.filter(row => {
    if (!row.date) return false;
    return row.date >= startDateTime && row.date <= endDateTime;
  });
}

function getDateTimeFromInputs() {
  const startDate = startDateInput.value;
  const startTime = startTimeInput.value || "00:00";
  const endDate = endDateInput.value;
  const endTime = endTimeInput.value || "23:59";

  if (!startDate || !endDate) {
    return { start: null, end: null };
  }

  return {
    start: new Date(`${startDate}T${startTime}`),
    end: new Date(`${endDate}T${endTime}`)
  };
}

function applyPreset(range) {
  if (!maxDate || fullDataset.length === 0) {
    setStatus("Load data first to use presets.", true);
    return;
  }

  // Calculate start time based on preset
  const end = new Date(maxDate);
  let start;

  switch (range) {
    case "1h":
      start = new Date(end.getTime() - 60 * 60 * 1000);
      break;
    case "6h":
      start = new Date(end.getTime() - 6 * 60 * 60 * 1000);
      break;
    case "12h":
      start = new Date(end.getTime() - 12 * 60 * 60 * 1000);
      break;
    case "24h":
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "3d":
      start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
      break;
    case "7d":
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "all":
    default:
      start = new Date(minDate);
      break;
  }

  // Clamp start to minDate
  if (start < minDate) {
    start = new Date(minDate);
  }

  // Update inputs
  startDateInput.value = start.toISOString().split('T')[0];
  startTimeInput.value = start.toTimeString().slice(0, 5);
  endDateInput.value = end.toISOString().split('T')[0];
  endTimeInput.value = end.toTimeString().slice(0, 5);

  // Update active button
  presetButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });

  // Render filtered data
  renderFilteredData(start, end);
}

function renderFilteredData(start, end) {
  const filtered = filterDataByRange(start, end);
  
  if (filtered.length === 0) {
    setStatus("No data in selected range.", true);
    return;
  }

  // Track current window for navigation
  currentWindowStart = start;
  currentWindowEnd = end;
  updateNavButtonStates();

  const labels = filtered.map((row) => row.date || row.timestamp);
  const values = filtered.map((row) => row.value);
  pointCountEl.textContent = `${filtered.length} readings`;

  updateChart(labels, values, filtered);
}

function updateNavButtonStates() {
  if (!minDate || !maxDate || !currentWindowStart || !currentWindowEnd) {
    prevDayButton.disabled = true;
    nextDayButton.disabled = true;
    return;
  }

  // Calculate window size (in ms)
  const windowSize = currentWindowEnd.getTime() - currentWindowStart.getTime();
  
  // Disable prev if we can't go further back
  const canGoPrev = currentWindowStart.getTime() > minDate.getTime();
  prevDayButton.disabled = !canGoPrev;
  
  // Disable next if we're at or past the end of data
  const canGoNext = currentWindowEnd.getTime() < maxDate.getTime();
  nextDayButton.disabled = !canGoNext;
}

function navigatePrevious() {
  if (!currentWindowStart || !currentWindowEnd) return;
  
  const windowSize = currentWindowEnd.getTime() - currentWindowStart.getTime();
  
  let newStart = new Date(currentWindowStart.getTime() - windowSize);
  let newEnd = new Date(currentWindowEnd.getTime() - windowSize);
  
  // Clamp to minDate
  if (newStart < minDate) {
    newStart = new Date(minDate);
    newEnd = new Date(minDate.getTime() + windowSize);
  }
  
  // Update inputs
  updateDateTimeInputs(newStart, newEnd);
  
  // Clear active preset (since we're navigating)
  presetButtons.forEach(btn => btn.classList.remove('active'));
  
  renderFilteredData(newStart, newEnd);
}

function navigateNext() {
  if (!currentWindowStart || !currentWindowEnd) return;
  
  const windowSize = currentWindowEnd.getTime() - currentWindowStart.getTime();
  
  let newStart = new Date(currentWindowStart.getTime() + windowSize);
  let newEnd = new Date(currentWindowEnd.getTime() + windowSize);
  
  // Clamp to maxDate
  if (newEnd > maxDate) {
    newEnd = new Date(maxDate);
    newStart = new Date(maxDate.getTime() - windowSize);
  }
  
  // Update inputs
  updateDateTimeInputs(newStart, newEnd);
  
  // Clear active preset (since we're navigating)
  presetButtons.forEach(btn => btn.classList.remove('active'));
  
  renderFilteredData(newStart, newEnd);
}

function updateDateTimeInputs(start, end) {
  startDateInput.value = start.toISOString().split('T')[0];
  startTimeInput.value = start.toTimeString().slice(0, 5);
  endDateInput.value = end.toISOString().split('T')[0];
  endTimeInput.value = end.toTimeString().slice(0, 5);
}

function updateChart(labels, values, filteredData) {
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    // Update segment styling with new data
    chart.data.datasets[0].segment = createSegmentStyle(filteredData);
    chart.resetZoom();
    chart.update();
  } else {
    createChart(labels, values, filteredData);
  }
}

// Create segment styling to hide lines when gap > 5 minutes (300 seconds)
function createSegmentStyle(filteredData) {
  const GAP_THRESHOLD_MS = 300 * 1000; // 5 minutes in milliseconds
  
  return {
    borderColor: (ctx) => {
      if (!filteredData || filteredData.length < 2) return undefined;
      
      const p0Index = ctx.p0DataIndex;
      const p1Index = ctx.p1DataIndex;
      
      if (p0Index >= filteredData.length || p1Index >= filteredData.length) {
        return undefined;
      }
      
      const p0Data = filteredData[p0Index];
      const p1Data = filteredData[p1Index];
      
      if (!p0Data?.date || !p1Data?.date) return undefined;
      
      const gap = p1Data.date.getTime() - p0Data.date.getTime();
      
      // If gap is more than 5 minutes, make line transparent
      if (gap > GAP_THRESHOLD_MS) {
        return 'transparent';
      }
      
      return undefined; // Use default color
    }
  };
}

function createChart(labels, values, filteredData) {
  if (chart) {
    chart.destroy();
  }

  const useDates = labels.length > 0 && labels[0] instanceof Date;

  chart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "CO2 ppm",
          data: values,
          borderColor: "#ff8200",
          backgroundColor: "rgba(255, 130, 0, 0.2)",
          borderWidth: 2,
          tension: 0.2,
          pointRadius: values.length > 500 ? 0 : 2,
          pointHoverRadius: 4,
          segment: createSegmentStyle(filteredData),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          labels: {
            color: "#000000",
            font: {
              family: "Courier New, Courier, monospace",
            },
          },
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true,
            },
            drag: {
              enabled: false,
            },
            mode: 'x',
            onZoomComplete: ({ chart }) => {
              // Clear active preset when manually zooming
              presetButtons.forEach(btn => btn.classList.remove('active'));
            },
          },
        },
        tooltip: {
          callbacks: {
            title: (context) => {
              const label = context[0].label;
              if (label instanceof Date) {
                return label.toLocaleString();
              }
              return label;
            },
          },
        },
      },
      scales: {
        x: {
          type: useDates ? 'time' : 'category',
          time: useDates ? {
            displayFormats: {
              hour: 'MMM d, HH:mm',
              day: 'MMM d',
              minute: 'HH:mm',
            },
          } : undefined,
          ticks: {
            maxTicksLimit: 8,
            maxRotation: 45,
          },
        },
        y: {
          title: {
            display: true,
            text: "ppm",
          },
          beginAtZero: false,
        },
      },
    },
  });
}

function renderCsv(csvText) {
  const parsed = parseCsv(csvText);
  if (!parsed.length) {
    setStatus("CSV parsed but no rows found.", true);
    return;
  }

  // Store full dataset
  fullDataset = parsed;
  updateDateBounds();

  // Default to showing the last 24 hours
  applyPreset('24h');
}

function clearChart() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
  fullDataset = [];
  minDate = null;
  maxDate = null;
  currentWindowStart = null;
  currentWindowEnd = null;
  pointCountEl.textContent = "No data loaded";
  dataRangeInfo.textContent = "Load data to see available range";
  startDateInput.value = "";
  endDateInput.value = "";
  prevDayButton.disabled = true;
  nextDayButton.disabled = true;
  setStatus("Chart cleared.");
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  const fileReader = new FileReader();
  fileReader.onload = () => {
    renderCsv(String(fileReader.result || ""));
    setStatus(`Loaded ${file.name} from file.`);
  };
  fileReader.onerror = () => {
    setStatus("Failed to read file.", true);
  };
  fileReader.readAsText(file);
  event.target.value = "";
}

function handleApplyRange() {
  const { start, end } = getDateTimeFromInputs();
  if (!start || !end) {
    setStatus("Please select both start and end dates.", true);
    return;
  }
  if (start > end) {
    setStatus("Start date must be before end date.", true);
    return;
  }
  
  // Clear active preset
  presetButtons.forEach(btn => btn.classList.remove('active'));
  
  renderFilteredData(start, end);
}

function handleResetZoom() {
  if (chart) {
    chart.resetZoom();
  }
}

// Event listeners
connectButton.addEventListener("click", connectSerial);
disconnectButton.addEventListener("click", disconnectSerial);
readButton.addEventListener("click", readCsvFromFlipper);
clearButton.addEventListener("click", clearChart);
fileInput.addEventListener("change", handleFileUpload);
applyRangeButton.addEventListener("click", handleApplyRange);
resetZoomButton.addEventListener("click", handleResetZoom);
prevDayButton.addEventListener("click", navigatePrevious);
nextDayButton.addEventListener("click", navigateNext);

// Preset button listeners
presetButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    applyPreset(btn.dataset.range);
  });
});

// Double-click to reset zoom
chartCanvas.addEventListener("dblclick", handleResetZoom);

if (!supportsWebSerial()) {
  setStatus("Web Serial not supported. Use Upload CSV.", true);
}
