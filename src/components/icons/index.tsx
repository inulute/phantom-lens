export const UpArrowIcon = "⇧";

export const BackslashIcon = "\\";

export const EnterIcon = "↵";

export const PlayIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 5v14l11-7z"
      fill="currentColor"
    />
  </svg>
);

export const StopIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="6"
      y="6"
      width="12"
      height="12"
      fill="currentColor"
    />
  </svg>
);

export function MicrophoneIcon({
  isRecording = false,
  className,
}: {
  isRecording?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {isRecording ? (
        <>
          <circle cx="12" cy="12" r="10" fill="#ef4444" />
          <rect x="9.5" y="9.5" width="5" height="5" fill="white" rx="0.5" />
        </>
      ) : (
        <>
          <path
            d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
            fill="currentColor"
          />
          <path
            d="M19 10v2a7 7 0 0 1-14 0v-2"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <line
            x1="12"
            y1="19"
            x2="12"
            y2="23"
            stroke="currentColor"
            strokeWidth="2"
          />
          <line
            x1="8"
            y1="23"
            x2="16"
            y2="23"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}
