# Satellite Tracker

<img width="800" height="403" alt="ezgif com-video-to-gif-converter" src="https://github.com/user-attachments/assets/679e1689-341d-4ae6-ba32-aa911c19cc9c" />

An interactive 3D satellite visualization and pass-prediction web application built with Three.js, satellite.js, and live orbital data from CelesTrak.

The application renders Earth and its surrounding space environment, propagates satellite positions from Two-Line Element data in real time, and allows users to inspect or follow individual spacecraft directly in the browser.

## Features

- Interactive 3D Earth and space environment
- Real-time satellite position propagation from TLE data
- Live satellite data loaded from CelesTrak
- Multiple selectable satellite groups with color coding
- Search loaded satellites by name or NORAD catalog ID, with matching results as you type
- Support for up to 8,000 displayed satellites using instanced rendering
- Click a satellite to view its orbital information
- Double-click a satellite to follow it with the camera
- Full-orbit trajectory visualization for the selected satellite
- Hover-based satellite identification
- User location and ground-station marker support
- Browser geolocation integration
- Next-pass prediction for a selected satellite and ground station
- Pass details including:
  - Acquisition of signal (AOS)
  - Loss of signal (LOS)
  - Pass duration
  - Maximum elevation
  - Azimuth, elevation, and range samples
  - Satellite sunlight and observer lighting conditions
- Responsive full-screen interface with orbit controls
- Cached-data and partial-failure handling when CelesTrak data is unavailable

## Demo Controls

| Action | Control |
| --- | --- |
| Rotate the globe | Left-click and drag |
| Zoom | Mouse wheel or trackpad |
| Select a satellite | Single-click a satellite |
| Track a satellite | Double-click a satellite |
| Inspect a satellite | Hover over a satellite |
| Find a satellite | Search by name or NORAD ID, then choose a result |
| Reset the camera | Use the reset-view control |
| Display the Moon's orbit | Click the Moon |
| Predict a pass | Select a satellite, enter a ground station, and run the prediction |

## Tech Stack

- **JavaScript (ES modules)**
- **Three.js** for instanced satellite rendering, camera controls, lighting, and scene management
- **satellite.js** for SGP4 orbital propagation and coordinate transformations
- **CelesTrak** for current TLE satellite datasets
- **Vite** for local development and production builds
- **Web Geolocation API** for ground-station positioning

## How It Works

1. The application requests one or more satellite groups from CelesTrak.
2. Each satellite's TLE is converted into an SGP4 satellite record using satellite.js.
3. Satellite positions are periodically propagated in Earth-centered inertial coordinates.
4. The position is transformed and scaled into the Three.js scene.
5. Selecting a satellite, either from the scene or search, draws a predicted orbital path, moves the camera to it, and exposes its orbital data.
6. Pass prediction searches forward from the current time for horizon crossings relative to a chosen ground station.
7. The predicted pass is sampled to calculate maximum elevation, duration, range, azimuth, and likely visibility conditions.

Visible satellites are grouped by color and rendered with `THREE.InstancedMesh`. Each group shares one geometry and material, avoiding thousands of separate satellite draw calls. Position propagation runs less frequently than the display frame rate because orbital motion does not require a 60 Hz refresh.

## Getting Started

### Prerequisites

Install [Node.js](https://nodejs.org/) version 18 or newer. A current LTS release is recommended.

### Installation

```bash
git clone https://github.com/saucypilot/Satellite-tracker.git
cd Satellite-tracker/satellite-tracker
npm install
```

### Run Locally

```bash
npm run dev
```

Open the local address printed by Vite, usually:

```text
http://localhost:5173
```

### Production Build

```bash
npm run build
```

The optimized build will be generated in the `dist` directory.

To preview the production build locally:

```bash
npm run preview
```

## Project Structure

```text
Satellite-tracker/
├── README.md
└── satellite-tracker/
    ├── index.html
    ├── package.json
    └── src/
        ├── main.js                    # Application orchestration and interactions
        ├── satellites.js              # Satellite loading, propagation, and rendering
        ├── celestrak.js               # CelesTrak groups, requests, colors, and caching
        ├── passPrediction.js           # Ground-station pass calculations
        ├── SatelliteGroupSelector.js   # Interface controls and satellite details
        ├── UserLocationMarker.js       # Geolocation and ground-station marker
        ├── earth.js                    # Earth model and rotation
        ├── spaceEnvironment.js         # Moon, stars, lighting, and space scene
        ├── style.css                   # Application styling
        └── utils/
            └── coords.js               # Coordinate and astronomical utilities
```

## Orbital Calculations

Satellite positions are propagated from TLE data using the SGP4 implementation provided by satellite.js. The application performs coordinate conversions between Earth-centered inertial, Earth-centered fixed, geodetic, and observer-relative coordinate systems.

Pass prediction identifies when a spacecraft rises above and falls below the observer's horizon. It refines those crossings using a binary search and samples the pass to determine its highest elevation and visibility context.

The visibility estimate considers whether the satellite is illuminated by the Sun and whether the observer is in daylight, twilight, or darkness. It is an estimate and should not be treated as a guarantee that a satellite will be visible to the naked eye.

## Data and Accuracy

Orbital predictions are only as accurate as the available TLE data. TLEs become less reliable as they age, particularly for maneuvering spacecraft and objects in low Earth orbit.

This project is intended for visualization, education, and portfolio demonstration. It should not be used for spacecraft operations, collision avoidance, mission-critical tracking, or safety-critical decisions.

## Potential Improvements

- Time controls and orbital playback
- Ground tracks and coverage footprints
- Conjunction and close-approach visualization
- Historical TLE playback
- Multiple saved ground stations
- Pass notifications and calendar export
- Web Worker-based propagation for larger catalogs
- GPU-instanced rendering for improved performance
- Automated testing for coordinate and pass calculations

## License

No license has been added yet. Unless a license is provided, the repository remains under standard copyright protection.

## Author

Created by [saucypilot](https://github.com/saucypilot).
