// ==UserScript==
// @name         Jira Cleaner and Workflow Scanner
// @namespace    http://tampermonkey.net/
// @version      1.1.3
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
      this.debug = false;
      this.myBtn = null;
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
      return button;
    }

    // Метод, що додає чекбокс в рядок таблиці
    // Елементи в адмінці Jira часто представлені у вигляді таблиць
    // row - це має бути TR елемент таблиці
    static addCheckboxToTableRow(row, text, onClick) {
      // Знаходимо список із класом "operations-list"
      let cell = row.querySelector("ul.operations-list");
      if (!cell) {
        console.warn("Operations cell not found");
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
      return cell;
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
        console.warn("Operations cell not found");
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
      return link;
    }

    // Додавання UI для конкретної сутності
    addUI_perEntity(tr, id) {
      const self = this;
      const prevLink = tr.querySelector("li:has(>a.jira-cleaner-lock-link)");
      if (prevLink) {
        prevLink.remove();
      }
      const link = JiraCleanerEntity.addActionToTableRow(
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
      if (link) {
        link.className += " jira-cleaner-lock-link";
      }
    }

    onMyBtnClick() {
      if (this.isCleanRunning()) {
        this.abort();
      } else {
        this.clean();
      }

      // Temporary disabled to prevent double click
      if (this.myBtn) {
        this.myBtn.disabled = true;
        const self = this;
        setTimeout(() => (self.myBtn.disabled = false), 750);
      }

      // Update UI after click
      this.updateUI();
    }

    // Метод, що додає UI (наприклад, кнопку Clean та lock checkbox)
    addUI() {
      const self = this;
      // Додаємо кнопку Clean/Stop
      this.myBtn = JiraCleanerEntity.addButtonToPageHeader("Clean", () =>
        self.onMyBtnClick()
      );
      this.updateUI();
    }

    updateUI() {
      if (this.myBtn) {
        this.myBtn.innerText = this.isCleanRunning() ? "Stop Clean" : "Clean";
        this.myBtn.className = this.isCleanRunning()
          ? "aui-button aui-button-primary"
          : "aui-button";
      }

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
        if (tr.parentElement.tagName.toLowerCase() === "thead") return;
        // Беремо першу колонку рядка і текст з неї як ідентифікатор об'єкта
        const td = tr.querySelector(this.getIdSelectorForRow());
        const id = td ? td.innerText : "" + i;
        this.addUI_perEntity(tr, id);
      });
    }

    abort() {
      this.set("running", "false");
      console.log(`Aborted cleaning ${this.name}`);
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

      if (!this.clean_internal()) {
        this.abort();
      }
    }

    // Внутрішній метод очищення
    // Викликається як ітеративний метод, поки не скинути флаг running
    // Повертає false - якщо очищення завершено, в іншому випадку - true
    clean_internal() {
      if (!this.isCleanRunning()) return false;

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
      if (!rows || rows.length < 1) {
        console.warn("Items not found");
        this.abort();
        return false;
      }

      // Для кожного рядка таблиці перевіряємо чи він заблокований
      // Якщо так - пропускаємо
      // Якщо ні - викликаємо метод видалення
      // Але ми викликаємо видалення не більше ніж для 1 елемента за раз
      // Завжди пропускаємо перший рядок, так як це заголовок таблиці
      for (let i = 0; i < rows.length; i++) {
        const tr = rows[i];
        if (tr.parentElement.tagName.toLowerCase() === "thead") continue;
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

      this.abort();
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
        const self = this;
        let guard = 10;
        let tryClick;
        tryClick = () => {
          const btn = document.querySelector(self.getPopupSubmitSelector());
          if (btn) {
            if (self.debug) console.log("Approve delete");
            else btn.click();
            return;
          }
          if (guard-- <= 0) {
            console.error("Approve button not found");
            return;
          }
          setTimeout(tryClick, 250);
        };
        tryClick();
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

    isActive() {
      return (
        document.querySelector("#active-workflows-module") !== null ||
        document.querySelector("#inactive-workflows-module") !== null
      );
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
      return 'ul.operations-list li a[href*="Delete"]';
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
      return "ul.operations-list li a";
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

  // 8. Workflows duplicate scanner
  class WorkflowsDuplicateScanner extends JiraCleanerEntity {
    constructor() {
      super("Workflows Duplicates");
      this.selector = "#active-workflows-table";
      this.clean_internal_counter = 3;
    }

    isCleanRunning() {
      return false;
    }

    clean() {
      // Do nothing
    }

    abort() {
      // Do nothing
    }

    addUI() {
      const self = this;
      JiraCleanerEntity.addButtonToPageHeader("Scan", () => self.scan());
    }

    // Розбирає один action елемент
    parseAction(actionElem) {
      const action = {
        id: actionElem.getAttribute("id"),
        name: actionElem.getAttribute("name"),
        meta: {},
        validators: [],
        results: [],
      };

      // Розбираємо meta
      const metaElems = actionElem.getElementsByTagName("meta");
      for (let i = 0; i < metaElems.length; i++) {
        const metaName = metaElems[i].getAttribute("name");
        const metaValue = metaElems[i].textContent;
        action.meta[metaName] = metaValue;
      }

      // Розбираємо validators
      const validatorsElem = actionElem.getElementsByTagName("validators")[0];
      if (validatorsElem) {
        const validatorElems = validatorsElem.getElementsByTagName("validator");
        for (let i = 0; i < validatorElems.length; i++) {
          const validator = {
            type: validatorElems[i].getAttribute("type"),
            args: {},
          };
          const argElems = validatorElems[i].getElementsByTagName("arg");
          for (let j = 0; j < argElems.length; j++) {
            const argName = argElems[j].getAttribute("name");
            const argValue = argElems[j].textContent;
            validator.args[argName] = argValue;
          }
          action.validators.push(validator);
        }
      }

      // Розбираємо results
      const resultsElem = actionElem.getElementsByTagName("results")[0];
      if (resultsElem) {
        const resultElems = resultsElem.getElementsByTagName(
          "unconditional-result"
        );
        for (let i = 0; i < resultElems.length; i++) {
          const result = {
            oldStatus: resultElems[i].getAttribute("old-status"),
            step: resultElems[i].getAttribute("step"),
            status: resultElems[i].getAttribute("status"),
            postFunctions: [],
          };
          const postFuncsElems =
            resultElems[i].getElementsByTagName("post-functions");
          if (postFuncsElems) {
            for (let j = 0; j < postFuncsElems.length; j++) {
              const funcElems =
                postFuncsElems[j].getElementsByTagName("function");
              for (let k = 0; k < funcElems.length; k++) {
                const func = {
                  type: funcElems[k].getAttribute("type"),
                  args: {},
                };
                const argElems = funcElems[k].getElementsByTagName("arg");
                for (let m = 0; m < argElems.length; m++) {
                  const argName = argElems[m].getAttribute("name");
                  const argValue = argElems[m].textContent;
                  func.args[argName] = argValue;
                }
                result.postFunctions.push(func);
              }
            }
          }
          action.results.push(result);
        }
      }
      return action;
    }

    compareActions(action1, action2) {
      const sameMeta =
        JSON.stringify(action1.meta) === JSON.stringify(action2.meta);
      const sameValidators =
        JSON.stringify(action1.validators) ===
        JSON.stringify(action2.validators);
      const sameResults =
        JSON.stringify(action1.results) === JSON.stringify(action2.results);
      return {
        isSame:
          action1.id === action2.id &&
          action1.name === action2.name &&
          sameMeta &&
          sameValidators &&
          sameResults,
        isSameButDiffName: sameMeta && sameValidators && sameResults,
        sameMeta,
        sameValidators,
        sameResults,
      };
    }

    // Розбирає весь XML робочого процесу у структурований об’єкт
    parseWorkflow(xml) {
      const parsed = {};

      parsed.transitions = [];
      parsed.statuses = [];

      // Розбираємо initial-actions
      const initActionsElem = xml.getElementsByTagName("initial-actions")[0];
      parsed.initialActions = [];
      if (initActionsElem) {
        const actionElems = initActionsElem.getElementsByTagName("action");
        for (let i = 0; i < actionElems.length; i++) {
          const action = this.parseAction(actionElems[i]);
          parsed.initialActions.push(action);
          parsed.transitions.push(action.name);
        }
      }

      // Розбираємо common-actions
      const commonActionsElem = xml.getElementsByTagName("common-actions")[0];
      parsed.commonActions = [];
      if (commonActionsElem) {
        const actionElems = commonActionsElem.getElementsByTagName("action");
        for (let i = 0; i < actionElems.length; i++) {
          const action = this.parseAction(actionElems[i]);
          parsed.commonActions.push(action);
          parsed.transitions.push(action.name);
        }
      }

      // Розбираємо steps
      const stepsElem = xml.getElementsByTagName("steps")[0];
      parsed.steps = [];
      if (stepsElem) {
        const stepElems = stepsElem.getElementsByTagName("step");
        for (let i = 0; i < stepElems.length; i++) {
          const step = {
            id: stepElems[i].getAttribute("id"),
            name: stepElems[i].getAttribute("name"),
            actions: [],
          };
          parsed.statuses.push(step.name);

          const actionsElem = stepElems[i].getElementsByTagName("actions")[0];
          if (actionsElem) {
            // Можуть бути як <action>, так і <common-action>
            const actionElems = actionsElem.getElementsByTagName("action");
            for (let j = 0; j < actionElems.length; j++) {
              step.actions.push(this.parseAction(actionElems[j]));
            }
            const commonActionElems =
              actionsElem.getElementsByTagName("common-action");
            for (let j = 0; j < commonActionElems.length; j++) {
              // Для common-action - шукаємо їх по id в commonActions і додаємо
              const addCommonActionWithId =
                commonActionElems[j].getAttribute("id");
              for (let k = 0; k < parsed.commonActions.length; k++) {
                if (parsed.commonActions[k].id === addCommonActionWithId) {
                  step.actions.push(parsed.commonActions[k]);
                  break;
                }
              }
            }
          }

          for (let j = 0; j < step.actions.length; j++) {
            parsed.transitions.push(step.actions[j].name);
          }

          parsed.steps.push(step);
        }
      }

      // Тепер слід видалити дублікати серед transitions та statuses
      parsed.transitions = parsed.transitions.filter(
        (v, i, a) => a.indexOf(v) === i
      );
      parsed.statuses = parsed.statuses.filter((v, i, a) => a.indexOf(v) === i);

      return parsed;
    }

    // Функція для повного порівняння двох розібраних workflow
    fullCompareWorkflows(parsed1, parsed2) {
      // Порівнюємо для початку наявні статуси
      const bHasSameStatuses =
        JSON.stringify(parsed1.statuses) === JSON.stringify(parsed2.statuses);
      const uniuqeStatuses = parsed1.statuses
        .filter((x) => !parsed2.statuses.includes(x))
        .concat(parsed2.statuses.filter((x) => !parsed1.statuses.includes(x)));
      const bHasUniqueStatuses = uniuqeStatuses.length > 0;
      // Порівнюємо кожен action між собою та зберігаємо по назвах які однакові, а які різні
      const actionCompare = {};
      for (var k in parsed1.statuses) {
        if (!parsed1.statuses.hasOwnProperty(k)) continue;
        if (uniuqeStatuses.includes(k)) continue;
        // Find status in both steps and compare actions
        parsed1.steps.forEach((step1) => {
          if (step1.name !== k) return;
          parsed2.steps.forEach((step2) => {
            if (step2.name !== k) return;
            if (!actionCompare[k]) actionCompare[k] = {};
            step1.actions.forEach((action1) => {
              actionCompare[k][action1.id] = {
                isSame: false,
                isSameButDiffName: false,
                sameMeta: false,
                sameValidators: false,
                sameResults: false,
              };
              step2.actions.forEach((action2) => {
                if (action1.id === action2.id) {
                  const comp = this.compareActions(action1, action2);
                  actionCompare[k][action1.id] = comp;
                }
              });
            });
            // Тепер дивимося чи є якісь додаткові елементи в step2
            step2.actions.forEach((action2) => {
              if (!actionCompare[k][action2.id]) {
                actionCompare[k][action2.id] = {
                  isSame: false,
                  isSameButDiffName: false,
                  sameMeta: false,
                  sameValidators: false,
                  sameResults: false,
                };
              }
            });
          });
        });
      }
      const bHasDiffActions = Object.keys(actionCompare).some((k) => {
        return Object.keys(actionCompare[k]).some((id) => {
          return !actionCompare[k][id].isSame;
        });
      });
      const bHasDiffActionsIgnoreName = Object.keys(actionCompare).some((k) => {
        return Object.keys(actionCompare[k]).some((id) => {
          return actionCompare[k][id].isSameButDiffName;
        });
      });

      // Порівнюємо кожну секцію окремо (initialActions, commonActions, steps)
      const sameInitial =
        JSON.stringify(parsed1.initialActions) ===
        JSON.stringify(parsed2.initialActions);
      const sameCommon =
        JSON.stringify(parsed1.commonActions) ===
        JSON.stringify(parsed2.commonActions);
      const sameSteps =
        JSON.stringify(parsed1.steps) === JSON.stringify(parsed2.steps);

      const isSame = sameInitial && sameCommon && sameSteps;
      const isSameButDiffActionsOrder = !bHasUniqueStatuses && !bHasDiffActions;
      const isSameButDiffActionsOrderIgnoreName =
        !bHasUniqueStatuses && !bHasDiffActionsIgnoreName;

      // Тепер ми хочемо ще порівняти статуси між собою, але ігноруючи пробіли, регістр та будь-які символи які не є буквами
      const statusCompare = {};
      parsed1.statuses.forEach((status1) => {
        statusCompare[status1] = false;
        parsed2.statuses.forEach((status2) => {
          const same =
            status1.replace(/\W/g, "").toLowerCase() ===
            status2.replace(/\W/g, "").toLowerCase();
          if (same) statusCompare[status1] = true;
        });
      });
      const bHasSameStatusesIgnoreSymbols =
        parsed1.statuses.length == parsed2.statuses.length &&
        Object.keys(statusCompare).every((k) => {
          return statusCompare[k];
        });
      const isMaybeSame = bHasSameStatusesIgnoreSymbols;

      return {
        isSame,
        bHasUniqueStatuses,
        bHasSameStatuses,
        isMaybeSame,
        sameInitial,
        sameCommon,
        sameSteps,
        isSameButDiffActionsOrder,
        isSameButDiffActionsOrderIgnoreName,
        bHasDiffActions,
        bHasDiffActionsIgnoreName,
      };
    }

    // Метод сканування: завантажує XML для кожного workflow, розбирає його,
    // проводить повне порівняння між парами та зберігає результати в this.workflowsData
    scan() {
      const names = [];
      const rows = document.querySelectorAll(this.getRowsSelector());
      for (let i = 1; i < rows.length; i++) {
        const tr = rows[i];
        const td = tr.querySelector(this.getIdSelectorForRow());
        if (td) {
          const name = td.innerText.trim();
          if (name) names.push(name);
        }
      }

      if (names.length === 0) {
        console.warn("No workflows found for scanning.");
        return;
      }
      console.log("Workflow names:", names);

      // Скидаємо попередні дані
      this.workflowsData = {};

      // Завантажуємо XML для кожного workflow та розбираємо його
      const loadPromises = names.map((name) => {
        const key = encodeURI(name.replaceAll(" ", "+")).replaceAll(":", "%3A");
        // get host from current page
        const host = window.location.host;
        // get protocol from current page
        const protocol = window.location.protocol;
        const uri = `${protocol}//${host}/secure/admin/workflows/ViewWorkflowXml.jspa?workflowMode=live&workflowName=${key}`;
        return fetch(uri)
          .then((response) => response.text())
          .then((str) => {
            const xmlDoc = new DOMParser().parseFromString(str, "text/xml");
            const parsed = this.parseWorkflow(xmlDoc);
            this.workflowsData[name] = {
              doc: xmlDoc,
              parsed: parsed,
              compare: {},
              sameAs: [],
              maybeSameAs: [],
            };
          })
          .catch((err) => {
            console.error("Error loading workflow:", name, err);
          });
      });

      Promise.all(loadPromises).then(() => {
        // Порівнюємо кожну пару workflow
        for (let i = 0; i < names.length; i++) {
          for (let j = i + 1; j < names.length; j++) {
            const comp = this.fullCompareWorkflows(
              this.workflowsData[names[i]].parsed,
              this.workflowsData[names[j]].parsed
            );
            this.workflowsData[names[i]].compare[names[j]] = comp;
            if (comp.isSame) {
              this.workflowsData[names[i]].sameAs.push(names[j]);
              if (!this.workflowsData[names[j]].sameAs.includes(names[i])) {
                this.workflowsData[names[j]].sameAs.push(names[i]);
              }
            }
            if (comp.isMaybeSame) {
              this.workflowsData[names[i]].maybeSameAs.push(names[j]);
              if (
                !this.workflowsData[names[j]].maybeSameAs.includes(names[i])
              ) {
                this.workflowsData[names[j]].maybeSameAs.push(names[i]);
              }
            }
          }
        }
        console.log("Workflow comparison result:", this.workflowsData);
        this.displayResults();
      });
    }

    // Вивід результатів сканування на сторінку
    displayResults() {
      // Пройдемося по всіх елементах в табличці та допишемо в перший стопвчик додаткову інформацію
      // Додаткова інформація:
      // - перелік станів в цьому workflow
      // - перелік workflow, які є повністю однакові з цим
      // - переклік workflow, які можливо є схожими з цим
      // В переліках workflow будемо виводити посилання на них.
      // Посилання береться з 'ul.operations-list a[data-operation="view"]'

      // Спочатку пройдемося по всіх рядках та зберемо собі структуру даних з елементами, посиланнями та назвами
      // а також видалимо поточну інформацію, якщо вона вже є
      const rows = document.querySelectorAll(this.getRowsSelector());
      const infoRows = [];
      for (let i = 1; i < rows.length; i++) {
        const tr = rows[i];
        const td = tr.querySelector(this.getIdSelectorForRow());
        if (!td) continue;
        const name = td.innerText.trim();
        if (!name) continue;
        const data = this.workflowsData[name];
        if (!data) continue;
        const link = tr.querySelector(
          'ul.operations-list a[data-operation="view"]'
        );
        if (!link) continue;
        const secondaryText = tr.querySelector(
          "td:first-child div.secondary-text"
        );
        if (!secondaryText) continue;
        infoRows.push({ tr, name, data, link, secondaryText });
        // Видаляємо попередню інформацію
        const oldInfo = secondaryText.querySelector(
          ".jira-cleaner-workflow-info"
        );
        if (oldInfo) oldInfo.remove();
      }

      const rotateColorLables = [
        "",
        "aui-lozenge-subtle",
        "aui-lozenge-success",
        "aui-lozenge-error",
        "aui-lozenge-complete",
        "aui-lozenge-current",
        "aui-lozenge-moved",
      ];
      let colorIndex = 0;
      const getColorIdxForStatus = (status) => {
        if (status.toLowerCase().includes("done")) return 2;
        if (status.toLowerCase().includes("close")) return 2;
        if (status.toLowerCase().includes("finish")) return 2;
        if (status.toLowerCase().includes("success")) return 2;
        if (status.toLowerCase().includes("fixed")) return 2;

        if (status.toLowerCase().includes("create")) return 1;
        if (status.toLowerCase().includes("backlog")) return 1;
        if (status.toLowerCase().includes("new")) return 1;

        if (status.toLowerCase().includes("progress")) return 5;
        if (status.toLowerCase().includes("approov")) return 5;
        if (status.toLowerCase().includes("review")) return 5;
        if (status.toLowerCase().includes("testing")) return 5;

        if (status.toLowerCase().includes("in ")) return 6;
        if (status.toLowerCase().includes("reopened")) return 6;
        if (status.toLowerCase().includes("on ")) return 6;
        if (status.toLowerCase().includes("need")) return 6;

        if (status.toLowerCase().includes("rejected")) return 3;
        if (status.toLowerCase().includes("failed")) return 3;
        if (status.toLowerCase().includes("error")) return 3;
        if (status.toLowerCase().includes("rework")) return 3;

        if (status.toLowerCase().includes("blocked")) return 4;
        if (status.toLowerCase().includes("payment")) return 4;
        if (status.toLowerCase().includes("commited")) return 4;
        if (status.toLowerCase().includes("resolve")) return 4;

        //return (colorIndex + 1) % rotateColorLables.length;
        return 0;
      };
      const getColor = (status) => {
        const idx = getColorIdxForStatus(status);
        colorIndex = idx;
        return rotateColorLables[idx];
      };

      // Тепер пройдемося по всіх рядках та додамо інформацію
      // А так як ми вже все зібрали - то зможемо одразу додавати іншні workflow як посилання
      for (let i = 0; i < infoRows.length; i++) {
        const { tr, name, data, link, secondaryText } = infoRows[i];
        const infoElem = document.createElement("div");
        infoElem.className = "jira-cleaner-workflow-info";

        const statusesElem = document.createElement("div");
        statusesElem.className = "statuses";
        statusesElem.innerHTML = `<strong>Statuses</strong>: `;
        data.parsed.statuses.forEach((s) => {
          const span = document.createElement("span");
          span.className = "aui-lozenge " + getColor(s);
          span.innerText = s;
          statusesElem.appendChild(span);
        });
        infoElem.appendChild(statusesElem);

        // Також виводимо всі transitions в статусі
        const transitionsElem = document.createElement("div");
        transitionsElem.className = "transitions";
        transitionsElem.innerHTML = `<strong>Transitions</strong>: `;
        data.parsed.transitions.forEach((t) => {
          const span = document.createElement("span");
          span.className = "aui-lozenge aui-lozenge-subtle";
          span.innerText = t;
          transitionsElem.appendChild(span);
        });
        infoElem.appendChild(transitionsElem);

        if (data.sameAs.length > 0) {
          const sameAsElem = document.createElement("div");
          sameAsElem.className = "same-as";
          sameAsElem.innerHTML = "<strong>Same as:</strong> ";
          const list = document.createElement("ul");
          data.sameAs.forEach((n) => {
            const a = document.createElement("a");
            // Шукаємо в infoRows по імені та беремо посилання з link
            const link = infoRows.find((r) => r.name === n).link;
            a.href = link.href;
            a.innerText = n;
            const li = document.createElement("li");
            li.appendChild(a);
            list.appendChild(li);
          });
          sameAsElem.appendChild(list);
          infoElem.appendChild(sameAsElem);
        }

        if (data.maybeSameAs.length > 0) {
          const sameAsElem = document.createElement("div");
          sameAsElem.className = "same-as";
          sameAsElem.innerHTML = "<strong>Maybe same as:</strong> ";
          const list = document.createElement("ul");
          data.maybeSameAs.forEach((n) => {
            // Пропускаємо ті, які точно однакові
            if (data.sameAs.includes(n)) return;
            const a = document.createElement("a");
            // Шукаємо в infoRows по імені та беремо посилання з link
            const link = infoRows.find((r) => r.name === n).link;
            a.href = link.href;
            a.innerText = n;
            const li = document.createElement("li");
            li.appendChild(a);
            list.appendChild(li);
          });
          // Якщо список пустий - то не виводимо
          if (list.children.length === 0) continue;
          sameAsElem.appendChild(list);
          infoElem.appendChild(sameAsElem);
        }

        secondaryText.appendChild(infoElem);
      }
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
    new WorkflowsDuplicateScanner(),
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
