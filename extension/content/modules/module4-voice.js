"use strict";

(() => {
  const TOAST_ID = "accessable-voice-toast";
  const TOAST_DURATION_MS = 3000;
  const MAX_NO_SPEECH_RESTARTS = 5;
  const RESTART_BASE_DELAY_MS = 450;
  const RESTART_MAX_DELAY_MS = 3500;
  const COMMAND_COOLDOWN_MS = 350;
  const CLICK_CANDIDATE_LIMIT = 450;

  const state = {
    enabled: false,
    recognition: null,
    commandsExecuted: 0,
    noSpeechCount: 0,
    isRestartScheduled: false,
    restartAttempts: 0,
    activeStartToken: 0,
    lastCommandAt: 0,
  };

  function enable() {
    if (state.enabled) {
      return getStatus();
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast("Voice commands not supported in this browser.", true);
      return getStatus();
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const transcript = String(event.results[last][0]?.transcript || "")
          .trim()
          .toLowerCase();
        if (transcript) {
          state.noSpeechCount = 0;
          state.restartAttempts = 0;
          handleCommand(transcript);
        }
      };

      recognition.onerror = (event) => {
        const errorType = String(event.error || "");

        if (errorType === "not-allowed" || errorType === "permission-denied") {
          showToast(
            "Microphone access denied. Please allow microphone in browser settings.",
            true
          );
          disable();
          return;
        }

        if (errorType === "no-speech") {
          state.noSpeechCount += 1;
          if (state.noSpeechCount >= MAX_NO_SPEECH_RESTARTS) {
            state.noSpeechCount = 0;
            safeRestartRecognition();
          }
          return;
        }

        if (errorType === "network") {
          showToast("Voice: network error. Reconnecting\u2026", false);
          scheduleRecognitionRestart();
          return;
        }

        if (errorType === "aborted") {
          return;
        }

        showToast(`Voice error: ${errorType}`, true);
      };

      recognition.onend = () => {
        if (state.enabled) {
          scheduleRecognitionRestart();
        }
      };

      state.recognition = recognition;
      state.enabled = true;
      state.noSpeechCount = 0;

      state.activeStartToken += 1;
      safeStartRecognition(recognition, state.activeStartToken);
      showToast("Voice commands active. Say a command.");
    } catch (err) {
      showToast(
        `Voice failed to start: ${err?.message || "unknown error"}`,
        true
      );
      state.enabled = false;
      state.recognition = null;
    }

    return getStatus();
  }

  function disable() {
    state.enabled = false;
    state.noSpeechCount = 0;
    state.restartAttempts = 0;
    state.isRestartScheduled = false;
    state.activeStartToken += 1;

    if (state.recognition) {
      try {
        state.recognition.onresult = null;
        state.recognition.onerror = null;
        state.recognition.onend = null;
        state.recognition.abort();
      } catch (_) {
        // Ignore cleanup errors.
      }
      state.recognition = null;
    }

    removeToast();
    return getStatus();
  }

  function getStatus() {
    return {
      enabled: state.enabled,
      commandsExecuted: state.commandsExecuted,
    };
  }

  function safeStartRecognition(recognition, token) {
    if (!recognition || !state.enabled || token !== state.activeStartToken) {
      return;
    }
    try {
      recognition.start();
    } catch (_) {
      // Already started or unavailable — ignore.
    }
  }

  function scheduleRecognitionRestart() {
    if (!state.recognition || !state.enabled || state.isRestartScheduled) {
      return;
    }
    state.isRestartScheduled = true;
    state.restartAttempts += 1;
    const delay = Math.min(
      RESTART_MAX_DELAY_MS,
      RESTART_BASE_DELAY_MS * Math.max(1, state.restartAttempts)
    );
    const token = state.activeStartToken;
    setTimeout(() => {
      state.isRestartScheduled = false;
      if (!state.enabled || !state.recognition || token !== state.activeStartToken) {
        return;
      }
      safeStartRecognition(state.recognition, token);
    }, delay);
  }

  function handleCommand(transcript) {
    const now = Date.now();
    if (now - state.lastCommandAt < COMMAND_COOLDOWN_MS) {
      return;
    }
    state.lastCommandAt = now;

    if (transcript.includes("scroll down")) {
      window.scrollBy({ top: 300, behavior: "smooth" });
      showToast("Scrolling down");
      state.commandsExecuted += 1;
      return;
    }

    if (transcript.includes("scroll up")) {
      window.scrollBy({ top: -300, behavior: "smooth" });
      showToast("Scrolling up");
      state.commandsExecuted += 1;
      return;
    }

    if (transcript.includes("go back")) {
      showToast("Going back");
      state.commandsExecuted += 1;
      window.history.back();
      return;
    }

    if (
      transcript.includes("refresh") ||
      transcript.includes("reload page")
    ) {
      showToast("Refreshing page");
      state.commandsExecuted += 1;
      window.location.reload();
      return;
    }

    if (transcript.includes("stop listening")) {
      showToast("Voice commands stopped");
      disable();
      return;
    }

    // "click <text>" — match buttons / links by visible text or aria-label
    const clickMatch = transcript.match(/^(?:please\s+)?click\s+(.+)$/);
    if (clickMatch) {
      const targetText = (clickMatch[1] || "").trim();
      const clicked = tryClick(targetText);
      if (clicked) {
        showToast(`Clicked: ${targetText}`);
        state.commandsExecuted += 1;
      } else {
        showToast(`Couldn't find "${targetText}" to click`, false);
      }
      return;
    }

    showToast(`Command not recognised: "${transcript}"`, false);
  }

  function tryClick(targetText) {
    const selectors =
      'button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"]';
    const candidates = Array.from(document.querySelectorAll(selectors)).slice(
      0,
      CLICK_CANDIDATE_LIMIT
    );
    const lower = targetText.toLowerCase();

    const match =
      candidates.find(
        (el) =>
          (el.innerText || el.textContent || "").trim().toLowerCase() === lower
      ) ||
      candidates.find((el) =>
        (el.innerText || el.textContent || "")
          .trim()
          .toLowerCase()
          .includes(lower)
      ) ||
      candidates.find((el) =>
        (el.getAttribute("aria-label") || "").toLowerCase().includes(lower)
      ) ||
      candidates.find((el) =>
        (el.getAttribute("value") || "").toLowerCase().includes(lower)
      );

    if (match instanceof HTMLElement) {
      match.focus();
      match.click();
      return true;
    }

    return false;
  }

  // ─── Toast helpers ────────────────────────────────────────────────

  let _toastTimer = 0;

  function showToast(message, isWarning = false) {
    removeToast();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    toast.className = isWarning
      ? "accessable-voice-toast accessable-voice-toast--warn"
      : "accessable-voice-toast";
    toast.textContent = `\uD83C\uDF99\uFE0F ${message}`;

    (document.body || document.documentElement).appendChild(toast);

    requestAnimationFrame(() => {
      if (toast.parentNode) {
        toast.classList.add("accessable-voice-toast--visible");
      }
    });

    _toastTimer = setTimeout(() => {
      if (!toast.parentNode) {
        return;
      }
      toast.classList.remove("accessable-voice-toast--visible");
      toast.addEventListener(
        "transitionend",
        () => {
          if (toast.parentNode) {
            toast.remove();
          }
        },
        { once: true }
      );
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 500);
    }, TOAST_DURATION_MS);
  }

  function removeToast() {
    clearTimeout(_toastTimer);
    const existing = document.getElementById(TOAST_ID);
    if (existing) {
      existing.remove();
    }
  }

  const api = Object.freeze({ enable, disable, getStatus });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModuleVoice = api;
})();
