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
  | "notSelected"
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

const narratorIcons: Record<NarratorId, string> = {
  sinclair: "/narrators/sinclair/narrator_default.svg",
  whitmore: "/narrators/whitmore/narrator_default.svg",
  ming: "/narrators/ming/narrator_default.svg",
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
  const iconSrc = narratorIcons[narrator];
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
        "narrator-button",
        className,
      )}
    >
      <img
        src={iconSrc}
        alt=""
        draggable={false}
        className="narrator-button__portrait"
      />
  
      {state === "speaking" && (
        <span
          className="narrator-button__speaking-icon"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5Z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18 6a8.5 8.5 0 0 1 0 12" />
          </svg>
        </span>
      )}
  
      <span className="sr-only">
        {narratorName}
      </span>
    </button>
  );
}