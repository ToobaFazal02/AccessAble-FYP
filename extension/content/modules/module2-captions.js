"use strict";

(() => {
  const sharedContracts = globalThis.AccessAbleContracts || {};
  const ACTIONS = sharedContracts.ACTIONS || {};
  const module2 = globalThis.AccessAbleModule2 || null;

  function enableHighlights() {
    const status = module2?.enable?.() || { enabled: false };
    return {
      ...status,
      highlighted: Boolean(status.enabled),
    };
  }

  function disableHighlights() {
    const status = module2?.disable?.() || { enabled: false };
    return {
      ...status,
      highlighted: Boolean(status.enabled),
    };
  }

  function getStatus() {
    const status = module2?.getStatus?.() || { enabled: false };
    return {
      ...status,
      highlighted: Boolean(status.enabled),
    };
  }

  function scanCandidates() {
    return module2?.scanCandidates?.() || [];
  }

  function getActionContracts() {
    return ACTIONS;
  }

  globalThis.AccessAbleModuleCaptions = {
    scanCandidates,
    enableHighlights,
    disableHighlights,
    getStatus,
    getActionContracts,
  };
})();
