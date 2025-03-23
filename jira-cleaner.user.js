// ==UserScript==
// @name         Jira Cleaner and Workflow Scanner
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  Automated cleaning and scanning for Jira pages with UI controls.
// @author       Oleksandr Berezovskyi
// @downloadURL  https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-cleaner.user.js
// @updateURL    https://github.com/OlexandrI/JiraCleaner/raw/refs/heads/main/jira-cleaner.user.js
// @include      /^https?:\/\/([^\.\/]+\.)*jira.[^\/]+\/secure\/admin\//
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Ми будемо зберігати налаштування та пропорці про запуск очищення в localStorage
  // Також зберігатимемо заблоковані елементи, щоб не очищати їх
  class StorageController {
    constructor(prefix = "jira_cleaner_") {
      this.prefix = prefix || "jira_cleaner_";
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

  // --- Base Class for a Jira Cleaner Entity ---

  // Клас, який описує собою роботу з однією із сутностей в Jira
  class JiraCleanerEntity {
    constructor(name) {
      this.name = name;
      this.storagePrefix = StorageController.fixKey(name) + "_";
      this.selector = "";
      this.clean_internal_counter = 10;
      this.removeAction = "Delete.jsp";
      this.debug = true;
    }

    set(key, value) {
      storage.set(this.storagePrefix + key, value);
    }

    get(key, defaultValue = null) {
      return storage.get(this.storagePrefix + key, defaultValue);
    }

    has(key) {
      return storage.has(this.storagePrefix + key);
    }

    getRowsSelector() {
      return this.selector + " tr";
    }

    getIdSelectorForRow() {
      return "td:first-child strong";
    }

    getDeleteActionSelectorForRow() {
      return 'ul.operations-list a[data-operation="delete"]';
    }

    canRowBeDeleted(tr, id) {
      // Перевіряємо чи не заблокований елемент
      if (this.isItemLocked(id)) return false;
      // Перевіряємо чи має елемент кнопку видалення
      return tr.querySelector(this.getDeleteActionSelectorForRow()) !== null;
    }

    hasApprovePopup() {
      return false;
    }

    hasApprovePage() {
      return false;
    }

    hasPages() {
      return false;
    }

    hasDynamicData() {
      return this.hasPages() || false;
    }

    getPopupSubmitSelector() {
      return "#delete_submit";
    }

    getApprovePageSelector() {
      return "#delete_submit";
    }

    getNextPageSelector() {
      return 'nav button[aria-label="next"]';
    }

    // Метод для перевірки, чи відкрито потрібну сторінку
    // За замовчуванням перевіряє чи є вказаний селектор на сторінці
    // Але можна перевизначити цей метод для більш складних перевірок
    isActive() {
      // Повинно повернути true/false залежно від специфічних елементів DOM
      return document.querySelector(this.selector) !== null;
    }

    isApproveDeleteActive() {
      return (
        document.querySelector(`form[action="${this.removeAction}"]`) !==
          null && document.querySelector(this.getApprovePageSelector()) !== null
      );
    }

    isItemLocked(id) {
      return this.get(`item_${id}_locked`, "false") === "true";
    }

    setItemLocked(id, isLocked = true) {
      this.set(`item_${id}_locked`, isLocked ? "true" : "false");
    }

    isCleanRunning() {
      return this.get("running", "false") === "true";
    }

    // Метод, що додає кнопку в заголовок сторінки
    // Приклад: JiraCleanerEntity.addButtonToPageHeader("Clean", () => this.clean());
    static addButtonToPageHeader(text, onClick, additionalClass = "") {
      const header = document.querySelector(
        "header.aui-page-header div.aui-page-header-actions div.aui-buttons"
      );
      if (!header) {
        console.error("Page Header not found");
        return false;
      }
      const button = document.createElement("button");
      button.className = "aui-button " + additionalClass;
      button.innerText = text;
      button.addEventListener("click", onClick);
      header.appendChild(button);
      return true;
    }

    // Метод, що додає чекбокс в рядок таблиці
    // Елементи в адмінці Jira часто представлені у вигляді таблиць
    // row - це має бути TR елемент таблиці
    static addCheckboxToTableRow(row, text, onClick) {
      // Знаходимо список із класом "operations-list"
      let cell = row.querySelector("ul.operations-list");
      if (!cell) {
        console.error("Operations cell not found");
        return false;
      }
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", onClick);
      const label = document.createElement("label");
      label.innerText = text;
      label.style.marginLeft = "5px";
      if (cell.tagName === "UL") {
        const li = document.createElement("li");
        cell.appendChild(li);
        cell = li;
      }
      cell.appendChild(checkbox);
      cell.appendChild(label);
      return true;
    }

    // Метод, що додає посилання з дією в рядок таблиці
    // Елементи в адмінці Jira часто представлені у вигляді таблиць
    // row - це має бути TR елемент таблиці
    // Якщо вказати isOn метод - то ця дія буде мати два стани і перевірятися через цей метод
    // В такому випадку в залежності від стану буде вибиратися текст та колір
    // Якщо колір не вказаний (пустий рядок) - то використовується колір за замовчуванням (тобто він не буде застосовуватися)
    static addActionToTableRow(
      row,
      textOn,
      onClick,
      textOff = "",
      colorOn = "",
      colorOff = "",
      isOn = null
    ) {
      // Знаходимо список із класом "operations-list"
      let cell = row.querySelector("ul.operations-list");
      if (!cell) {
        console.error("Operations cell not found");
        return false;
      }

      const bHasTwoStates = textOff !== "" && isOn !== null;
      const currentState = !!isOn();
      const text = bHasTwoStates ? (currentState ? textOn : textOff) : textOn;
      const color = bHasTwoStates
        ? currentState
          ? colorOn
          : colorOff
        : colorOn;

      const link = document.createElement("a");
      // Wrap click function to check state after and update visual
      const onClickWrapper = () => {
        onClick();
        if (bHasTwoStates) {
          const newState = !!isOn();
          link.innerText = newState ? textOn : textOff;
          const color = newState ? colorOn : colorOff;
          if (color) link.style.color = color;
        }
      };

      link.href = "#";
      link.innerText = text;
      if (color) link.style.color = color;
      link.addEventListener("click", onClickWrapper);
      const li = document.createElement("li");
      li.appendChild(link);
      cell.appendChild(li);
      return true;
    }

    // Додавання UI для конкретної сутності
    addUI_perEntity(tr, id) {
      const self = this;
      JiraCleanerEntity.addActionToTableRow(
        tr,
        "Unlock",
        () => {
          self.setItemLocked(id, !self.isItemLocked(id));
        },
        "Lock",
        "red",
        "green",
        () => {
          return self.isItemLocked(id);
        }
      );
    }

    // Метод, що додає UI (наприклад, кнопку Clean та lock checkbox)
    addUI() {
      const self = this;
      // Додаємо кнопку Clean/Stop
      if (this.isCleanRunning()) {
        JiraCleanerEntity.addButtonToPageHeader(
          "Stop Clean",
          () => {
            self.abort();
          },
          "aui-button-primary"
        );
      } else {
        JiraCleanerEntity.addButtonToPageHeader("Clean", () => self.clean());
      }

      this.updateUI();
    }

    updateUI() {
      if (this.hasDynamicData()) {
        if (document.querySelectorAll(this.getRowsSelector()).length < 2) {
          const self = this;
          setTimeout(() => self.updateUI(), 500);
          return;
        }
      }

      // Беремо всі рядки таблиці
      const rows = document.querySelectorAll(this.getRowsSelector());
      if (!rows) {
        console.warn("Items not found");
        return;
      }

      // Для кожного рядка таблиці додаємо UI
      rows.forEach((tr, i) => {
        // Пропускаємо перший рядок, так як це заголовок таблиці
        if (i === 0) return;
        // Беремо першу колонку рядка і текст з неї як ідентифікатор об'єкта
        const td = tr.querySelector(this.getIdSelectorForRow());
        const id = td ? td.innerText : "" + i;
        this.addUI_perEntity(tr, id);
      });
    }

    // Метод очищення, який запускається при натисканні Clean
    clean() {
      if (this.isCleanRunning()) {
        this.clean_internal();
        return;
      }

      // Запис у localStorage що почато очищення
      this.set("running", "true");
      console.log(`Cleaning ${this.name}...`);

      this.clean_internal();
    }

    abort() {
      this.set("running", "false");
      console.log(`Aborted cleaning ${this.name}`);
    }

    // Внутрішній метод очищення
    // Викликається як ітеративний метод, поки не скинути флаг running
    // Повертає false - якщо очищення завершено, в іншому випадку - true
    clean_internal() {
      if (!this.isCleanRunning()) return;

      if (this.hasApprovePage() && this.isApproveDeleteActive()) {
        if (this.debug) console.log("Approve delete");
        else document.querySelector(this.getApprovePageSelector()).click();
        return true;
      }

      // Перевіряємо чи взагалі вже доступні елементи, так як деякі сторінки динамічно завантажуються
      // Якщо елементів ще немає - то ставимо через 500мс перевірити знову і так до 10 разів,
      // після чого будемо вважати що елементів немає взагалі і на цьому все
      if (document.querySelectorAll(this.getRowsSelector()) < 2) {
        if (this.clean_internal_counter > 0) {
          this.clean_internal_counter--;
          const self = this;
          setTimeout(() => self.clean_internal(), 500);
          return true;
        }
      }

      // Беремо всі рядки таблиці
      const rows = document.querySelectorAll(this.getRowsSelector());
      if (!rows) {
        console.warn("Items not found");
        this.set("running", "false");
        return false;
      }

      // Для кожного рядка таблиці перевіряємо чи він заблокований
      // Якщо так - пропускаємо
      // Якщо ні - викликаємо метод видалення
      // Але ми викликаємо видалення не більше ніж для 1 елемента за раз
      // Завжди пропускаємо перший рядок, так як це заголовок таблиці
      for (let i = 1; i < rows.length; i++) {
        const tr = rows[i];
        const td = tr.querySelector(this.getIdSelectorForRow());
        const id = td ? td.innerText : "" + i;
        if (!this.canRowBeDeleted(tr, id)) continue;
        const action = tr.querySelector(this.getDeleteActionSelectorForRow());
        this.clean_internal_row(action, tr, id);
        return true;
      }

      // Якщо неммає елементів для видалення, але є сторінки - переходимо на наступну сторінку
      if (this.hasPages()) {
        const nextPage = document.querySelector(this.getNextPageSelector());
        if (nextPage) {
          nextPage.click();
          if (!nextPage.disabled) {
            const self = this;
            setTimeout(() => self.clean_internal(), 1000);
            return true;
          }
        }
      }

      this.set("running", "false");
      return false;
    }

    // Внутрішній метод очищення одного рядка
    // Викликається для кожного рядка, якщо він не заблокований
    // Слід визначити цей метод в класі-нащадку
    clean_internal_row(action, tr, id) {
      console.log("Delete item:", tr, id);
      // Клікаємо на дію видалення
      if (action) action.click();
      // Якщо є підтвердження - клікаємо на підтвердження
      if (this.hasApprovePopup()) {
        function tryClick() {
          const btn = document.getElementById(this.getPopupSubmitSelector());
          if (btn) {
            if (this.debug) console.log("Approve delete");
            else btn.click();
            return true;
          }
          return false;
        }
        (function timerFn() {
          if (!tryClick()) {
            setTimeout(timerFn, 250);
          }
        })();
      }
    }
  }

  // ---------------- Subclasses for Specific Pages ----------------

  // 1. Inactive Workflows Cleaner
  class InactiveWorkflowsCleaner extends JiraCleanerEntity {
    constructor() {
      super("Inactive Workflows");
      this.selector = "#inactive-workflows-table";
      this.clean_internal_counter = 3;
    }

    hasApprovePopup() {
      return true;
    }

    getPopupSubmitSelector() {
      return "#delete-workflow-submit";
    }
  }

  // 2. Workflow Schemes Cleaner
  class WorkflowSchemesCleaner extends JiraCleanerEntity {
    constructor() {
      super("Workflow Schemes");
      this.selector = "#WorkflowSchemes table.list-workflow-table";
      this.clean_internal_counter = 3;
    }
    getDeleteActionSelectorForRow() {
      return 'ul.operations-list li:last-child a[href*="Delete"]';
    }

    hasApprovePopup() {
      return true;
    }

    getPopupSubmitSelector() {
      return "#delete-workflow-scheme-submit";
    }
  }

  // 3. Screens Cleaner
  class ScreensCleaner extends JiraCleanerEntity {
    constructor() {
      super("Screens");
      this.selector = "#field-screens-table-container";
      this.removeAction = "DeleteFieldScreen.jspa";
    }

    getRowsSelector() {
      return "#field-screens-table tr";
    }

    getDeleteActionSelectorForRow() {
      return "a.delete-fieldscreen";
    }

    hasApprovePage() {
      return true;
    }

    hasPages() {
      return true;
    }

    getNextPageSelector() {
      return '#field-screens-table-container nav button[aria-label="next"]';
    }
  }

  // 4. Screen Schemes Cleaner
  class ScreenSchemesCleaner extends JiraCleanerEntity {
    constructor() {
      super("Screen Schemes");
      this.selector = "#field-screen-schemes-table";
      this.removeAction = "DeleteFieldScreenScheme.jspa";
      this.clean_internal_counter = 3;
    }

    getDeleteActionSelectorForRow() {
      return 'a[href*="ViewDeleteFieldScreenScheme.jspa?id="]';
    }

    hasApprovePage() {
      return true;
    }
  }

  // 5. Statuses Cleaner
  class StatusesCleaner extends JiraCleanerEntity {
    constructor() {
      super("Statuses");
      this.selector = "";
      this.removeAction = "DeleteStatus!default.jspa";
      this.clean_internal_counter = 3;
    }

    hasApprovePopup() {
      return true;
    }

    getPopupSubmitSelector() {
      return "#delete_submit";
    }

    getDeleteActionSelectorForRow() {
      return 'a.trigger-dialog[href*="DeleteStatus!default.jspa?id="]';
    }

    isActive() {
      return (
        document.querySelector(".aui-page-header-main h2") &&
        document.querySelector(".aui-page-header-main h2").innerText ==
          "Statuses"
      );
    }
  }

  // 6. Issue Type Schemes Cleaner
  class IssueTypeSchemesCleaner extends JiraCleanerEntity {
    constructor() {
      super("Issue Type Schemes");
      this.selector = "#issuetypeschemes";
      this.removeAction = "DeleteOptionScheme.jspa";
      this.clean_internal_counter = 3;
    }

    getDeleteActionSelectorForRow() {
      return "ul.operations-list li:last-child a";
    }

    hasApprovePage() {
      return true;
    }

    canRowBeDeleted(tr, id) {
      if (!super.canRowBeDeleted(tr, id)) return false;
      const checkSpan = tr.querySelector("td>span.errorText");
      if (!checkSpan || checkSpan.innerText !== "No projects") return false;
      const deleteLink = tr.querySelector(this.getDeleteActionSelectorForRow());
      if (deleteLink && deleteLink.innerText === "Delete") return true;
      return false;
    }
  }

  // 7. Issue Type Screen Schemes Cleaner
  class IssueTypeScreenSchemesCleaner extends JiraCleanerEntity {
    constructor() {
      super("Issue Type Screen Schemes");
      this.selector = "#issue-type-screen-schemes-table";
      this.removeAction = "DeleteIssueTypeScreenScheme.jspa";
      this.clean_internal_counter = 3;
    }

    getDeleteActionSelectorForRow() {
      return 'ul.operations-list a[data-operation="delete"]';
    }

    hasApprovePage() {
      return true;
    }
  }

  // --- Final Logic: Create and Launch Cleaners ---
  const cleaners = [
    new InactiveWorkflowsCleaner(),
    new WorkflowSchemesCleaner(),
    new ScreensCleaner(),
    new ScreenSchemesCleaner(),
    new StatusesCleaner(),
    new IssueTypeSchemesCleaner(),
    new IssueTypeScreenSchemesCleaner(),
  ];
  // On page load, check which cleaner is active and add its UI.
  function bootstrap() {
    cleaners.forEach((cleaner) => {
      if (
        cleaner.isActive() ||
        (cleaner.hasApprovePage() && cleaner.isApproveDeleteActive())
      ) {
        console.log(`Active page detected: ${cleaner.name}`);
        cleaner.addUI();
        if (cleaner.isCleanRunning()) {
          cleaner.clean();
        }
      }

      // If any cleaner is running, we should add notify and stop button to main header
      if (cleaner.isCleanRunning()) {
        AddMainMenuButton("Stop: " + cleaner.name, () => {
          cleaner.abort();
        });
      }
    });
  }

  if (document.readyState == "complete") {
    bootstrap();
  } else {
    window.addEventListener("load", bootstrap);
  }
})();
