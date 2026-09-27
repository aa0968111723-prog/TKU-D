export type CatPose = "idle" | "reading" | "thinking" | "writing" | "focus" | "sleep" | "success" | "reminder" | "error" | "loading";

export function Cat({ pose = "idle", size = 148 }: { pose?: CatPose; size?: number }) {
  const sleep = pose === "sleep" || pose === "focus";
  const happy = pose === "success";
  return (
    <div className={`cat ${pose === "loading" ? "chase" : "float"}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 150" width={size} height={size} aria-hidden>
        <ellipse cx="80" cy="136" rx="36" ry="7" fill="#e6d8c8" />
        {pose === "reading" && <rect x="96" y="78" width="34" height="26" rx="3" fill="#fff" stroke="#d9cbbd" />}
        {pose === "reading" && <path className="paper-page" d="M100 82 h26 v18 h-26z" fill="#f7f1e8" />}
        {pose === "reminder" && <circle cx="118" cy="46" r="12" fill="#fffdf8" stroke="#c9956a" strokeWidth="2" />}
        {pose === "reminder" && <path d="M118 40 v7 l4 3" stroke="#c9956a" strokeWidth="1.6" fill="none" />}
        {pose === "error" && <rect x="108" y="96" width="22" height="16" rx="2" fill="#e7cbb8" transform="rotate(18 119 104)" />}
        <path d="M58 78c-8 18-6 36 8 42 18 8 42 6 52-8 8-12 6-30-2-40-10 8-22 10-34 6-8-8-16-8-24 0z" fill="#f6e7d4" />
        <path d="M46 58c2-22 18-34 34-32 18 2 32 16 32 34 0 8-2 14-4 18-12-6-24-8-36-4-8 2-16 2-22-2-2-5-4-10-4-14z" fill="#f8ecdf" />
        <path d="M50 46c-2-16 8-26 16-24 2 10 0 18-4 24-6 2-10 2-12 0z" fill="#f3d2bc" />
        <path d="M108 44c6-14 16-12 18 2 2 12-4 20-10 22-2-8-6-16-8-24z" fill="#f8ecdf" />
        <path d="M54 48c2-8 8-12 12-10 0 8-2 12-6 14-4 0-6-1-6-4z" fill="#e7b89a" />
        <g className="blink">
          {sleep ? (
            <>
              <path d="M62 70q6 4 12 0" stroke="#5c5148" strokeWidth="1.7" fill="none" />
              <path d="M90 70q6 4 12 0" stroke="#5c5148" strokeWidth="1.7" fill="none" />
            </>
          ) : (
            <>
              <ellipse cx="68" cy="70" rx="3.2" ry={happy ? 3.4 : 3.6} fill="#3d342e" />
              <ellipse cx="96" cy="70" rx="3.2" ry={happy ? 3.4 : 3.6} fill="#3d342e" />
            </>
          )}
        </g>
        <path d="M80 78c2 3 5 3 7 0" stroke="#e2a090" strokeWidth="1.6" fill="none" />
        <path d={happy ? "M72 86q10 8 20 0" : "M74 86q8 5 16 0"} stroke="#8a6d62" strokeWidth="1.5" fill="none" />
        {pose === "reading" && <circle cx="68" cy="70" r="11" fill="none" stroke="#6d97a8" strokeWidth="1.4" />}
        {pose === "reading" && <circle cx="96" cy="70" r="11" fill="none" stroke="#6d97a8" strokeWidth="1.4" />}
        {pose === "reading" && <path d="M79 70h6" stroke="#6d97a8" strokeWidth="1.4" />}
        <path d="M72 104c6 8 16 8 22 0" stroke="#e7cbb8" strokeWidth="3" fill="none" />
        {pose === "success" && <path d="M108 96c8-10 16-8 14 2" stroke="#f6e7d4" strokeWidth="7" strokeLinecap="round" />}
        {pose === "writing" && <rect x="92" y="108" width="28" height="6" rx="2" fill="#6d97a8" />}
        {pose === "focus" && <rect x="104" y="108" width="22" height="14" rx="2" fill="#fff" stroke="#e6ddd2" />}
        {pose === "loading" && <rect x="112" y="88" width="16" height="12" rx="2" fill="#fffdf8" stroke="#6d97a8" />}
      </svg>
    </div>
  );
}
