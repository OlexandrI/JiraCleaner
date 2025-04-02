// ==UserScript==
// @name         Jira Helper Toolkit
// @namespace    http://tampermonkey.net/
// @version      1.1.2
// @description  Some simple useful features for Jira
// @author       Oleksandr Berezovskyi
// @downloadURL  https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-helper.user.js
// @updateURL    https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-helper.user.js
// @include      /^https?:\/\/([^\.\/]+\.)*jira.[^\/]+\//
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const saveIssuesDataToLocalStorage = true;

  // Ми будемо зберігати налаштування та пропорці про запуск очищення в localStorage
  // Також зберігатимемо заблоковані елементи, щоб не очищати їх
  class StorageController {
    constructor(prefix = "jira_helpers_") {
      this.prefix = prefix || "jira_helpers_";
    }

    static fixKey(key) {
      return key.toLowerCase().replace(/\s/g, "_");
    }

    get_internal(key) {
      const finalKey = this.prefix + StorageController.fixKey(key);
      const result = localStorage.getItem(finalKey);
      return result;
    }

    // Check if key exists
    // @param key - key to check
    has(key) {
      return this.get_internal(key) !== null;
    }

    // Set expiration time for key
    // @param key - key to set expiration
    // @param expiration - expiration time in seconds
    setExpiration(key, expiration) {
      // Get Now time and add expiration time
      const expireTimePoint = new Date().getTime() + expiration * 1000;
      this.set(key + "_expiration", expireTimePoint);
    }

    // Expire key now
    // @param key - key to expire
    expireIt(key) {
      this.set(key, null);
      this.set(key + "_expiration", null);
    }

    // Check if key is expired
    // @param key - key to check
    // @note If key not have expiration time - return false
    isExpired(key) {
      const expiration = this.get_internal(key + "_expiration");
      if (expiration === null) {
        return false;
      }
      return new Date().getTime() > parseInt(expiration, 10);
    }

    // Check if key exists and not expired
    isValid(key) {
      return this.has(key) && !this.isExpired(key);
    }

    // Set data to local storage
    // @param key - key to set
    // @param value - value to set (should be string)
    // @param expiration - expiration time in seconds
    set(key, value, expiration = null) {
      localStorage.setItem(this.prefix + StorageController.fixKey(key), value);
      if (expiration !== null) {
        this.setExpiration(key, expiration);
      }
    }

    // Set object to local storage
    // @param key - key to set
    // @param value - value to set
    // @param expiration - expiration time in seconds
    setObject(key, value, expiration = null) {
      this.set(key, JSON.stringify(value), expiration);
    }

    // Get data from local storage
    // @param key - key to get
    // @param defaultValue - default value if key not found
    // @return value (always string) or default value
    get(key, defaultValue = null) {
      if (this.isExpired(key)) {
        return defaultValue;
      }
      const finalKey = this.prefix + StorageController.fixKey(key);
      const result = localStorage.getItem(finalKey);
      if (result === null) {
        return defaultValue;
      }
      return result;
    }

    // Get object from local storage
    // @param key - key to get
    // @param defaultValue - default value if key not found
    // @return value or default value
    getObject(key, defaultValue = null) {
      const result = this.get(key, defaultValue);
      if (result === null || typeof result !== "string") {
        return defaultValue;
      }
      return JSON.parse(result);
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

  function BreakExecution(fn, silence = true) {
    setTimeout(() => {
      try {
        fn();
      } catch (e) {
        if (!silence) console.error("Error in function", e);
      }
    }, 1);
  }

  function runOrDelay(check, fn, firstDelay = false) {
    if (document.readyState !== "complete" || !check() || firstDelay) {
      setTimeout(function () {
        runOrDelay(check, fn);
      }, 200);
    } else {
      BreakExecution(fn, false);
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

  // Format work time to dd:hh:mm, where 1d = 8h
  function formatWorkTime(seconds) {
    const spentDays = Math.floor(seconds / 28800);
    seconds -= spentDays * 28800;
    const spentHours = Math.floor(seconds / 3600);
    seconds -= spentHours * 3600;
    const spentMinutes = Math.floor(seconds / 60);
    let timeText = "";
    if (spentDays > 0) timeText += ` ${spentDays}d`;
    if (spentHours > 0) timeText += ` ${spentHours}h`;
    if (spentMinutes > 0) timeText += ` ${spentMinutes}m`;
    return trim(timeText);
  }

  function isInProgressStatus(status) {
    if (typeof status === "string") {
      return status === "In Progress" || status === "indeterminate";
    }
    if (typeof status === "object") {
      if (status.hasOwnProperty("statusCategory")) {
        return status.statusCategory.key === "indeterminate";
      }
      if (status.hasOwnProperty("name")) {
        return status.name === "In Progress" || status.name === "indeterminate";
      }
    }

    return false;
  }

  // Calculate total issue in progress time
  // @param issueData - issue data from JIRA API
  function calcTotalTimeInProgress(issueData) {
    if (
      issueData &&
      issueData.changelog &&
      issueData.changelog.histories.length > 0
    ) {
      const changelog = issueData.changelog.histories
        ? issueData.changelog.histories
        : [];
      const isInProgress = isInProgressStatus(issueData.fields.status.name);
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
          if (isInProgressStatus(changelog[q].items[e].toString)) {
            const changeDate = new Date(changelog[q].created);
            if (
              !lastChangeToInProgress ||
              lastChangeToInProgress < changeDate
            ) {
              lastChangeToInProgress = changeDate;
            }
          }
          if (isInProgressStatus(changelog[q].items[e].fromString)) {
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

      return timeInProgress;
    }

    return -1;
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
  function getIssueInfo(issueKey, cb, errCb = null) {
    if (!issueKey) {
      return;
    }

    if (issuesCache.hasOwnProperty(issueKey)) {
      BreakExecution(() => cb(issuesCache[issueKey], issueKey));
      return;
    }

    if (saveIssuesDataToLocalStorage && storage.isValid(issueKey)) {
      const data = storage.getObject(issueKey);
      issuesCache[issueKey] = data;
      BreakExecution(() => cb(data, issueKey));
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
          if (data.errorMessages && data.errorMessages.length > 0) {
            console.error("Error fetching issue data", data.errorMessages);
            if (errCb) errCb(data.errorMessages, issueKey);
            return;
          }
          issuesCache[issueKey] = data;
          if (saveIssuesDataToLocalStorage) {
            const randMinutes = Math.floor(Math.random() * 3) + 2;
            storage.setObject(issueKey, data, randMinutes * 60);
          }
          cb(data, issueKey);
        } catch (err) {
          console.error("Error parsing JSON", err);
          if (errCb) errCb(err, issueKey);
        }
      })
      .catch((err) => {
        console.error("Fetch issue error", err);
        if (errCb) errCb(err, issueKey);
      });
  }

  // --- Base Class for a Helper Entity ---

  class JiraHelper {
    constructor(name, description) {
      this.name = name;
      this.storagePrefix = StorageController.fixKey(name) + "_";
      this.description = description;
      this.detectSelector = null;
      this.activeForBoards = false;
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
      if (this.activeForBoards) {
        return window.location.pathname.includes("/secure/RapidBoard.jspa");
      }
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

    setup() { }

    setupUI() { }

    update() { }

    updateUI() { }

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
          BreakExecution(() => {
            self.update();
            self.updateUI();
          });
        });
      }
    }

    getAllIssues(bOnlyCards = false) {
      let result = [];
      
      const issueSelector = ".ghx-issue.js-issue" + (bOnlyCards ? "" : " .ghx-detail-issue, #issue-content");

      document
        .querySelectorAll(issueSelector)
        .forEach((issue) => {
          const keyPrefixElem = issue.querySelector(".ghx-key-link-project-key");
          const keyIDElem = issue.querySelector(".ghx-key-link-issue-num");
          const linkElem = issue.querySelector(".ghx-issue-details-link a");
          const detailedLinkElem = issue.querySelector("#key-val");
          let key = "";
          if (keyPrefixElem && keyIDElem) {
            key = trim(keyPrefixElem.innerText) + "-" + trim(keyIDElem.innerText);
          } else
          if (linkElem) {
            key = trim(linkElem.innerText);
          } else
          if (detailedLinkElem) {
            key = trim(detailedLinkElem.innerText);
          }
          key = key.replaceAll("--", "-"); // Fix double dashes in key

          if (!key || key.length < 4) return;

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
  }

  // --- Helper: Copy issue key as link and issue summary to clipboard ---

  class CopyIssueKeyHelper extends JiraHelper {
    constructor() {
      super("CopyIssueKey", "Copy issue key and summary to clipboard");
      this.detectSelector = null;
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

    periodicUpdate() {
      return 2000;
    }
  }

  // --- Helper: Show on board for issues cards links icons in the corner ---
  class ShowIssueLinksHelper extends JiraHelper {
    constructor() {
      super(
        "ShowIssueLinks",
        "Show issue links icons in the corner of the cards"
      );
      this.cache = {};
      this.activeForBoards = true;
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

    periodicUpdate() {
      return 1000;
    }

    setupUI() {
      this.updateUI();
    }

    updateUI() {
      this.getAllIssues(true).forEach((issue) => {
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
  class ShowTimeInProgressByStateHistoryHelper extends JiraHelper {
    constructor() {
      super(
        "ShowTimeInProgressByStateHistory",
        "Show how many time task in progress"
      );
      this.cache = {};
      this.activeForBoards = true;
    }

    static isInProgressStatus(statusStr) {
      return statusStr === "In Progress" || statusStr === "indeterminate";
    }

    calcTimeAndShow(issue) {
      const timeInProgress = calcTotalTimeInProgress(issue.data);
      if (timeInProgress > 0) {
        const timeText = formatWorkTime(timeInProgress);
        let container = issue.issue.querySelector(
          ".ghx-extra-fields .ghx-extra-field-row:last-child"
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

    periodicUpdate() {
      return 1000;
    }

    setupUI() {
      this.updateUI();
    }

    updateUI() {
      this.getAllIssues(true).forEach((issue) => {
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

  // --- Helper: Highlight issue by rules ---

  // Enum for rule criticality
  const RuleCriticality = {
    NOTE: "NOTE",
    WARNING: "WARNING",
    MAJOR: "MAJOR",
    CRITICAL: "CRITICAL",
  };
  const RuleCriticalityWeight = {
    NOTE: 1,
    WARNING: 10,
    MAJOR: 20,
    CRITICAL: 40,
  };

  // Preset colors and icons for rules
  const RuleColors = {
    NOTE: { bgcolor: "rgba(0, 0, 255, 0.2)", icon: "ℹ️" },
    WARNING: { bgcolor: "rgba(255, 165, 0, 0.2)", icon: "⚠️" },
    MAJOR: { bgcolor: "rgba(255, 0, 0, 0.2)", icon: "❗" },
    CRITICAL: { bgcolor: "rgba(255, 0, 0, 0.5)", icon: "🚨" },
  };

  // Rule Class
  class Rule {
    constructor(name, description, criticality) {
      this.name = name;
      this.description = description;
      this.criticality = criticality || RuleCriticality.NOTE;
    }

    // Checks if the rule is violated for a specific issue
    // @param issueData - data of the issue to check
    // @return text of the problem if violated, otherwise false
    // @remark Should be overriden in the child class
    isViolated(issueData) {
      return false;
    }

    getCriticality() {
      return this.criticality;
    }

    getCriticalityWeight() {
      return RuleCriticalityWeight[this.criticality] || 0;
    }
  }

  // --- HighlightIssuesHelper Class ---
  class HighlightIssuesHelper extends JiraHelper {
    constructor() {
      super("HighlightIssues", "Highlight issues based on rules");
      this.rules = [];
      this.activeForBoards = true;
    }

    // Adds a rule to the list
    addRule(rule) {
      this.rules.push(rule);
    }

    applyRules(issue, criticality, tooltip) {
      if (!issue.issue) return;
      if (!RuleColors[criticality]) return;

      const icon = RuleColors[criticality].icon;
      const bgcolor = RuleColors[criticality].bgcolor;
      const iconClass = `rule-icon-${criticality}`;

      // Check if now have rule icon
      let elem = issue.issue.querySelector('.rule-icon');
      if (!elem) elem = document.createElement("span");
      elem.className = 'rule-icon ' + iconClass;
      elem.innerText = icon;
      elem.style.fontSize = "12px";
      elem.style.cursor = "pointer";
      elem.title = tooltip;
      if (!elem.parentNode) {
        // add as first child inside key
        const keyElem = issue.issue.querySelector(".ghx-issue-key-link");
        if (keyElem) {
          keyElem.insertBefore(elem, keyElem.firstChild);
        } else {
          elem.style.position = "absolute";
          elem.style.top = "4px";
          elem.style.right = "4px";
          issue.issue.appendChild(elem);
        }
      }
      issue.issue.style.backgroundColor = bgcolor;
      issue.issue.style.transition = "background-color 0.5s ease-in-out";
    }

    checkRules(issue) {
      if (!issue.data) return;

      // Check all rules, detect hightest criticality, collect tooltip text
      let criticalityWeight = 0;
      let tooltipText = [];
      this.rules.forEach((rule) => {
        const isViolated = rule.isViolated(issue.data);
        if (isViolated) {
          criticalityWeight += rule.getCriticalityWeight();
          tooltipText.push(isViolated);
        }
      });

      if (criticalityWeight > 0) {
        // Detect criticality
        let criticality = RuleCriticality.NOTE;
        for (const [key, value] of Object.entries(RuleCriticalityWeight)) {
          if (criticalityWeight >= value) criticality = key;
        }
        const tooltip = tooltipText.join("\r\n");
        this.applyRules(issue, criticality, tooltip);
      } else {
        // Remove rule icon if no rules violated
        const elem = issue.issue.querySelector('.rule-icon');
        if (elem) {
          elem.remove();
          issue.issue.style.backgroundColor = "transparent";
        }
      }
    }

    periodicUpdate() {
      return 5000;
    }

    setupUI() {
      this.updateUI();
    }

    updateUI() {
      this.getAllIssues(true).forEach((issue) => {
        if (!issue.issue.querySelector(".rule-icon")) {
          const self = this;
          getIssueInfo(issue.key, (data) => {
            issue.data = data;
            self.checkRules(issue);
          });
        }
      });
    }
  }

  // Rule: Overdue
  class OverdueRule extends Rule {
    constructor() {
      super("Overdue", "Issue is overdue", RuleCriticality.MAJOR);
    }

    isViolated(issueData) {
      // Check status first (if not done - check due date)
      const status = issueData.fields?.status?.statusCategory.key;
      if (status === "done") {
        return false;
      }

      const dueDate = issueData.fields?.duedate;
      if (dueDate) {
        const now = new Date();
        const due = new Date(dueDate);
        if (due < now) {
          // How many working hours overdue
          const overdueTime = formatWorkTime(GetWorkTimeDiff(due, now));
          return `Due date is overdue: ${dueDate} (${overdueTime})`;
        }
      }

      return false;
    }
  }

  // Rule: No assignee
  class NoAssigneeRule extends Rule {
    constructor() {
      super("NoAssignee", "Issue has no assignee", RuleCriticality.WARNING);
    }

    isViolated(issueData) {
      const assignee = issueData.fields?.assignee;
      if (!assignee || !assignee.name || !assignee.active) {
        return "No assignee";
      }
      return false;
    }
  }

  // Rule: Task in progress (and not from today) and no work logs
  class NoWorkLogsRule extends Rule {
    constructor() {
      super("NoWorkLogs", "Task in progress and no work logs", RuleCriticality.WARNING);
    }

    isViolated(issueData) {
      const status = issueData.fields?.status?.statusCategory.key;
      if (status !== "indeterminate") {
        return false;
      }

      // check changelog for status change to in progress
      const changelog = issueData.changelog?.histories || [];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      changelog.sort((a, b) => new Date(a.created) - new Date(b.created));
      let lastChangeToInProgress = null;
      for (let i = 0; i < changelog.length; i++) {
        for (let j = 0; j < changelog[i].items.length; j++) {
          if (changelog[i].items[j].field !== "status") continue;
          if (isInProgressStatus(changelog[i].items[j].toString)) {
            const changeDate = new Date(changelog[i].created);
            if (!lastChangeToInProgress || lastChangeToInProgress < changeDate) {
              lastChangeToInProgress = changeDate;
            }
          }
        }
      }

      if (!lastChangeToInProgress || lastChangeToInProgress >= today) {
        return false;
      }

      const worklogs = issueData.fields?.worklog?.worklogs;
      if (!worklogs || worklogs.length === 0) {
        return "No work logs";
      }

      // Check if any work log between last change to in progress and now
      // And has logged last day
      let latestLogDate = new Date(0);
      for (let i = 0; i < worklogs.length; i++) {
        const logDate = new Date(worklogs[i].updated || worklogs[i].started);
        if (logDate >= lastChangeToInProgress && logDate <= now) {
          if (logDate > latestLogDate) {
            latestLogDate = logDate;
          }
        }
      }
      if (latestLogDate <= 0) {
        // No work logs between last change to in progress and now
        return `No work logs since ${lastChangeToInProgress.toLocaleString()}`;
      }
      const workTimeSinceLastLog = GetWorkTimeDiff(latestLogDate, now);
      if (workTimeSinceLastLog > 8 * 3600) {
        // More than 8 hours since last log
        return `No work logs since ${formatWorkTime(workTimeSinceLastLog)} work time`;
      }

      return false;
    }
  }

  // Rule: Too Many Subtasks
  class TooManySubtasksRule extends Rule {
    constructor() {
      super(
        "TooManySubtasks",
        "Task has too many subtasks",
        RuleCriticality.NOTE
      );
    }

    isViolated(issueData) {
      const subtasks = issueData.fields?.subtasks || [];

      if (subtasks.length > 10) {
        return `Task has ${subtasks.length} subtasks, which might be too many`;
      }
      return false;
    }
  }

  // Rule: Long Time in Progress
  class LongTimeInProgressRule extends Rule {
    constructor() {
      super(
        "LongTimeInProgress",
        "Task has been in progress for too long",
        RuleCriticality.NOTE
      );
    }

    isViolated(issueData) {
      const status = issueData.fields?.status?.statusCategory.key;
      if (status !== "indeterminate") {
        return false;
      }

      // For bugs and subtask - we will use 3 days as limit
      // For task - we will use 5 days as limit
      // For story - we will use 10 days as limit
      // For epic - skip it totally
      const issueType = issueData.fields?.issuetype?.name;
      if (issueType === "Epic") {
        return false;
      }
      let limit = 0;
      if (issueType === "Bug" || issueType === "Sub-task" || issueType === "Баг" || issueType === "Проблема" || issueType === "Підзадача") {
        limit = 3 * 8 * 3600; // 3 days
      }
      if (issueType === "Task" || issueType === "Завдання") {
        limit = 5 * 8 * 3600; // 5 days
      }
      if (issueType === "Story" || issueType === "Історія") {
        limit = 10 * 8 * 3600; // 10 days
      }
      if (limit <= 0) {
        return false;
      }

      const totalTimeInProgress = calcTotalTimeInProgress(issueData);
      if (totalTimeInProgress > limit) {
        return `Task has been in progress for ${formatWorkTime(totalTimeInProgress)}`;
      }

      return false;
    }
  }

  // Rule: No updates in 20 working days
  class NoUpdatesRule extends Rule {
    constructor() {
      super(
        "NoUpdates",
        "Task has not been updated for 20 working days",
        RuleCriticality.NOTE
      );
    }

    isViolated(issueData) {
      // Do check only for issue that not done and not in work
      const status = issueData.fields?.status?.statusCategory.key;
      if (status === "done" || status === "indeterminate") {
        return false;
      }

      const lastUpdated = new Date(issueData.fields?.updated);
      const now = new Date();
      const limit = 20 * 8 * 3600 * 1000; // 20 days in milliseconds
      if (now - lastUpdated > limit) {
        return `Task has not been updated since ${lastUpdated.toLocaleString()}`;
      }
      return false;
    }
  }

  // Setup helper with rules
  const highlightIssuesHelper = new HighlightIssuesHelper();
  highlightIssuesHelper.addRule(new OverdueRule());
  highlightIssuesHelper.addRule(new NoAssigneeRule());
  highlightIssuesHelper.addRule(new NoWorkLogsRule());
  highlightIssuesHelper.addRule(new TooManySubtasksRule());
  highlightIssuesHelper.addRule(new LongTimeInProgressRule());
  highlightIssuesHelper.addRule(new NoUpdatesRule());


  // --- Final Logic: Create and Launch Cleaners ---
  const helpers = [
    new CopyIssueKeyHelper(),
    new ShowIssueLinksHelper(),
    new ShowTimeInProgressByStateHistoryHelper(),
    highlightIssuesHelper
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
