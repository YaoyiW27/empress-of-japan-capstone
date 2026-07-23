"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
} from "react";

export type NarratorId =
  | "sinclair"
  | "whitmore"
  | "ming";

export type HubNarratorState =
  | "default"
  | "recommended"
  | "selected"
  | "disabled";

export type SceneNarratorState =
  | "default"
  | "recommended"
  | "selected"
  | "listening"
  | "thinking"
  | "speaking"
  | "disabled";

type SharedProps = {
  narrator: NarratorId;
  label?: string;
  className?: string;
};

type HubNarratorButtonProps = SharedProps & {
  variant: "hub";
  state: HubNarratorState;
  onClick?: () => void;
};

type SceneNarratorButtonProps = SharedProps & {
  variant: "scene";
  state: SceneNarratorState;

  /**
   * A quick press and release selects the narrator.
   */
  onClick?: () => void;

  /**
   * Called after the button has been held for HOLD_DELAY.
   */
  onHoldStart?: () => void;

  /**
   * Called when the user releases the button after holding.
   */
  onHoldEnd?: () => void;
};

export type NarratorButtonProps =
  | HubNarratorButtonProps
  | SceneNarratorButtonProps;

type NarratorButtonState =
  | HubNarratorState
  | SceneNarratorState;

const HOLD_DELAY = 250;

const narratorNames: Record<NarratorId, string> = {
  sinclair: "Captain Sinclair",
  whitmore: "Ms. Whitmore",
  ming: "Ming",
};

const narratorIcons: Record<
  NarratorId,
  Record<NarratorButtonState, string>
> = {
  sinclair: {
    default:
      "/narrators/sinclair/narrator_active.svg",
    recommended:
      "/narrators/sinclair/narrator_Primary.svg",
    selected:
      "/narrators/sinclair/narrator_selected.svg",
    listening:
      "/narrators/sinclair/narrator_listening.svg",
    thinking:
      "/narrators/sinclair/narrator_thinking.svg",
    speaking:
      "/narrators/sinclair/narrator_speaking.svg",
    disabled:
      "/narrators/sinclair/narrator_Primary.svg",
  },

  whitmore: {
    default:
      "/narrators/whitmore/narrator_active.svg",
    recommended:
      "/narrators/whitmore/narrator_Primary.svg",
    selected:
      "/narrators/whitmore/narrator_selected.svg",
    listening:
      "/narrators/whitmore/narrator_listening.svg",
    thinking:
      "/narrators/whitmore/narrator_thinking.svg",
    speaking:
      "/narrators/whitmore/narrator_speaking.svg",
    disabled:
      "/narrators/whitmore/narrator_Primary.svg",
  },

  ming: {
    default:
      "/narrators/ming/narrator_active.svg",
    recommended:
      "/narrators/ming/narrator_Primary.svg",
    selected:
      "/narrators/ming/narrator_selected.svg",
    listening:
      "/narrators/ming/narrator_listening.svg",
    thinking:
      "/narrators/ming/narrator_thinking.svg",
    speaking:
      "/narrators/ming/narrator_speaking.svg",
    disabled:
      "/narrators/ming/narrator_Primary.svg",
  },
};

function joinClasses(
  ...classes: Array<string | false | undefined>
) {
  return classes.filter(Boolean).join(" ");
}

function canStartSpeaking(
  state: SceneNarratorState,
) {
  return (
    state === "default" ||
    state === "recommended" ||
    state === "selected"
  );
}

export default function NarratorButton(
  props: NarratorButtonProps,
) {
  const {
    narrator,
    variant,
    state,
    className,
  } = props;

  const activePointerId =
    useRef<number | null>(null);

  const holdTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const didHoldRef = useRef(false);
  const keyboardPressedRef = useRef(false);

  const narratorName = narratorNames[narrator];
  const disabled = state === "disabled";
  const iconSrc =
    narratorIcons[narrator][state];

  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHolding() {
    if (
      props.variant !== "scene" ||
      disabled ||
      !canStartSpeaking(props.state) ||
      didHoldRef.current
    ) {
      return;
    }

    didHoldRef.current = true;
    props.onHoldStart?.();
  }

  function stopHolding() {
    if (
      props.variant !== "scene" ||
      !didHoldRef.current
    ) {
      return;
    }

    didHoldRef.current = false;
    props.onHoldEnd?.();
  }

  function beginHoldTimer() {
    clearHoldTimer();
    didHoldRef.current = false;

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startHolding();
    }, HOLD_DELAY);
  }

  function finishPress() {
    clearHoldTimer();

    if (props.variant !== "scene") {
      return;
    }

    if (didHoldRef.current) {
      stopHolding();
    } else {
      props.onClick?.();
    }
  }

  function cancelPress() {
    clearHoldTimer();
    stopHolding();
    didHoldRef.current = false;
  }

  function handleClick() {
    if (
      props.variant !== "hub" ||
      disabled
    ) {
      return;
    }

    props.onClick?.();
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      disabled ||
      !canStartSpeaking(props.state)
    ) {
      return;
    }

    // Only respond to the main mouse button.
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();

    activePointerId.current =
      event.pointerId;

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    beginHoldTimer();
  }

  function handlePointerUp(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      activePointerId.current !==
        event.pointerId
    ) {
      return;
    }

    activePointerId.current = null;

    finishPress();

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  }

  function handlePointerCancel(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      activePointerId.current !==
        event.pointerId
    ) {
      return;
    }

    activePointerId.current = null;
    cancelPress();

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  }

  function handleLostPointerCapture() {
    /*
     * A normal pointer-up sets activePointerId to null
     * before releasing capture, so this block only runs
     * when capture is lost unexpectedly.
     */
    if (activePointerId.current === null) {
      return;
    }

    activePointerId.current = null;
    cancelPress();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      disabled ||
      !canStartSpeaking(props.state) ||
      (event.key !== " " &&
        event.key !== "Enter")
    ) {
      return;
    }

    event.preventDefault();

    /*
     * Ignore repeated keydown events while the key
     * remains pressed.
     */
    if (keyboardPressedRef.current) {
      return;
    }

    keyboardPressedRef.current = true;
    beginHoldTimer();
  }

  function handleKeyUp(
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      (event.key !== " " &&
        event.key !== "Enter") ||
      !keyboardPressedRef.current
    ) {
      return;
    }

    event.preventDefault();

    keyboardPressedRef.current = false;
    finishPress();
  }

  function getAccessibleLabel() {
    if (props.label) {
      return props.label;
    }

    if (variant === "hub") {
      switch (state) {
        case "recommended":
          return `${narratorName}, recommended narrator. Click to view biography.`;

        case "selected":
          return `${narratorName}, selected.`;

        case "disabled":
          return `${narratorName} is unavailable.`;

        default:
          return `View ${narratorName}'s biography.`;
      }
    }

    switch (state) {
      case "recommended":
        return `${narratorName}, recommended. Click to select or hold to speak.`;

      case "selected":
        return `${narratorName}, selected. Hold to speak.`;

      case "listening":
        return `${narratorName} is listening. Release to finish speaking.`;

      case "thinking":
        return `${narratorName} is thinking.`;

      case "speaking":
        return `${narratorName} is speaking.`;

      case "disabled":
        return `${narratorName} is unavailable.`;

      default:
        return `Click to select ${narratorName}, or hold to speak.`;
    }
  }

  useEffect(() => {
    return () => {
      clearHoldTimer();
    };
  }, []);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={getAccessibleLabel()}
      aria-pressed={
        state === "selected" ||
        state === "listening" ||
        state === "thinking" ||
        state === "speaking"
      }
      aria-busy={
        state === "thinking" ||
        state === "speaking"
      }
      data-variant={variant}
      data-state={state}
      data-narrator={narrator}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={
        handleLostPointerCapture
      }
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={() => {
        if (
          variant === "scene" &&
          keyboardPressedRef.current
        ) {
          keyboardPressedRef.current = false;
          cancelPress();
        }
      }}
      onContextMenu={(event) => {
        if (variant === "scene") {
          event.preventDefault();
        }
      }}
      className={joinClasses(
        "relative h-32 w-46 shrink-0 select-none border-0 bg-transparent p-0",
        variant === "hub" &&
          "h-20 w-20",
        className,
      )}
    >
      <img
        src={iconSrc}
        alt=""
        draggable={false}
        className={joinClasses(
          "pointer-events-none absolute block max-w-none",

          variant === "hub" &&
            "left-0 top-0 h-20 w-20",

          variant === "scene" &&
            (state === "default" ||
              state === "recommended" ||
              state === "selected") &&
            "left-6 top-6 h-20 w-20",

          variant === "scene" &&
            (state === "listening" ||
              state === "thinking" ||
              state === "disabled") &&
            "left-0 top-0 h-32 w-32",

          variant === "scene" &&
            state === "speaking" &&
            "left-0 top-0 h-32 w-46",
        )}
      />

      <span className="sr-only">
        {narratorName}
      </span>
    </button>
  );
}