"use strict";

(() => {
  function findActiveCue(cues, currentTime, lastIndex) {
    const list = Array.isArray(cues) ? cues : [];
    const time = Number(currentTime);

    if (!Number.isFinite(time) || list.length === 0) {
      return { cue: null, index: -1 };
    }

    if (isValidIndex(lastIndex, list.length)) {
      const cachedCue = list[lastIndex];
      if (cachedCue && cachedCue.start <= time && time <= cachedCue.end) {
        return { cue: cachedCue, index: lastIndex };
      }

      if (cachedCue && time > cachedCue.end) {
        for (let i = lastIndex + 1; i < list.length; i += 1) {
          const cue = list[i];
          if (cue.start <= time && time <= cue.end) {
            return { cue, index: i };
          }
          if (cue.start > time) {
            return { cue: null, index: -1 };
          }
        }
      }

      if (cachedCue && time < cachedCue.start) {
        for (let i = lastIndex - 1; i >= 0; i -= 1) {
          const cue = list[i];
          if (cue.start <= time && time <= cue.end) {
            return { cue, index: i };
          }
          if (cue.end < time) {
            return { cue: null, index: -1 };
          }
        }
      }
    }

    let left = 0;
    let right = list.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cue = list[mid];
      if (time < cue.start) {
        right = mid - 1;
      } else if (time > cue.end) {
        left = mid + 1;
      } else {
        return { cue, index: mid };
      }
    }

    return { cue: null, index: -1 };
  }

  function isValidIndex(value, length) {
    return Number.isInteger(value) && value >= 0 && value < length;
  }

  const api = Object.freeze({
    findActiveCue,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2ActiveCueSelector = api;
})();
