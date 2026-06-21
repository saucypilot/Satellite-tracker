export class SatelliteGroupSelector {
  constructor({ groups, selectedGroups, groupColors, onChange, onResetView }) {
    this.groups = groups;
    this.selectedGroups = new Set(selectedGroups);
    this.groupColors = groupColors;
    this.onChange = onChange;
    this.onResetView = onResetView;
    this.groupLabels = new Map(groups.map((group) => [group.id, group.label]));
    this.element = this.createElement();
    this.statusElement = this.element.querySelector("[data-status]");
    this.selectedElement = this.element.querySelector("[data-selected]");
    this.hoverElement = this.createHoverElement();

    document.body.appendChild(this.element);
    document.body.appendChild(this.hoverElement);
  }

  createElement() {
    const panel = document.createElement("aside");
    panel.className = "satellite-panel";

    const title = document.createElement("h1");
    title.textContent = "Satellite Groups";
    panel.appendChild(title);

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
    panel.appendChild(selected);

    return panel;
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
