export class SatelliteGroupSelector {
  constructor({ groups, selectedGroups, groupColors, onChange }) {
    this.groups = groups;
    this.selectedGroups = new Set(selectedGroups);
    this.groupColors = groupColors;
    this.onChange = onChange;
    this.element = this.createElement();
    this.statusElement = this.element.querySelector("[data-status]");

    document.body.appendChild(this.element);
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

    panel.appendChild(list);
    panel.appendChild(status);

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
}
