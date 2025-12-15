# Bespoke Simulation Template

This directory contains a template for creating embedded applications that share a consistent design system and user experience.

## Components

### 1. Design System Integration
This template uses the CodeSignal Design System located in `client/design-system/`:
- **Foundations**: Colors, spacing, typography tokens
- **Components**: Buttons, boxes, inputs, dropdowns, tags
- Light and dark theme support (automatic)
- See the [design system repository](https://github.com/CodeSignal/learn_bespoke-design-system) for full documentation

### 2. `client/app.css`
Application-specific CSS providing:
- Base layout components (header, sidebar, main-layout)
- Utility classes (spacer)
- Application-specific styling and overrides

### 3. `client/index.html`
A base HTML template that includes:
- Navigation header with app name and help button
- Main layout structure (sidebar + content area)
- Help modal integration
- Proper CSS and JavaScript loading

### 4. `client/help-modal.js`
A dependency-free JavaScript module for the help modal system:
- Consistent modal behavior across all apps
- Keyboard navigation (ESC to close)
- Focus management
- Custom event system

### 5. `client/help-content-template.html`
A template for creating consistent help content:
- Table of contents navigation
- Standardized section structure
- FAQ with collapsible details
- Image integration guidelines

## Usage Instructions

### Setting Up a New Application

1. **Clone the repository**
2. **Ensure the design-system submodule is initialized**:
   ```bash
   git submodule update --init --recursive
   ```

3. **Customize the HTML template** by replacing placeholders:
   - `<!-- APP_TITLE -->` - Your application title
   - `<!-- APP_NAME -->` - Your application name (appears in header)
   - `<!-- APP_SPECIFIC_HEADER_CONTENT -->` - Any additional header elements
   - `<!-- APP_SPECIFIC_MAIN_CONTENT -->` - Your main content area
   - `<!-- APP_SPECIFIC_CSS -->` - Links to your app-specific CSS files
   - `<!-- APP_SPECIFIC_SCRIPTS -->` - Links to your app-specific JavaScript files

3. **Use Design System Components**
   The template uses design system components directly. Use these classes:
   - Buttons: `button button-primary`, `button button-secondary`, `button button-danger`, `button button-text`
   - Boxes/Cards: `box card` for card containers
   - Inputs: Add `input` class to input elements: `<input type="text" class="input" />`

4. **Implement your application logic**. You can use Cursor or other agents for it. There is a file called `AGENTS.md` that contains context LLM can use.
5. **Customise your help content** using the help content template
3. **Use Design System Components**
   The template uses design system components directly. Use these classes:
   - Buttons: `button button-primary`, `button button-secondary`, `button button-danger`, `button button-text`
   - Boxes/Cards: `box card` for card containers
   - Inputs: Add `input` class to input elements: `<input type="text" class="input" />`

4. **Implement your application logic**. You can use Cursor or other agents for it. There is a file called `AGENTS.md` that contains context LLM can use.
5. **Customise your help content** using the help content template

### Customizing Help Content

Use the `help-content-template.html` as a starting point:

1. **Replace placeholders** like `<!-- APP_NAME -->` with your actual content
2. **Add sections** as needed for your application
3. **Include images** by placing them in a `help/img/` directory
4. **Use the provided structure** for consistency across applications


### Help Modal API

The `HelpModal` class provides several methods:

```javascript
// Initialize
const modal = HelpModal.init({
  triggerSelector: '#btn-help',
  content: helpContent,
  theme: 'auto'
});

// Update content dynamically
modal.updateContent(newHelpContent);

// Destroy the modal
modal.destroy();
```

## Server

This template includes a local development server (`server.js`) that provides:
- Static file serving for your application
- WebSocket support for real-time messaging
- A REST API for triggering client-side alerts

### Starting the Server

```bash
# Local development
npm run start:dev   # Vite + API for local development
# Production
npm run build       # Create production build in dist/
npm run start:prod  # Serve built assets from dist/
```


### Environment Variables

The server supports the following environment variables:

- **`PORT`** - Server port number
  - Development: Can be set to any port (e.g., `PORT=3001`), defaulting to `3000`
  - Production: Ignored (always `3000` when `IS_PRODUCTION=true`)

- **`IS_PRODUCTION`** - Enables production mode
  - Set to `'true'` to enable production mode
  - When enabled:
    - Server serves static files from `dist/` directory
    - Port is forced to `3000`
    - Requires `dist/` directory to exist (throws error if missing)


### Vite Build System

This project uses [Vite](https://vitejs.dev/) as the build tool for fast development and optimized production builds.

#### Build Process

Running `npm run build` executes `vite build`, which:
- Reads source files from the `client/` directory (configured in `vite.config.js`)
- Processes and bundles JavaScript, CSS, and other assets
- Outputs optimized production files to the `dist/` directory
- Generates hashed filenames for cache busting

### WebSocket Messaging API

The server provides a `POST /message` endpoint that allows you to send real-time messages to connected clients. This can be used to signal changes in the client during events like "Run" or "Submit". When a message is sent, the preview window with the application open will display an alert with the message.

It uses the `ws` package, so if you want to use it, install the packages (but this is optional).

```
npm install
```

#### Endpoint: `POST /message`

**Request Format:**
```json
{
  "message": "Your message here"
}
```

**Example using curl:**
```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from the server!"}'
```

## CI/CD and Automated Releases

This template includes a GitHub Actions workflow (`.github/workflows/build-release.yml`) that automatically builds and releases your application when you push to the `main` branch.

### How It Works

When you push to `main`, the workflow will:

1. **Build the project** - Runs `npm run build` to create production assets in `dist/`
2. **Create a release tarball** - Packages `dist/`, `package.json`, `server.js`, and production `node_modules/` into `release.tar.gz`
3. **Create a GitHub Release** - Automatically creates a new release tagged as `v{run_number}` with the tarball attached

### Release Contents

The release tarball (`release.tar.gz`) contains everything needed to deploy the application:
- `dist/` - Built production assets
- `package.json` - Project dependencies and scripts
- `server.js` - Production server
- `node_modules/` - Production dependencies only

### Using Releases

To deploy a release:

1. Download `release.tar.gz` from the latest GitHub Release (e.g. with `wget`)
2. Extract (and remove) the tarball: `tar -xzf release.tar.gz && rm release.tar.gz`
3. Start the production server: `npm run start:prod`
