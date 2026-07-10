const STORAGE_KEYS = {
  width: "satellitePanelWidth",
  opacity: "satellitePanelOpacity",
  density: "satellitePanelDensity",
};

const PANEL_WIDTH = { min: 280, max: 820, viewportPadding: 32 };

/** Owns panel appearance, persistence, and resize behavior. */
export class PanelPreferences {
  constructor({
    panel,
    timelinePanel,
    settingsElement,
    settingsButton,
    widthInput,
    opacityInput,
    densityInput,
  }) {
    Object.assign(this, {
      panel,
      timelinePanel,
      settingsElement,
      settingsButton,
      widthInput,
      opacityInput,
      densityInput,
    });
    this.restore();
    window.addEventListener("resize", () => this.applyStoredWidth());
  }

  toggleSettings(forceOpen = null) {
    const isOpen = forceOpen ?? this.settingsElement.hidden;

    this.settingsElement.hidden = !isOpen;
    this.settingsButton.classList.toggle("is-active", isOpen);
    this.settingsButton.setAttribute(
      "aria-label",
      isOpen ? "Close panel settings" : "Open panel settings"
    );
    this.settingsButton.setAttribute("aria-expanded", String(isOpen));
  }

  handleResizeStart(event, handle) {
    if (!this.canResize()) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = this.panel.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    this.panel.classList.add("is-resizing");

    const handleMove = (moveEvent) =>
      this.setWidth(startWidth + moveEvent.clientX - startX);
    const handleEnd = () => {
      this.panel.classList.remove("is-resizing");
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", handleEnd);
      handle.removeEventListener("pointercancel", handleEnd);
    };
    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", handleEnd);
    handle.addEventListener("pointercancel", handleEnd);
  }

  handleResizeKeydown(event) {
    if (!this.canResize()) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const { min, max } = this.getWidthLimits();
    const currentWidth = this.panel.getBoundingClientRect().width;
    const step = event.shiftKey ? 48 : 16;

    if (event.key === "ArrowLeft") this.setWidth(currentWidth - step);
    if (event.key === "ArrowRight") this.setWidth(currentWidth + step);
    if (event.key === "Home") this.setWidth(min);
    if (event.key === "End") this.setWidth(max);
  }

  setWidth(width, { persist = true } = {}) {
    const { min, max } = this.getWidthLimits();
    const nextWidth = Math.round(Math.min(max, Math.max(min, width)));

    this.panel.style.setProperty("--satellite-panel-width", `${nextWidth}px`);
    this.widthInput.min = String(min);
    this.widthInput.max = String(max);
    this.widthInput.value = String(nextWidth);
    if (persist) localStorage.setItem(STORAGE_KEYS.width, String(nextWidth));
  }

  setOpacity(opacity, { persist = true } = {}) {
    const nextOpacity = Math.min(1, Math.max(0.2, opacity));

    this.panel.style.setProperty("--satellite-panel-opacity", String(nextOpacity));
    this.timelinePanel.style.setProperty("--satellite-panel-opacity", String(nextOpacity));
    this.opacityInput.value = String(Math.round(nextOpacity * 100));
    if (persist) localStorage.setItem(STORAGE_KEYS.opacity, String(nextOpacity));
  }

  setDensity(density, { persist = true } = {}) {
    const nextDensity = density === "compact" ? "compact" : "comfortable";

    this.panel.classList.toggle("is-compact", nextDensity === "compact");
    this.densityInput.value = nextDensity;
    if (persist) localStorage.setItem(STORAGE_KEYS.density, nextDensity);
  }

  restore() {
    const width = Number(localStorage.getItem(STORAGE_KEYS.width));
    const opacity = Number(localStorage.getItem(STORAGE_KEYS.opacity));
    const density = localStorage.getItem(STORAGE_KEYS.density);

    if (Number.isFinite(width)) this.setWidth(width, { persist: false });
    if (Number.isFinite(opacity)) this.setOpacity(opacity, { persist: false });
    if (density) this.setDensity(density, { persist: false });
  }

  applyStoredWidth() {
    const width = Number(localStorage.getItem(STORAGE_KEYS.width));
    if (Number.isFinite(width)) this.setWidth(width, { persist: false });
  }

  canResize() {
    return window.matchMedia("(min-width: 701px)").matches;
  }

  getWidthLimits() {
    const max = Math.min(
      PANEL_WIDTH.max,
      Math.max(260, window.innerWidth - PANEL_WIDTH.viewportPadding)
    );
    return { min: Math.min(PANEL_WIDTH.min, max), max };
  }
}
