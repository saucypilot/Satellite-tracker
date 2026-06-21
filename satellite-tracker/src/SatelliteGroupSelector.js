export class SatelliteGroupSelector {
  constructor({
    groups,
    selectedGroups,
    groupColors,
    onChange,
    onResetView,
    onPredictPass,
    onUseCurrentLocation,
  }) {
    this.groups = groups;
    this.selectedGroups = new Set(selectedGroups);
    this.groupColors = groupColors;
    this.onChange = onChange;
    this.onResetView = onResetView;
    this.onPredictPass = onPredictPass;
    this.onUseCurrentLocation = onUseCurrentLocation;
    this.groupLabels = new Map(groups.map((group) => [group.id, group.label]));
    this.element = this.createElement();
    this.statusElement = this.element.querySelector("[data-status]");
    this.selectedElement = this.element.querySelector("[data-selected]");
    this.stationNameInput = this.element.querySelector("[data-station-name]");
    this.stationLatInput = this.element.querySelector("[data-station-lat]");
    this.stationLonInput = this.element.querySelector("[data-station-lon]");
    this.passResultElement = this.element.querySelector("[data-pass-result]");
    this.hoverElement = this.createHoverElement();
    this.openButton = this.createOpenButton();

    document.body.appendChild(this.element);
    document.body.appendChild(this.hoverElement);
  }

  createElement() {
    const panel = document.createElement("aside");
    panel.className = "satellite-panel";

    const header = document.createElement("div");
    header.className = "satellite-panel-header";

    const title = document.createElement("h1");
    title.textContent = "Satellite Groups";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "satellite-panel-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.setOpen(false));
    header.append(title, closeButton);
    panel.appendChild(header);

    const list = document.createElement("div");
    list.className = "satellite-group-list";

    for (const group of this.groups) {
      list.appendChild(this.createGroupOption(group));
    }

    const status = document.createElement("div");
    status.className = "satellite-status";
    status.dataset.status = "";
    status.textContent = "Loading...";

    const controls = document.createElement("div");
    controls.className = "satellite-panel-controls";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "satellite-panel-button";
    resetButton.textContent = "Reset view";
    resetButton.addEventListener("click", () => this.onResetView?.());
    controls.appendChild(resetButton);

    const selected = document.createElement("div");
    selected.className = "selected-satellite";
    selected.dataset.selected = "";
    selected.textContent = "No satellite selected";

    panel.appendChild(list);
    panel.appendChild(status);
    panel.appendChild(controls);
    panel.appendChild(this.createGroundStationControls());
    panel.appendChild(selected);

    return panel;
  }

  createGroundStationControls() {
    const container = document.createElement("section");
    const title = document.createElement("h2");
    const fields = document.createElement("div");
    const actions = document.createElement("div");
    const nameInput = this.createStationInput(
      "Station name",
      "station-name",
      "Fort Worth"
    );
    const latInput = this.createStationInput("Latitude", "station-lat", "32.7555");
    const lonInput = this.createStationInput(
      "Longitude",
      "station-lon",
      "-97.3308"
    );
    const useCurrentButton = document.createElement("button");
    const predictButton = document.createElement("button");
    const result = document.createElement("div");

    container.className = "ground-station-panel";
    title.textContent = "Ground Station Pass";
    fields.className = "ground-station-fields";
    actions.className = "ground-station-actions";
    useCurrentButton.type = "button";
    useCurrentButton.className = "satellite-panel-button";
    useCurrentButton.textContent = "Use my location";
    useCurrentButton.addEventListener("click", () => this.onUseCurrentLocation?.());
    predictButton.type = "button";
    predictButton.className = "satellite-panel-button";
    predictButton.textContent = "Predict next pass";
    predictButton.addEventListener("click", () => this.handlePredictPass());
    result.className = "pass-result";
    result.dataset.passResult = "";
    result.textContent = "Select a satellite, set a station, then predict a pass.";

    fields.append(nameInput, latInput, lonInput);
    actions.append(useCurrentButton, predictButton);
    container.append(title, fields, actions, result);
    return container;
  }

  createStationInput(label, field, value) {
    const wrapper = document.createElement("label");
    const labelText = document.createElement("span");
    const input = document.createElement("input");

    wrapper.className = "ground-station-field";
    labelText.textContent = label;
    input.dataset[this.dataKeyToProperty(field)] = "";
    input.value = value;
    input.type = field === "station-name" ? "text" : "number";

    if (input.type === "number") {
      input.step = "0.0001";
    }

    wrapper.append(labelText, input);
    return wrapper;
  }

  dataKeyToProperty(key) {
    return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  createOpenButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "satellite-panel-open";
    button.textContent = "Show satellite panel";
    button.hidden = true;
    button.addEventListener("click", () => this.setOpen(true));
    document.body.appendChild(button);
    return button;
  }

  setOpen(isOpen) {
    this.element.hidden = !isOpen;
    this.openButton.hidden = isOpen;

    if (!isOpen) {
      this.hideSatelliteHover();
    }
  }

  createGroupOption(group) {
    const label = document.createElement("label");
    label.className = "satellite-group-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = group.id;
    checkbox.checked = this.selectedGroups.has(group.id);
    checkbox.addEventListener("change", () => this.handleChange(checkbox));

    const swatch = document.createElement("span");
    swatch.className = "satellite-group-swatch";
    swatch.style.backgroundColor = this.groupColors[group.id] ?? "#ffffff";

    const text = document.createElement("span");
    text.textContent = group.label;

    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(text);

    return label;
  }

  handleChange(checkbox) {
    if (checkbox.checked) {
      this.selectedGroups.add(checkbox.value);
    } else {
      this.selectedGroups.delete(checkbox.value);
    }

    this.onChange([...this.selectedGroups]);
  }

  setLoading(isLoading) {
    this.element.classList.toggle("is-loading", isLoading);

    for (const input of this.element.querySelectorAll("input")) {
      input.disabled = isLoading;
    }
  }

  setStatus(text) {
    this.statusElement.textContent = text;
  }

  setSelectedSatellite(sat) {
    if (!sat) {
      this.selectedElement.textContent = "No satellite selected";
      return;
    }

    const groupLabel = this.groupLabels.get(sat.group) ?? sat.group;
    this.selectedElement.replaceChildren(
      this.createDetailRow("Name", sat.name),
      this.createDetailRow("Group", groupLabel),
      this.createDetailRow("NORAD ID", sat.catalogId ?? "Unknown"),
      this.createDetailRow(
        "Inclination",
        this.formatDegrees(sat.inclinationDegrees)
      ),
      this.createDetailRow(
        "Period",
        this.formatMinutes(sat.orbitalPeriodMinutes)
      ),
      this.createDetailRow("Eccentricity", this.formatNumber(sat.eccentricity)),
      this.createDetailRow("Latitude", this.formatDegrees(sat.latitude)),
      this.createDetailRow("Longitude", this.formatDegrees(sat.longitude)),
      this.createDetailRow("Altitude", this.formatKilometers(sat.altitudeKm)),
      this.createN2yoWidget(sat)
    );
  }

  setGroundStation({ lat, lon, name = "Current location" }) {
    if (this.stationNameInput) this.stationNameInput.value = name;
    if (this.stationLatInput) this.stationLatInput.value = lat.toFixed(4);
    if (this.stationLonInput) this.stationLonInput.value = lon.toFixed(4);
  }

  async handlePredictPass() {
    const groundStation = this.getGroundStation();

    if (!groundStation) {
      this.passResultElement.textContent = "Enter a valid latitude and longitude.";
      return;
    }

    this.passResultElement.textContent = "Calculating next pass...";

    try {
      const pass = await this.onPredictPass?.(groundStation);
      this.setPassPrediction(pass, groundStation);
    } catch (error) {
      this.passResultElement.textContent = error.message;
    }
  }

  getGroundStation() {
    const lat = Number(this.stationLatInput.value);
    const lon = Number(this.stationLonInput.value);
    const name = this.stationNameInput.value.trim() || "Ground station";

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return null;
    }

    return { name, lat, lon, heightKm: 0 };
  }

  setPassPrediction(pass, groundStation) {
    if (!pass) {
      this.passResultElement.textContent =
        "No visible pass found in the next 24 hours.";
      return;
    }

    const canvas = document.createElement("canvas");

    canvas.width = 320;
    canvas.height = 320;
    this.passResultElement.replaceChildren(
      this.createPassTitle(pass, groundStation),
      this.createDetailRow("AOS", this.formatUtcTime(pass.aos)),
      this.createDetailRow(
        "Maximum elevation",
        this.formatDegrees(pass.maxElevationDegrees)
      ),
      this.createDetailRow("Max elevation time", this.formatUtcTime(pass.maxElevationAt)),
      this.createDetailRow("LOS", this.formatUtcTime(pass.los)),
      this.createDetailRow("Duration", this.formatDuration(pass.durationSeconds)),
      this.createDetailRow("Visibility", pass.visibility),
      canvas
    );
    this.drawPolarSkyPlot(canvas, pass.samples);
  }

  createPassTitle(pass, groundStation) {
    const title = document.createElement("div");

    title.className = "pass-result-title";
    title.textContent = `${pass.satelliteName} pass over ${groundStation.name}`;
    return title;
  }

  drawPolarSkyPlot(canvas, samples) {
    const context = canvas.getContext("2d");
    const center = canvas.width / 2;
    const radius = canvas.width * 0.39;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(5, 7, 11, 0.96)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(255, 255, 255, 0.25)";
    context.lineWidth = 1;

    for (const ring of [1, 2 / 3, 1 / 3]) {
      context.beginPath();
      context.arc(center, center, radius * ring, 0, Math.PI * 2);
      context.stroke();
    }

    context.fillStyle = "#a9b6c8";
    context.font = "700 12px sans-serif";
    context.textAlign = "center";
    context.fillText("N", center, center - radius - 10);
    context.fillText("S", center, center + radius + 18);
    context.fillText("E", center + radius + 14, center + 4);
    context.fillText("W", center - radius - 14, center + 4);
    context.strokeStyle = "#66ccff";
    context.lineWidth = 3;
    context.beginPath();

    for (const [index, sample] of samples.entries()) {
      const point = this.getPolarPlotPoint(sample, center, radius);

      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }

    context.stroke();
    this.drawPassEndpoint(context, samples[0], center, radius, "#2eff8f");
    this.drawPassEndpoint(
      context,
      samples[samples.length - 1],
      center,
      radius,
      "#ff4f4f"
    );
  }

  drawPassEndpoint(context, sample, center, radius, color) {
    const point = this.getPolarPlotPoint(sample, center, radius);

    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
  }

  getPolarPlotPoint(sample, center, radius) {
    const azimuth = (sample.azimuthDegrees * Math.PI) / 180;
    const plotRadius =
      ((90 - Math.max(0, sample.elevationDegrees)) / 90) * radius;

    return {
      x: center + plotRadius * Math.sin(azimuth),
      y: center - plotRadius * Math.cos(azimuth),
    };
  }

  formatUtcTime(date) {
    return date.toISOString().slice(11, 19) + " UTC";
  }

  formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  showSatelliteHover(sat, x, y) {
    this.hoverElement.textContent = sat.name;
    this.hoverElement.style.left = `${x + 14}px`;
    this.hoverElement.style.top = `${y + 14}px`;
    this.hoverElement.hidden = false;
  }

  hideSatelliteHover() {
    this.hoverElement.hidden = true;
  }

  createHoverElement() {
    const hover = document.createElement("div");

    hover.className = "satellite-hover-tooltip";
    hover.hidden = true;
    return hover;
  }

  createDetailRow(label, value) {
    const row = document.createElement("div");
    const labelElement = document.createElement("span");
    const valueElement = document.createElement("strong");

    row.className = "selected-satellite-row";
    labelElement.textContent = label;
    valueElement.textContent = value;
    row.append(labelElement, valueElement);
    return row;
  }

  createN2yoWidget(sat) {
    const container = document.createElement("div");
    const title = document.createElement("div");
    const note = document.createElement("div");
    const iframe = document.createElement("iframe");
    const links = document.createElement("div");
    const noradId = this.getSafeNoradId(sat.catalogId);

    container.className = "n2yo-widget";
    title.className = "n2yo-widget-title";
    title.textContent = "N2YO tracker";
    note.className = "n2yo-widget-note";
    note.textContent =
      "The embedded N2YO widget is mostly the live map. Use these links for the useful detail pages.";
    links.className = "n2yo-widget-links";

    if (!noradId) {
      container.textContent = "N2YO tracker unavailable: missing NORAD ID.";
      return container;
    }

    iframe.title = `N2YO tracker for ${sat.name}`;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.sandbox = "allow-scripts allow-same-origin allow-popups";
    iframe.allow = "geolocation";
    iframe.srcdoc = this.createN2yoWidgetDocument(noradId);

    links.append(
      this.createN2yoLink(`https://www.n2yo.com/?s=${noradId}`, "Live tracking"),
      this.createN2yoLink(
        `https://www.n2yo.com/satellite/?s=${noradId}`,
        "Satellite details"
      ),
      this.createN2yoLink(
        `https://www.n2yo.com/passes/?s=${noradId}`,
        "10-day predictions"
      )
    );
    container.append(title, note, links, iframe);
    return container;
  }

  createN2yoLink(href, text) {
    const link = document.createElement("a");

    link.className = "n2yo-widget-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    return link;
  }

  createN2yoWidgetDocument(noradId) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html,
      body {
        margin: 0;
        min-height: 100%;
        overflow: auto;
        background: #05070b;
      }

      body > div,
      body > table {
        max-width: 100%;
      }
    </style>
  </head>
  <body>
    <script>
      var norad_n2yo = '${noradId}';
      var size_n2yo = 'medium';
      var allpasses_n2yo = '1';
      var map_n2yo = '4';
    </script>
    <script src="https://www.n2yo.com/js/widget-tracker.js"></script>
  </body>
</html>`;
  }

  getSafeNoradId(catalogId) {
    const noradId = String(catalogId ?? "").trim();

    return /^\d+$/.test(noradId) ? noradId : null;
  }

  formatDegrees(value) {
    if (!Number.isFinite(value)) return "Unknown";

    return `${value.toFixed(2)}°`;
  }

  formatMinutes(value) {
    if (!Number.isFinite(value)) return "Unknown";

    return `${value.toFixed(1)} min`;
  }

  formatKilometers(value) {
    if (!Number.isFinite(value)) return "Unknown";

    return `${value.toFixed(1)} km`;
  }

  formatNumber(value) {
    if (!Number.isFinite(value)) return "Unknown";

    return value.toFixed(5);
  }
}
