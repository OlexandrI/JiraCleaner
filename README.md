# Jira Cleaner and Workflow Scanner

This Tampermonkey user script automates cleaning and scanning tasks on Jira admin pages. It provides a flexible UI that lets you run cleaning actions for various Jira entities as well as scan for duplicate workflows by comparing their XML definitions.

## Features

- **Automated Cleaning:**  
  - Cleans inactive workflows, workflow schemes, screens, screen schemes, statuses, issue type schemes, and issue type screen schemes.
  - Adds a "Clean" button to the Jira page header for each active entity.
  - Supports row-level locking (lock/unlock) so you can protect specific items from being removed.
  - Uses localStorage to track cleaning state, allowing safe page reloads without accidental cleaning.

- **Workflow Duplicate Scanner:**  
  - Scans active workflows by fetching their XML representations.
  - Fully parses each workflow into structured objects (including initial actions, common actions, steps, and statuses).
  - Performs a detailed comparison between workflows, including:
    - Full comparison of action meta, validators, results, and post-functions.
    - Comparison of statuses (ignoring differences in case, whitespace, or non-letter symbols).
  - Displays the results directly on the page in a fixed panel, including links to workflows that are identical or possibly similar.

- **User Interface Integration:**  
  - Automatically detects the current Jira admin page and adds the relevant UI controls.
  - Provides header buttons (such as "Clean", "Stop Clean", and "Scan") for immediate interaction.
  - Enhances the table rows with extra information (e.g., statuses and duplicate workflow links) when scanning.

## Installation

1. **Install Tampermonkey:**  
   If you haven't already, install the [Tampermonkey extension](https://www.tampermonkey.net/) for your browser.

2. **Add the Script:**  
   - Visit the download URL:  
     `https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-cleaner.user.js`  
   - Tampermonkey will prompt you to add the script.
   - Alternatively, you can manually create a new user script in Tampermonkey and paste the content from the repository.

3. **Automatic Updates:**  
   The script is set up to update automatically using the update URL:
   `https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-cleaner.user.js`

## Usage

1. **Open a Jira Admin Page:**  
   Navigate to a Jira secure admin page (matching the URL pattern provided in the script).

2. **Cleaning Actions:**  
   - If the page supports cleaning (e.g., Inactive Workflows, Screens, etc.), a "Clean" button will be added to the page header.
   - Click the button to start the cleaning process.
   - For each table row, a lock/unlock action is added. Use these to prevent the removal of specific items.

3. **Workflow Scanning:**  
   - On pages showing active workflows, a "Scan" button is added to the header.
   - Click "Scan" to fetch and parse the XML for each workflow.
   - The script compares workflows in detail and displays the comparison results in a fixed panel on the page.
   - The results include:
     - The list of statuses for each workflow.
     - Links to workflows that are completely identical.
     - Links to workflows that are possibly similar based on action comparison.

## Configuration

- **LocalStorage:**  
  The script uses localStorage (with the prefix `jira_cleaner_`) to store:
  - Cleaning state (whether cleaning is running)
  - Lock status for individual items

- **Selectors & Actions:**  
  Each Jira entity (e.g., Screens, Statuses, etc.) has its own class with customizable selectors and delete actions. You can modify these in the source if your Jira instance uses custom DOM structures.

## Changelog

### v1.1.1
- **Disable Debugging Mode:**  
  Debug mode is now disabled by default so that real cleaning operations are executed without interference.

### v1.1.0
- **Remove Duplicate Transitions:**  
  The script now filters out duplicate transitions during workflow parsing.

### v1.0.4

- **Enhanced Workflow Parsing:**  
  - Transitions are no longer tracked as statuses.
  - A dedicated transitions list is now shown in the scan results.

### v1.0.2:

  - Added detailed duplicate scanning for workflows.
  - Implemented full XML parsing and comparison for workflow actions, validators, and post-functions.
  - Enhanced UI to display scanning results directly within Jira pages.

## License

This project is licensed under the MIT License.

## Author

**Oleksandr Berezovskyi**

---

Feel free to adjust the content to better match your project details and any additional usage instructions you might have.
