"use client";

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
  onClick?: () => void;
};

type HubNarratorButtonProps = SharedProps & {
  variant: "hub";
  state: HubNarratorState;
};

type SceneNarratorButtonProps = SharedProps & {
  variant: "scene";
  state: SceneNarratorState;
};

export type NarratorButtonProps =
  | HubNarratorButtonProps
  | SceneNarratorButtonProps;

type NarratorButtonState =
  | HubNarratorState
  | SceneNarratorState;

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
    default: "/narrators/sinclair/narrator_default.svg",
    recommended: "/narrators/sinclair/narrator_Primary.svg",
    selected: "/narrators/sinclair/narrator_selected.svg",
    listening: "/narrators/sinclair/narrator_listening.svg",
    thinking: "/narrators/sinclair/narrator_thinking.svg",
    speaking: "/narrators/sinclair/narrator_speaking.svg",
    disabled: "/narrators/sinclair/narrator_disabled.svg",
  },

  whitmore: {
    default: "/narrators/whitmore/narrator_default.svg",
    recommended: "/narrators/whitmore/narrator_Primary.svg",
    selected: "/narrators/whitmore/narrator_selected.svg",
    listening: "/narrators/whitmore/narrator_listening.svg",
    thinking: "/narrators/whitmore/narrator_thinking.svg",
    speaking: "/narrators/whitmore/narrator_speaking.svg",
    disabled: "/narrators/whitmore/narrator_disabled.svg",
  },

  ming: {
    default: "/narrators/ming/narrator_default.svg",
    recommended: "/narrators/ming/narrator_Primary.svg",
    selected: "/narrators/ming/narrator_selected.svg",
    listening: "/narrators/ming/narrator_listening.svg",
    thinking: "/narrators/ming/narrator_thinking.svg",
    speaking: "/narrators/ming/narrator_speaking.svg",
    disabled: "/narrators/ming/narrator_disabled.svg",
  },
};

function joinClasses(
  ...classes: Array<string | false | undefined>
) {
  return classes.filter(Boolean).join(" ");
}

export default function NarratorButton({
  narrator,
  variant,
  state,
  label,
  className,
  onClick,
}: NarratorButtonProps) {
  const disabled = state === "disabled";
  const iconSrc = narratorIcons[narrator][state];
  const narratorName = narratorNames[narrator];

  function getAccessibleLabel() {
    if (label) return label;

    switch (state) {
      case "recommended":
        return `${narratorName}, recommended narrator.`;

      case "selected":
        return `${narratorName}, selected.`;

      case "listening":
        return `${narratorName} is listening.`;

      case "thinking":
        return `${narratorName} is thinking.`;

      case "speaking":
        return `${narratorName} is speaking.`;

      case "disabled":
        return `${narratorName} is unavailable.`;

      default:
        return `Select ${narratorName}.`;
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
      onClick={onClick}
      className={joinClasses(
        "relative h-32 w-46 shrink-0 select-none border-0 bg-transparent p-0",
        variant === "hub" && "h-20 w-20",
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
            (
              state === "default" ||
              state === "recommended" ||
              state === "selected" ||
              state === "disabled"
            ) &&
            "left-6 top-6 h-20 w-20",

          variant === "scene" &&
            (
              state === "listening" ||
              state === "thinking"
            ) &&
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