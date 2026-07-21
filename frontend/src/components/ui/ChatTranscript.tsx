"use client";

import { useState } from "react";

export type TranscriptMessage = {
  id: string;
  speaker: string;
  text: string;
};

type ChatTranscriptProps = {
  messages: TranscriptMessage[];
};

export default function ChatTranscript({
  messages,
}: ChatTranscriptProps) {
  const [open, setOpen] = useState(false);

  const hasConversation = messages.length > 0;

  function handleToggle() {
    setOpen((current) => !current);
  }

  return (
    <div className="chat-transcript">
      {open && hasConversation && (
        <div
        id="chat-transcript-panel"
        className="chat-transcript__panel"
        aria-label="Chat transcript"
        >
          <div className="chat-transcript__content">
            {messages.map((message) => (
              <p
                key={message.id}
                className="chat-transcript__message text-ig"
              >
                <strong>{message.speaker}:</strong>{" "}
                {message.text}
              </p>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={
          hasConversation ? "chat-transcript-panel" : undefined
        }
        className="chat-transcript__button text-ui-interaction"
      >
        <span>Chat Transcript</span>

        <svg
          className={[
            "chat-transcript__arrow",
            open ? "chat-transcript__arrow--open" : "",
          ].join(" ")}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M1.4 3.5L6 9L10.6 3.5Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}