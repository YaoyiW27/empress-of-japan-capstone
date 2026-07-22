"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useRef,
  useState,
} from "react";

export type NarratorId = "sinclair" | "whitmore" | "ming";

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
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
};

export type NarratorButtonProps =
  | HubNarratorButtonProps
  | SceneNarratorButtonProps;

type NarratorButtonState =
  | HubNarratorState
  | SceneNarratorState;

const narratorNames: Record<NarratorId, string> = {
  sinclair: "sinclair Sinclair",
  whitmore: "Ms. Whitmore",
  ming: "Ming",
};

const narratorIcons: Record<
  NarratorId,
  Record<NarratorButtonState, string>
> = {
  sinclair: {
    default: "/narrators/sinclair/default.svg",
    recommended: "/narrators/sinclair/recommended.svg",
    selected: "/narrators/sinclair/selected.svg",
    listening: "/narrators/sinclair/listening.svg",
    thinking: "/narrators/sinclair/thinking.svg",
    speaking: "/narrators/sinclair/speaking.svg",
    disabled: "/narrators/sinclair/disabled.svg",
  },

  whitmore: {
    default: "/narrators/whitmore/narrator_active.svg",
    recommended: "/narrators/whitmore/narrator_Primary.svg",
    selected: "/narrators/whitmore/narrator_selected.svg",
    listening: "/narrators/whitmore/narrator_listening.svg",
    thinking: "/narrators/whitmore/narrator_thinking.svg",
    speaking: "/narrators/whitmore/narrator_speaking.svg",
    // Temporary fallback
    disabled: "/narrators/whitmore/narrator_Primary.svg",
  },

  ming: {
    default: "/narrators/ming/default.svg",
    recommended: "/narrators/ming/recommended.svg",
    selected: "/narrators/ming/selected.svg",
    listening: "/narrators/ming/listening.svg",
    thinking: "/narrators/ming/thinking.svg",
    speaking: "/narrators/ming/speaking.svg",
    disabled: "/narrators/ming/disabled.svg",
  },
};

function joinClasses(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function canStartSpeaking(state: SceneNarratorState) {
  return (
    state === "default" ||
    state === "recommended" ||
    state === "selected"
  );
}

export default function NarratorButton(props: NarratorButtonProps) {
  const { narrator, variant, state, className } = props;

  const [isHeld, setIsHeld] = useState(false);
  const activePointerId = useRef<number | null>(null);

  const narratorName = narratorNames[narrator];
  const disabled = state === "disabled";
  const iconSrc = narratorIcons[narrator][state];

  function startHolding() {
    if (
      props.variant !== "scene" ||
      disabled ||
      !canStartSpeaking(props.state) ||
      isHeld
    ) {
      return;
    }

    setIsHeld(true);
    props.onHoldStart?.();
  }

  function stopHolding() {
    if (props.variant !== "scene" || !isHeld) {
      return;
    }

    setIsHeld(false);
    props.onHoldEnd?.();
  }

  function handleClick() {
    if (props.variant !== "hub" || disabled) {
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

    event.preventDefault();

    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);

    startHolding();
  }

  function handlePointerUp(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      activePointerId.current !== event.pointerId
    ) {
      return;
    }

    activePointerId.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    stopHolding();
  }

  function handlePointerCancel(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      activePointerId.current !== event.pointerId
    ) {
      return;
    }

    activePointerId.current = null;
    stopHolding();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      disabled ||
      (event.key !== " " && event.key !== "Enter")
    ) {
      return;
    }

    event.preventDefault();
    startHolding();
  }

  function handleKeyUp(
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (
      props.variant !== "scene" ||
      (event.key !== " " && event.key !== "Enter")
    ) {
      return;
    }

    event.preventDefault();
    stopHolding();
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
        return `${narratorName}, recommended. Hold to speak.`;

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
        return `Hold to speak to ${narratorName}.`;
    }
  }

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
      onLostPointerCapture={() => {
        activePointerId.current = null;
        stopHolding();
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onContextMenu={(event) => {
        if (variant === "scene") {
          event.preventDefault();
        }
      }}
      className={joinClasses(
        "relative h-32 w-46 shrink-0 border-0 bg-transparent p-0",
        variant === "hub" && "h-20 w-20",
        className,
      )}
    >
    <img
    src={iconSrc}
    alt=""
    draggable={false}
    className={joinClasses(
        "absolute block max-w-none pointer-events-none",

        variant === "hub" &&
        "left-0 top-0 h-20 w-20",

        variant === "scene" &&
        (state === "selected" ||
            state === "recommended") &&
        "left-6 top-6 h-20 w-20",

        variant === "scene" &&
        state === "default" &&
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

      <span className="sr-only">{narratorName}</span>
    </button>
  );
}