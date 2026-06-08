# Probe Viewer

An interactive web-based visualization tool for browsing microelectrode probe designs used in neuroscience research. The probe data comes from this repository, the [probeinterface_library](https://github.com/SpikeInterface/probeinterface_library): the build reads the manufacturer folders directly, so there is no separate data source to clone.

## Local Development

### Prerequisites

- Node.js (v18 or later recommended)
- Python 3.13+ with [uv](https://docs.astral.sh/uv/) package manager
- Git

### Quick Start

1. **Generate the probe manifest and data files:**

   From the repository root, run:

   ```bash
   uv run apps/probe-viewer/build.py --dev
   ```

   This will:
   - Read the probe JSON files from the manufacturer folders in this repository
   - Generate `public/probes-manifest.json` with metadata for all probes
   - Copy probe JSON files to `public/data/`
   - Start the Vite dev server

2. **Access the app:**

   Open http://localhost:5173 in your browser.

### Alternative: Manual Setup

If you prefer to run steps separately:

1. **Generate the manifest only:**

   ```bash
   uv run apps/probe-viewer/build.py
   ```

   This generates the manifest without starting the dev server.

2. **Install npm dependencies:**

   ```bash
   cd apps/probe-viewer
   npm install
   ```

3. **Start the dev server:**

   ```bash
   npm run dev
   ```

### Available Scripts

From the `apps/probe-viewer` directory:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (requires the manifest to exist; generate it with `build.py` first) |
| `npm run build` | Build the production bundle with Vite (run `build.py` first to generate the manifest and data) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

### Project Structure

```
apps/probe-viewer/
├── src/
│   ├── components/      # React components
│   ├── services/        # Data fetching
│   ├── state/           # Zustand store
│   ├── types/           # TypeScript types
│   └── hooks/           # Custom React hooks
├── public/
│   ├── probes-manifest.json  # Generated probe catalog
│   └── data/                 # Generated probe JSON files
└── index.html
```

## Technology Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI component framework |
| **TypeScript** | Type-safe JavaScript |
| **Vite** | Build tool and dev server - fast HMR, optimized production builds |
| **Zustand** | Lightweight state management (probe cache, UI state, selections) |
| **React Router** | Client-side routing for shareable URLs like `/#/probes/imec/NP1000` |
| **HTML5 Canvas** | Rendering probe geometries (see below for why not SVG) |

### Deployment

The app is deployed to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). On every push to `main`:
1. The workflow runs `apps/probe-viewer/build.py`, which reads the probe JSONs from this repository and generates the manifest
2. Vite builds the production bundle into `apps/probe-viewer/dist/`
3. That `dist/` directory is published as the GitHub Pages site

The site is served from `/probeinterface_library/` (the Vite `base` in `vite.config.ts`), matching the project-page URL `https://spikeinterface.github.io/probeinterface_library/`.

### Hash Routing vs Browser Routing

This app uses **hash-based routing** (`/#/probes/imec/NP1000`) instead of browser routing (`/probes/imec/NP1000`). Here's why:

**The problem with browser routing on GitHub Pages:**

GitHub Pages is a static file server. When you request `/probeinterface_library/probes/imec/NP1000`:
1. GitHub looks for a file at that exact path
2. No such file exists (there's only `index.html`)
3. GitHub returns 404
4. React never loads, so React Router never gets a chance to handle the route

This means direct links and page refresh would break.

**How hash routing solves this:**

The `#` fragment is never sent to the server. When you request `/#/probes/imec/NP1000`:
1. Browser requests `/` from GitHub
2. GitHub returns `index.html`
3. React loads, reads the hash (`#/probes/imec/NP1000`)
4. React Router renders the correct page

Direct links and refresh work perfectly.

**Trade-offs:**

| Aspect | Browser Routing | Hash Routing |
|--------|-----------------|--------------|
| URLs | `/probes/imec/NP1000` | `/#/probes/imec/NP1000` |
| GitHub Pages | Needs workarounds | Works natively |
| SEO | Better | Worse (fragments ignored) |
| Server-side rendering | Compatible | Not compatible |

For a client-side visualization tool like this, hash routing is the pragmatic choice - the downsides (SEO, SSR) don't apply.

## Why Canvas Instead of SVG?

This application uses the HTML5 Canvas 2D API rather than SVG for rendering probe geometries. Both technologies could work for many probes in this catalog, but Canvas was chosen with scalability in mind.

### The Trade-off

SVG and Canvas represent two fundamentally different rendering architectures:

- **SVG (Retained Mode)**: Each element exists as a DOM node. The browser maintains a scene graph with positions, styles, event listeners, and relationships. This makes interaction easy but creates overhead that grows with element count.

- **Canvas (Immediate Mode)**: Drawing commands paint pixels to a bitmap buffer and are then forgotten. No state is retained. This requires more developer effort but eliminates DOM overhead entirely.

### The Neuropixels Challenge

While many probes in this catalog have modest contact counts (32-128 electrodes), Neuropixels probes push into territory where SVG performance becomes problematic:

| Probe Type | Electrodes | Recording Sites to Visualize |
|------------|------------|------------------------------|
| Cambridge Neurotech | 32-256 | SVG handles well |
| Neuronexus | 16-128 | SVG handles well |
| **Neuropixels 1.0** | **960** | Borderline for SVG |
| **Neuropixels 2.0 (single shank)** | **1,280** | Problematic for SVG |
| **Neuropixels 2.0 (4-shank)** | **5,120** | SVG would struggle significantly |

A 4-shank Neuropixels 2.0 probe has 5,120 recording sites arranged across a ~1 x 10 mm plane. Rendering this many elements as SVG DOM nodes, especially with pan/zoom interactions triggering redraws, would cause noticeable lag on many devices.

### SVG Performance Thresholds

Based on benchmarks from Khan Academy, Felt, and the D3.js community:

| Element Count | SVG Performance |
|---------------|-----------------|
| < 500 | Excellent |
| 500-1000 | Good on desktop, may stutter on mobile |
| 1000-2000 | Noticeable lag during animations |
| 2000-5000 | Poor experience, especially on tablets |
| 5000+ | Unacceptable without virtualization |

Canvas maintains near-constant performance regardless of element count since it only manipulates pixels in a bitmap buffer.

### Why Canvas Fits This Application

1. **Scales to high-density probes**: Neuropixels 2.0 with 5,120 electrodes renders as smoothly as a 32-channel probe.

2. **Predictable pan/zoom performance**: Every interaction redraws all contacts. Canvas makes this explicit rather than relying on browser SVG transform optimizations (which vary significantly across browsers and devices).

3. **Mobile-friendly**: Tablets and phones are common in lab settings. Canvas avoids the SVG performance cliff on resource-constrained devices.

4. **No per-element interaction needed**: This viewer displays probe geometry without requiring click/hover on individual contacts. SVG's main advantage (built-in DOM events per element) goes unused.

### When SVG Would Be Better

SVG would be preferable if the application needed:
- Per-contact selection, tooltips, or click handlers
- CSS-based hover effects and transitions
- Accessibility through per-element ARIA labels
- Integration with React's declarative component model

For a probe catalog viewer focused on displaying geometry with pan/zoom, Canvas is the pragmatic choice that ensures consistent performance across the full range of probe densities.
