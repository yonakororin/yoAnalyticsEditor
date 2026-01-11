# Project Context: AnalyticsEditor

## Overview
**AnalyticsEditor** is a visual SQL builder and database management tool. It allows users to create database queries visually using a node-based interface in a web browser and execute them. It also supports CLI execution of saved graph files for batch processing.

Originally part of `mngtools/ebroot/database`, it has been extracted into a standalone project located at `/mnt/c/Projects/AnalyticsEditor`.

## Directory Structure

```text
/mnt/c/Projects/AnalyticsEditor/
├── api.php                 # Web API entry point (handles AJAX requests)
├── cli.php                 # CLI entry point (executes saved JSON graphs)
├── index.html              # Main frontend HTML
├── script.js               # Main frontend JS entry point
├── style.css               # Main stylesheet
├── README.md               # Project documentation
├── classes/                # PHP Backend Classes
│   ├── ApiController.php   # Routes API requests
│   ├── CliController.php   # Manages CLI execution flow
│   ├── DatabaseExecutor.php# Handles MySQL connections and queries
│   ├── Logger.php          # Logging utility
│   ├── controllers/        # Specific logic controllers (Data, Database, File)
│   └── nodes/              # Node processing logic (Table, Query, File, etc.)
├── modules/                # JavaScript Frontend Modules
│   ├── App.js              # Main application logic
│   ├── ui/                 # UI components (Modal, etc.)
│   └── nodes/              # Node UI definitions
└── config/                 # Configuration directory
    └── config.json         # Database connection settings (required)
```

## Recent Changes (Migration to AnalyticsEditor)

### 1. Project Restructuring
- The project was flattened. `webroot/database` structure is gone.
- `api.php` and `cli.php` are now in the root directory.
- `config` folder is expected to be in the root directory.

### 2. Path Updates
- **Project Root Resolution**:
  - `classes/ApiController.php` and `classes/CliController.php` now resolve the project root using `realpath(__DIR__ . '/../')`.
- **Log Path**:
  - `classes/Logger.php` now logs to `/var/log/AnalyticsEditor/api_debug.log`.
- **Header Comments**:
  - PHP files have been updated to reflect their new locations (e.g., `// classes/Logger.php`).

### 3. Usage Updates
- **Web Server**:
  - Run with `php -S localhost:8080`.
  - Access at `http://localhost:8080/`.
- **CLI Execution**:
  - Run with `php cli.php <graph_file.json> [options]`.

## Configuration
The application requires a `config/config.json` file in the project root with the following structure:
```json
{
    "db": {
        "host": "127.0.0.1",
        "port": 3306,
        "user": "your_user",
        "password": "your_password"
    }
}
```

## Key Components

### Backend (PHP)
- **ApiController**: Dispatches requests to `DatabaseController`, `FileController`, or `DataController`.
- **CliController**: Loads a JSON graph, determines execution order (topological sort), and executes nodes via `NodeProcessor` classes.
- **DatabaseExecutor**: Wraps `mysql` command execution. It uses temporary files for SQL to avoid command line length limits and security issues.

### Frontend (JavaScript)
- **App.js**: Manages the canvas, node connections, and global state.
- **Nodes**: Each node type (Table, Query, etc.) has a corresponding JS class for UI and a PHP class for backend execution.

## Pending Tasks / Notes
- Ensure `/var/log/AnalyticsEditor` exists and is writable by the web server user.
- The `db` directory (management scripts) mentioned in README is currently outside this workspace context.
