# CO2 Logger Web App

Web app for reading the Flipper Zero CO2 logger CSV and plotting a single chart. Designed to work with the [CO2 Logger Flipper Zero app](https://github.com/harryob2/co2_logger). 

## Screenshots

### Main View
![Main View](screenshots/main-view.png)

### Chart View
![Chart View](screenshots/chart-view.png)

## What it does

- Connects to the Flipper Zero over USB serial using Web Serial API.
- Reads `/ext/apps_data/co2_logger/co2_log.csv` via the CLI.
- Parses the CSV and displays a line chart.
- Includes a manual CSV upload fallback.

## Browser support

Web Serial works in Chrome and Edge. Other browsers require the upload fallback.

## Usage

1. Open `index.html` in Chrome or Edge using a local HTTPS or localhost server.
2. Click **Connect Flipper**, select your device.
3. Click **Read CSV**.

## Notes

- The default baud rate is 230400. Update it if your firmware uses a different speed.
- If the CLI command differs on your firmware, update the command in `app.js`.
- For large CSV files, reads may take longer. The app waits for an idle gap in the serial stream.
- If Web Serial is unavailable, use **Upload CSV** and select the file directly from the SD card.

## Design references

The UI follows Flipper's design guide:
https://flipper.net/pages/downloads
