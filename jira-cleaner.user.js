// ==UserScript==
// @name         Jira Cleaner and Workflow Scanner
// @namespace    http://tampermonkey.net/
// @version      2025-03-21
// @description  Automated cleaning and scanning for Jira pages with UI controls.
// @author       Oleksandr Berezovskyi
// @match        https://jira.*.com/secure/admin/workflows/ListWorkflows.jspa
// @match        https://jira.*.com/secure/admin/ViewWorkflowSchemes.jspa
// @match        https://jira.*.com/secure/admin/ViewFieldScreens.jspa
// @match        https://jira.*.com/secure/admin/ViewDeleteFieldScreen.jspa?*
// @match        https://jira.*.com/secure/admin/ViewStatuses.jspa
// @match        https://jira.*.com/secure/admin/ManageIssueTypeSchemes*.jspa
// @match        https://jira.*.com/secure/admin/ManageIssueTypeSchemes*.jspa
// @match        https://jira.*.com/secure/admin/DeleteOptionScheme*.jspa?*
// @match        https://jira.*.com/secure/admin/ViewIssueTypeScreenSchemes.jspa
// @match        https://jira.*.com/secure/admin/ViewDeleteIssueTypeScreenScheme.jspa?*
// @match        https://jira.*.com/secure/admin/ViewFieldScreenSchemes.jspa
// @match        https://jira.*.com/secure/admin/ViewDeleteFieldScreenScheme.jspa?*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let checkWorkflowsAndRemove;
    checkWorkflowsAndRemove = () => {
        const elems = document.querySelectorAll('#inactive-workflows-table a[data-operation="delete"]');
        if (elems.length > 0)
        {
            elems[0].click();
            let f = () => { let bb = document.getElementById('delete-workflow-submit'); if (bb) { bb.click(); return true; } return false; };
            let timerFn;
            timerFn = () => { if (!f()) { setTimeout(timerFn, 250); } };
            timerFn();
        }
    };

    let checkWorkflowSchemasAndRemove;
    checkWorkflowSchemasAndRemove = () => {
        const elems = document.querySelectorAll('#WorkflowSchemes table.list-workflow-table td.workflow-scheme-operations ul.operations-list li:last-child a[href*="Delete"]');
        if (elems.length > 0)
        {
            elems[0].click();
            let f = () => { let bb = document.getElementById('delete-workflow-scheme-submit'); if (bb) { bb.click(); return true; } return false; };
            let timerFn;
            timerFn = () => { if (!f()) { setTimeout(timerFn, 250); } };
            timerFn();
        }
    };

    let checkScreensAndRemove;
    checkScreensAndRemove = () => {
        const elems = document.querySelectorAll('#field-screens-table a.delete-fieldscreen');
        if (elems.length > 0)
        {
            elems[0].click();
            return true;
        }
        // check next pages
        const nextPage = document.querySelector('#field-screens-table-container nav button[aria-label="next"]');
        if (!nextPage)
        {
            return false;
        }
        if (nextPage.disabled)
        {
            return true;
        }
        nextPage.click();
        return false;
    };

    let checkScreenSchemasAndRemove;
    checkScreenSchemasAndRemove = () => {
        const elems = document.querySelectorAll('#field-screen-schemes-table a[href*="ViewDeleteFieldScreenScheme.jspa?id="]');
        if (elems.length > 0)
        {
            elems[0].click();
            return true;
        }

        return false;
    };

    let CheckAndRemoveStatus;
    CheckAndRemoveStatus = () => {
        const elems = document.querySelectorAll('a.trigger-dialog[href*="DeleteStatus!default.jspa?id="]');
        if (elems.length > 0)
        {
            elems[0].click();
            let f = () => { let bb = document.getElementById('delete_submit'); if (bb) { bb.click(); return true; } return false; };
            let timerFn;
            timerFn = () => { if (!f()) { setTimeout(timerFn, 250); } };
            timerFn();
            return true;
        }

        return false;
    };

    let checkTypeSchemasAndRemove;
    checkTypeSchemasAndRemove = () => {
        const elems = document.querySelectorAll('#issuetypeschemes tr');
        for (var i = 0; i < elems.length; i++)
        {
            let checkSpan = elems[i].querySelector('td>span.errorText');
            if (!checkSpan || checkSpan.innerText !== "No projects") continue;
            let deleteLink = elems[i].querySelector('td ul.operations-list li:last-child a');
            if (deleteLink && deleteLink.innerText === "Delete")
            {
                deleteLink.click();
                return true;
            }
        }

        return false;
    };

    let checkTypeScreenSchemasAndRemove;
    checkTypeScreenSchemasAndRemove = () => {
        const elems = document.querySelectorAll('#issue-type-screen-schemes-table a[data-operation="delete"]');
        if (elems.length > 0)
        {
            elems[0].click();
            return true;
        }

        return false;
    };

    // Cleanup workflows
    if (document.getElementById('inactive-workflows-table'))
    {
        checkWorkflowsAndRemove();
        return;
    }

    // Cleanup workflow schemas
    if (document.getElementById('WorkflowSchemes'))
    {
        checkWorkflowSchemasAndRemove();
        return;
    }

    // Cleanup screens
    if (document.getElementById('field-screens-table-container'))
    {
        let timerFn;
        timerFn = () => { if (!checkScreensAndRemove()) { setTimeout(timerFn, 1000); } };
        timerFn();
        return;
    }
    if (document.querySelector('form[action="DeleteFieldScreen.jspa"]'))
    {
        const delBtn = document.getElementById('delete_submit');
        if (delBtn)
        {
            delBtn.click();
        }
        return;
    }

    // Cleanup screen schemas
    if (document.getElementById('field-screen-schemes-table'))
    {
        checkScreenSchemasAndRemove();
        return;
    }
    if (document.querySelector('form[action="DeleteFieldScreenScheme.jspa"]'))
    {
        const delBtn = document.getElementById('delete_submit');
        if (delBtn)
        {
            delBtn.click();
        }
        return;
    }

    // Cleanup statuses
    if (document.querySelector('.aui-page-header-main h2') && document.querySelector('.aui-page-header-main h2').innerText == "Statuses")
    {
        CheckAndRemoveStatus();
        return;
    }

    // Cleanup type schemas
    if (document.getElementById('issuetypeschemes'))
    {
        checkTypeSchemasAndRemove();
        return;
    }
    if (document.querySelector('form[action="DeleteOptionScheme.jspa"]'))
    {
        const delBtn = document.getElementById('delete_submit');
        if (delBtn)
        {
            delBtn.click();
        }
        return;
    }

    // Cleanup type screen schemas
    if (document.getElementById('issue-type-screen-schemes-table'))
    {
        checkTypeScreenSchemasAndRemove();
        return;
    }
    if (document.querySelector('form[action="DeleteIssueTypeScreenScheme.jspa"]'))
    {
        const delBtn = document.getElementById('delete_submit');
        if (delBtn)
        {
            delBtn.click();
        }
        return;
    }

})();
