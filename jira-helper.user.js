// ==UserScript==
// @name         Jira Helper Toolkit
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Some simple useful features for Jira
// @author       Oleksandr Berezovskyi
// @downloadURL  https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-helper.user.js
// @updateURL    https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-helper.user.js
// @include      /^https?:\/\/([^\.\/]+\.)*jira.[^\/]+\//
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Ми будемо зберігати налаштування та пропорці про запуск очищення в localStorage
  // Також зберігатимемо заблоковані елементи, щоб не очищати їх
  class StorageController {
    constructor(prefix = "jira_helpers_") {
      this.prefix = prefix || "jira_helpers_";
    }

    static fixKey(key) {
      return key.toLowerCase().replace(/\s/g, "_");
    }

    set(key, value) {
      localStorage.setItem(this.prefix + StorageController.fixKey(key), value);
    }

    get(key, defaultValue = null) {
      const finalKey = this.prefix + StorageController.fixKey(key);
      const result = localStorage.getItem(finalKey);
      if (result === null) {
        return defaultValue;
      }
      return result;
    }

    has(key) {
      return this.get(StorageController.fixKey(key)) !== null;
    }
  }

  const storage = new StorageController();

  function AddMainMenuButton(text, onClick, additionalClass = "") {
    const header = document.querySelector(
      "nav.aui-header div.aui-header-primary ul.aui-nav"
    );
    if (!header) {
      console.error("Main Header not found");
      return false;
    }
    const button = document.createElement("button");
    button.className = "aui-button " + additionalClass;
    button.innerText = text;
    button.addEventListener("click", onClick);
    header.appendChild(button);
  }

  function JiraIsReady() {
    return typeof JIRA === "object";
  }

  function runOrDelay(check, fn, firstDelay = false) {
    if (document.readyState !== "complete" || !check() || firstDelay) {
      setTimeout(function () {
        runOrDelay(check, fn);
      }, 200);
    } else {
      fn();
    }
  }

  function trim(string) {
    return string.replace(/^[\s\r\n\t]+|[\s\r\n\t]+$/g, "");
  }

  function IsWorkingDay(date) {
    const weekDay = date.getDay();
    return weekDay != 0 && weekDay != 6;
  }

  function GetAllWorkingDays(startDate, endDate) {
    var result = [];
    var currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      if (IsWorkingDay(currentDate))
        result[result.length] = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return result;
  }

  function GetWorkTimeDiff(
    startDate,
    endDate,
    workHours = [10, 19],
    workDayDurationHours = 8
  ) {
    // Same day check
    if (startDate.toDateString() === endDate.toDateString()) {
      return Math.min(
        Math.abs(endDate - startDate) / 1000,
        workDayDurationHours * 3600
      );
    }

    var result = 0;
    var currentDate = new Date(startDate);
    if (currentDate.getHours() < workHours[0]) {
      currentDate.setHours(workHours[0]);
      currentDate.setMinutes(0);
      currentDate.setSeconds(0);
    } else if (currentDate.getHours() >= workHours[1]) {
      currentDate.setHours(workHours[1]);
      currentDate.setMinutes(0);
      currentDate.setSeconds(0);
    }
    while (currentDate <= endDate) {
      if (IsWorkingDay(currentDate)) {
        if (currentDate.toDateString() === endDate.toDateString()) {
          result += Math.max(
            0,
            Math.min(
              (endDate - currentDate) / 1000,
              workDayDurationHours * 3600
            )
          );
        } else {
          var currentDateWorkEnd = new Date(currentDate);
          currentDateWorkEnd.setHours(workHours[1]);
          currentDateWorkEnd.setMinutes(0);
          currentDateWorkEnd.setSeconds(0);
          result += Math.max(
            0,
            Math.min(
              (currentDateWorkEnd - currentDate) / 1000,
              workDayDurationHours * 3600
            )
          );
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(workHours[0]);
      currentDate.setMinutes(0);
      currentDate.setSeconds(0);
    }
    return result;
  }

  /** Paste richly formatted text.
   *
   * @param {string} rich - the text formatted as HTML
   * @param {string} plain - a plain text fallback
   */
  async function pasteRich(rich, plain) {
    if (typeof ClipboardItem !== "undefined") {
      // Shiny new Clipboard API, not fully supported in Firefox.
      // https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#browser_compatibility
      const html = new Blob([rich], { type: "text/html" });
      const text = new Blob([plain], { type: "text/plain" });
      const data = new ClipboardItem({ "text/html": html, "text/plain": text });
      await navigator.clipboard.write([data]);
    } else {
      // Fallback using the deprecated `document.execCommand`.
      // https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand#browser_compatibility
      const cb = (e) => {
        e.clipboardData.setData("text/html", rich);
        e.clipboardData.setData("text/plain", plain);
        e.preventDefault();
      };
      document.addEventListener("copy", cb);
      document.execCommand("copy");
      document.removeEventListener("copy", cb);
    }
  }

  const issuesCache = {};
  function getIssueInfo(issueKey, cb) {
    if (issuesCache.hasOwnProperty(issueKey)) {
      setTimeout(() => {
        cb(issuesCache[issueKey]);
      }, 1);
      return;
    }

    // Returns a full representation of the issue for the given issue key.
    // An issue JSON consists of the issue key, a collection of fields, a link to the workflow transition sub-resource, and (optionally) the HTML rendered values of any fields that support it (e.g. if wiki syntax is enabled for the description or comments).
    // GET /rest/api/2/issue/{issueIdOrKey}
    const key = encodeURIComponent(issueKey);
    // get host from current page
    const host = window.location.host;
    // get protocol from current page
    const protocol = window.location.protocol;
    // also we need add parametr expand: 'changelog,fields', fields: '*all,-comment'
    const uri =
      `${protocol}//${host}/rest/api/2/issue/${key}?` +
      new URLSearchParams({
        expand: "changelog,fields",
        fields: "*all,-comment",
        maxResults: 5000,
      }).toString();

    return fetch(uri, { method: "GET" })
      .then((response) => response.text())
      .then((str) => {
        try {
          const data = JSON.parse(str);
          issuesCache[issueKey] = data;
          cb(data);
        } catch (err) {
          console.error("Error parsing JSON", err);
        }
      })
      .catch((err) => {
        console.error("Fetch issue error", err);
      });
  }

  // --- Base Class for a Helper Entity ---

  class JireHelper {
    constructor(name, description) {
      this.name = name;
      this.storagePrefix = StorageController.fixKey(name) + "_";
      this.description = description;
      this.detectSelector = null;
    }

    // Save data to local storage
    set(key, value) {
      storage.set(this.storagePrefix + key, value);
    }

    // Get data from local storage
    get(key, defaultValue = null) {
      return storage.get(this.storagePrefix + key, defaultValue);
    }

    // Check if the key is in the storage
    has(key) {
      return storage.has(this.storagePrefix + key);
    }

    // Check if the helper is active
    isActive() {
      return this.get("active", "true") === "true";
    }

    // Check if the helper should be active on the current page
    isPage() {
      return (
        this.detectSelector === null ||
        !!document.querySelector(this.detectSelector)
      );
    }

    // Should return true if helper should wait for JIRA to be active
    waitJIRAActive() {
      return true;
    }

    // Should return true if helper should be updated on issue refresh
    updateOnIssueRefreshed() {
      return true;
    }

    // Should return time in milliseconds if periodic update is needed
    // Otherwise, return false
    periodicUpdate() {
      return false;
    }

    setup() {}

    setupUI() {}

    update() {}

    updateUI() {}

    init() {
      if (this.waitJIRAActive() && !JiraIsReady()) {
        runOrDelay(JiraIsReady, this.init.bind(this), true);
      }

      this.setup();
      this.setupUI();

      if (this.periodicUpdate()) {
        setInterval(this.update.bind(this), this.periodicUpdate());
        setInterval(this.updateUI.bind(this), this.periodicUpdate());
      }

      if (this.updateOnIssueRefreshed()) {
        const self = this;
        JIRA.bind(JIRA.Events.ISSUE_REFRESHED, (e, context, reason) => {
          self.update();
          self.updateUI();
        });
      }
    }
  }

  // --- Helper: Copy issue key as link and issue summary to clipboard ---

  class CopyIssueKeyHelper extends JireHelper {
    constructor() {
      super("CopyIssueKey", "Copy issue key and summary to clipboard");
      this.detectSelector = null;
    }

    getAllIssues() {
      let result = [];

      document
        .querySelectorAll(".ghx-detail-issue, .ghx-issue, #issue-content")
        .forEach((issue) => {
          const key = trim(
            (
              issue.querySelector(".ghx-key") ||
              issue.querySelector(".aui-nav a.issue-link")
            ).innerText
          );
          const summary = trim(
            (
              issue.querySelector(".ghx-summary") ||
              issue.querySelector(
                ".ghx-fieldname-summary.ghx-detail-description"
              ) ||
              issue.querySelector("#summary-val")
            ).innerText
          );
          const link =
            issue.querySelector(".ghx-key a") ||
            issue.querySelector(".aui-nav a.issue-link");
          result.push({ issue, key, summary, link, container: link });
        });

      return result;
    }

    makeCopyButton(issue) {
      if (issue.container && issue.link) {
        const button = document.createElement("a");
        button.className = "copy-issue-key";
        button.href = "#";
        const icon = document.createElement("span");
        icon.className = "aui-icon aui-iconfont-copy";
        icon.style = "--aui-icon-size:12px";
        icon.style.verticalAlign = "baseline";
        button.appendChild(icon);
        button.style.marginLeft = "4px";
        button.style.fontSize = "12px";
        button.style.textDecoration = "none";
        button.style.verticalAlign = "middle";
        // We want to copy key as link to issue and summary: KEY - SUMMARY
        button.addEventListener("click", (e) => {
          pasteRich(
            `<a href="${issue.link.href}">${issue.key}</a> - ${issue.summary}`,
            `${issue.key} - ${issue.summary}`
          );
          e.preventDefault();
        });
        issue.container.appendChild(button);
      }
    }

    setupUI() {
      this.updateUI();
    }

    updateUI() {
      this.getAllIssues().forEach((issue) => {
        if (!issue.container.querySelector(".copy-issue-key")) {
          this.makeCopyButton(issue);
        }
      });
    }
  }

  // --- Helper: Show on board for issues cards links icons in the corner ---
  class ShowIssueLinksHelper extends JireHelper {
    constructor() {
      super(
        "ShowIssueLinks",
        "Show issue links icons in the corner of the cards"
      );
      this.cache = {};
    }

    getAllIssues() {
      let result = [];

      document.querySelectorAll(".ghx-issue.js-issue").forEach((issue) => {
        const key = trim(
          (
            issue.querySelector(".ghx-key") ||
            issue.querySelector(".aui-nav a.issue-link")
          ).innerText
        );
        result.push({ issue, key });
      });

      return result;
    }

    getLinksColor(issueData) {
      let result = "var(--ds-icon, #505f79)";

      // statusses can be - "indeterminate", "done", "new"
      const tableOfColors = [
        {
          // Blocked by other task that not done and not in progress
          text: "blocked",
          statuses: ["new"],
          selfstatus: null,
          color: "rgb(218, 48, 33)",
        },
        {
          // Blocked by other task that in progress
          text: "blocked",
          statuses: ["indeterminate"],
          selfstatus: null,
          color: "rgb(224, 120, 22)",
        },
        {
          // Blocked by other task that done
          text: "blocked",
          statuses: ["done"],
          selfstatus: null,
          color: "rgb(70, 228, 8)",
        },
        {
          // Blocks other task and not in progress
          text: "blocks",
          statuses: ["new", "indeterminate"],
          selfstatus: ["new"],
          color: "rgb(143, 22, 224)",
        },
        {
          // Blocks other task and in progress
          text: "blocks",
          statuses: ["new", "indeterminate"],
          selfstatus: ["indeterminate"],
          color: "rgb(218, 33, 209)",
        },
      ];

      for (let i = 0; i < tableOfColors.length; i++) {
        const cond = tableOfColors[i];
        let breaked = false;
        for (let j = 0; j < issueData.fields.issuelinks.length; j++) {
          const link = issueData.fields.issuelinks[j];
          if (
            (link.inwardIssue &&
              link.type.inward &&
              link.type.inward.indexOf(cond.text) >= 0) ||
            (link.outwardIssue &&
              link.type.outward &&
              link.type.outward.indexOf(cond.text) >= 0)
          ) {
            const otherStatus = (
              link.inwardIssue ? link.inwardIssue : link.outwardIssue
            ).fields.status.statusCategory.key;
            const selfStatus = issueData.fields.status.statusCategory.key;
            if (
              (cond.statuses === null || cond.statuses.includes(otherStatus)) &&
              (cond.selfstatus === null || cond.selfstatus.includes(selfStatus))
            ) {
              result = cond.color;
              breaked = true;
              break;
            }
          }
        }
        if (breaked) break;
      }

      return result;
    }

    checkAndShowLinks(issue) {
      // Check if we have data and have not empty field "issuelinks"
      if (
        issue.data &&
        issue.data.fields &&
        issue.data.fields.issuelinks &&
        issue.data.fields.issuelinks.length > 0
      ) {
        const links = issue.data.fields.issuelinks;
        const color = this.getLinksColor(issue.data);

        // Generate tooltip text with all links issues
        let tooltipText = "";
        links.forEach((link) => {
          if (link.inwardIssue) {
            const key = link.inwardIssue.key;
            if (!key) return;
            const summary = link.inwardIssue.fields.summary || "<No summary>";
            tooltipText += `${link.type.inward}: ${key} - ${summary}\n`;
          } else if (link.outwardIssue) {
            const key = link.outwardIssue.key;
            if (!key) return;
            const summary = link.outwardIssue.fields.summary || "<No summary>";
            tooltipText += `${link.type.outward}: ${key} - ${summary}\n`;
          }
        });

        // and now - add to right top corner of card icon with links
        const icon = document.createElement("span");
        icon.className = "aui-icon aui-iconfont-link";
        icon.style = "--aui-icon-size:12px";
        icon.style.verticalAlign = "baseline";
        icon.innerText = links.length;
        icon.style.color = color;

        const wrap = document.createElement("a");
        wrap.href = "#";
        wrap.className = "show-issues-links";
        wrap.style.position = "absolute";
        wrap.style.top = "0";
        wrap.style.right = "0";
        wrap.style.color = color;
        wrap.style.fontSize = "12px";
        wrap.style.textDecoration = "none";
        wrap.style.padding = "4px";
        wrap.style.zIndex = "1000";
        wrap.title = tooltipText;
        wrap.appendChild(icon);
        issue.issue.appendChild(wrap);
      }
    }

    isPage() {
      return window.location.pathname.includes("/secure/RapidBoard.jspa");
    }

    periodicUpdate() {
      return 1000;
    }

    setupUI() {
      this.updateUI();
    }

    updateUI() {
      this.getAllIssues().forEach((issue) => {
        if (this.cache.hasOwnProperty(issue.key)) {
          return;
        }
        if (!issue.issue.querySelector(".show-issues-links")) {
          // Load information about this issue
          this.cache[issue.key] = issue;
          const self = this;
          getIssueInfo(issue.key, (data) => {
            self.cache[issue.key].data = data;
            self.checkAndShowLinks(self.cache[issue.key]);
          });
        }
      });
    }
  }

  // --- Helper: Show how many time task in progress ---
  class ShowTimeInProgressByStateHistoryHelper extends JireHelper {
    constructor() {
      super(
        "ShowTimeInProgressByStateHistory",
        "Show how many time task in progress"
      );
      this.cache = {};
    }

    getAllIssues() {
      let result = [];

      document.querySelectorAll(".ghx-issue.js-issue").forEach((issue) => {
        const key = trim(
          (
            issue.querySelector(".ghx-key") ||
            issue.querySelector(".aui-nav a.issue-link")
          ).innerText
        );
        result.push({ issue, key });
      });

      return result;
    }

    static isInProgressStatus(statusStr) {
      return statusStr === "In Progress" || statusStr === "indeterminate";
    }

    calcTimeAndShow(issue) {
      if (
        issue.data &&
        issue.data.changelog &&
        issue.data.changelog.histories.length > 0
      ) {
        const changelog = issue.data.changelog.histories
          ? issue.data.changelog.histories
          : [];
        const isInProgress =
          ShowTimeInProgressByStateHistoryHelper.isInProgressStatus(
            issue.data.fields.status.name
          );
        let lastChangeToInProgress = null;
        let lastChangeFromInProgress = null;
        let timeInProgress = 0;
        // Sort changelog by date (first - older, last - newer)
        changelog.sort((a, b) => new Date(a.created) - new Date(b.created));
        for (var q = 0; q < changelog.length; q++) {
          for (var e = 0; e < changelog[q].items.length; e++) {
            if (changelog[q].items[e].field !== "status") continue;
            // Now we should track all status changes to calculate all time in progress
            // Also, if task currently in progress - we should add time from last change to now
            // We calculating only working days
            if (
              ShowTimeInProgressByStateHistoryHelper.isInProgressStatus(
                changelog[q].items[e].toString
              )
            ) {
              const changeDate = new Date(changelog[q].created);
              if (
                !lastChangeToInProgress ||
                lastChangeToInProgress < changeDate
              ) {
                lastChangeToInProgress = changeDate;
              }
            }
            if (
              ShowTimeInProgressByStateHistoryHelper.isInProgressStatus(
                changelog[q].items[e].fromString
              )
            ) {
              const changeDate = new Date(changelog[q].created);
              if (
                !lastChangeFromInProgress ||
                lastChangeFromInProgress < changeDate
              ) {
                lastChangeFromInProgress = changeDate;
              }
              if (
                lastChangeToInProgress &&
                lastChangeToInProgress < changeDate
              ) {
                timeInProgress += GetWorkTimeDiff(
                  lastChangeToInProgress,
                  changeDate
                );
              }
            }
          }
        }

        if (isInProgress && lastChangeToInProgress) {
          timeInProgress += GetWorkTimeDiff(lastChangeToInProgress, new Date());
        }

        if (timeInProgress > 0) {
          // Format spent time to dd:hh:mm, where 1d = 8h
          const spentDays = Math.floor(timeInProgress / 28800);
          timeInProgress -= spentDays * 28800;
          const spentHours = Math.floor(timeInProgress / 3600);
          timeInProgress -= spentHours * 3600;
          const spentMinutes = Math.floor(timeInProgress / 60);
          let timeText = "";
          if (spentDays > 0) timeText += ` ${spentDays}d`;
          if (spentHours > 0) timeText += ` ${spentHours}h`;
          if (spentMinutes > 0) timeText += ` ${spentMinutes}m`;

          let container = issue.issue.querySelector(
            ".ghx-extra-fields .ghx-extra-field-row:first-child"
          );
          let spanIn = container
            ? container.querySelector("span.ghx-extra-field-content")
            : null;
          if (spanIn) {
            if (spanIn.innerText === "None") spanIn.innerText = "";
            else spanIn.innerText += " | ";
            // Add hourglass emoji
            spanIn.innerText += "⏳";
            spanIn.innerText += timeText;
          } else {
            const time = document.createElement("span");
            time.style.color = "var(--ds-icon, #505f79)";
            time.innerText = timeText;
            issue.issue.appendChild(time);
          }
        }
      }
    }

    isPage() {
      return window.location.pathname.includes("/secure/RapidBoard.jspa");
    }

    periodicUpdate() {
      return 1000;
    }

    setupUI() {
      this.updateUI();
    }

    updateUI() {
      this.getAllIssues().forEach((issue) => {
        if (this.cache.hasOwnProperty(issue.key)) {
          return;
        }
        if (!issue.issue.querySelector(".show-issues-links")) {
          // Load information about this issue
          this.cache[issue.key] = issue;
          const self = this;
          getIssueInfo(issue.key, (data) => {
            self.cache[issue.key].data = data;
            self.calcTimeAndShow(self.cache[issue.key]);
          });
        }
      });
    }
  }

  // --- Final Logic: Create and Launch Cleaners ---
  const helpers = [
    new CopyIssueKeyHelper(),
    new ShowIssueLinksHelper(),
    new ShowTimeInProgressByStateHistoryHelper(),
  ];
  // On page load, check which helper is active and add its UI.
  function bootstrap() {
    helpers.forEach((helper) => {
      if (helper.isActive() && helper.isPage()) {
        helper.init();
      }
    });
  }

  if (document.readyState == "complete") {
    bootstrap();
  } else {
    window.addEventListener("load", bootstrap);
  }
})();
