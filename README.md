# Puppeteer REST API

A Node.js open-source project that exposes Puppeteer browser automation capabilities via a RESTful API. This allows you to control headless Chrome/Chromium browsers remotely for web scraping, testing, and automation tasks, for example, integrating with workflow automation tools like N8N.

## Features

- Launch and manage browser instances via HTTP endpoints
- Perform page navigation, screenshot, and PDF generation
- Execute custom scripts in browser context
- RESTful API design for easy integration

## Folder Structure

```
src/
├── browser.ts   # Contains functions for browser control using Puppeteer
├── server.ts    # Initializes the server and sets up API endpoints for data exchange
├── util.ts      # Utility functions supporting browser and server operations
```

## Getting Started

### Prerequisites

- Node.js >= 16
- npm

### Installation

#### 1. Clone the Project

- **Download ZIP:** Get the ZIP from GitHub, extract, and open a terminal in the project directory.
OR
- **Clone with Git:**
    ```bash
    git clone <repository-url>
    cd <project-folder>
    ```
#### 2. Install Dependencies

    ```bash
    npm install
    ```

#### 3. Compile TypeScript

    ```bash
    npx tsc
    ```

#### 4. Run the Server

To start the server with the default configuration, use the following command:

```bash
npm start
```

The API will be available at `http://localhost:3000`.

To start the server on a custom port, use the following command:

```bash
node dist/server.js 5000
```

Replace `5000` with your desired port number. The API will then be available at `http://localhost:<your-port>`.

## Example Usage

Below are example requests for common API endpoints. All requests should be sent to your running server (default: `http://localhost:3000`).

### 1. Check Browser Status

```http
GET /check-browser
```
**Response:**
```json
{ "open": true }
```

### 2. Start a Chrome Browser

```http
POST /start-browser
Content-Type: application/json

{
    "headless": true,
    "debuggingPort": 9222,
    "userDataDir": "C:/chrome-user-data",
    "profileDirectory": "Profile 1",
    "anotherArgs": "--disable-gpu --no-sandbox"
}
```

### 3. Open a New Tab

```http
GET /new-tab
```
**Response:**
```json
{ "pageId": "0" }
```

### 4. Navigate to a Page

```http
POST /go-to
Content-Type: application/json

{
    "pageId": "0",
    "url": "https://example.com"
}
```

### 5. Take a Screenshot

```http
POST /screenshot
Content-Type: application/json

{
    "url": "https://example.com"
}
```
**Response:** PNG image

### 6. Get Page HTML

```http
POST /html
Content-Type: application/json

{
    "url": "https://example.com"
}
```
**Response:** HTML content

### 7. Click a Selector

```http
POST /click
Content-Type: application/json

{
    "pageId": "0",
    "selector": "#login-button",
    "options": { "delay": 100 }
}
```

### 8. Type Text into a Selector

```http
POST /type
Content-Type: application/json

{
    "pageId": "0",
    "selector": "#username",
    "text": "myuser",
    "options": { "delay": 50, "clear": true }
}
```

### 9. Wait for a Selector

```http
POST /wait-for-selector
Content-Type: application/json

{
    "pageId": "0",
    "selector": "#result",
    "options": { "timeout": 5000, "visible": true }
}
```

### 10. Wait for a Function

```http
POST /wait-for-function
Content-Type: application/json

{
    "pageId": "0",
    "fn": "window.someVar === true",
    "options": { "timeout": 5000 }
}
```

### 11. Evaluate JavaScript

```http
POST /evaluate
Content-Type: application/json

{
    "pageId": "0",
    "fn": "document.title"
}
```
**Response:**
```json
{ "success": true, "result": "Example Domain" }
```

## Contributing

Contributions are welcome! Please open issues or submit pull requests.

## License

MIT
