import { greeting, taipeiParts } from "../time";

export type BriefingItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: "course" | "deadline" | "research" | "reading" | "feedback";
};

export type Briefing = {
  greeting: string;
  dateLabel: string;
  pose: "idle" | "reading" | "thinking" | "writing" | "focus" | "sleep" | "success" | "reminder";
  speech: string;
  important: BriefingItem[];
  parked: number;
  todayCourse: string | null;
  openTasks: number;
  nearestDeadline: string | null;
};

export function buildBriefing(input: {
  now?: Date;
  name: string;
  coursesToday: Array<{ id: string; name: string; start_time: string | null }>;
  openTasks: Array<{ id: string; title: string; due_at: string | null; priority: number }>;
  unreadPapers: number;
  project: { id: string; title: string; next_step: string | null; progress: number } | null;
  lastFeedback: string | null;
  mode?: string;
}): Briefing {
  const now = input.now ?? new Date();
  const parts = taipeiParts(now);
  const hello = greeting(now);
  const important: BriefingItem[] = [];

  const course = input.coursesToday[0];
  if (course) {
    important.push({
      id: `course-${course.id}`,
      title: course.name,
      detail: course.start_time ? `${course.start_time} 上課` : "今天有課",
      href: `/courses/${course.id}`,
      kind: "course",
    });
  }

  const upcoming = input.openTasks
    .filter((task) => task.due_at)
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  const soon = upcoming.find((task) => {
    const due = new Date(task.due_at ?? "");
    return due.getTime() - now.getTime() < 7 * 86400000;
  });
  if (soon) {
    important.push({
      id: `task-${soon.id}`,
      title: soon.title,
      detail: "快到期",
      href: "/today",
      kind: "deadline",
    });
  }

  if (input.lastFeedback) {
    important.push({
      id: "feedback",
      title: "上次老師的建議還在",
      detail: input.lastFeedback.slice(0, 42),
      href: "/meetings",
      kind: "feedback",
    });
  } else if (input.project?.next_step) {
    important.push({
      id: `next-${input.project.id}`,
      title: input.project.next_step,
      detail: input.project.title,
      href: `/research/${input.project.id}`,
      kind: "research",
    });
  }

  if (input.unreadPapers > 0 && important.length < 3) {
    important.push({
      id: "reading",
      title: `還有 ${input.unreadPapers} 篇文獻在閱讀匣`,
      detail: "不必全部讀完，先看跟研究最有關的部分",
      href: "/papers",
      kind: "reading",
    });
  }

  const top = important.slice(0, 3);
  const parked = Math.max(0, input.openTasks.length - top.filter((item) => item.kind === "deadline").length);
  let pose: Briefing["pose"] = "idle";
  if (input.mode === "focus") pose = "focus";
  else if (parts.hour >= 23 || parts.hour < 6) pose = "sleep";
  else if (soon) pose = "reminder";
  else if (input.unreadPapers > 0) pose = "reading";
  else if (input.project) pose = "thinking";
  if (input.openTasks.length === 0 && !course) pose = "success";

  const name = input.name.replace(/同學$/, "");
  let speech = `${hello}，${name}。`;
  if (top.length === 0) {
    speech += "今天沒有急迫的截止。研究室很安靜，適合把一篇文獻慢慢讀完。";
  } else {
    speech += `今天真正要看的只有 ${top.length} 件事，其他我先幫你收好。`;
  }

  return {
    greeting: hello,
    dateLabel: `${parts.year}年${parts.month}月${parts.day}日`,
    pose,
    speech,
    important: top,
    parked,
    todayCourse: course?.name ?? null,
    openTasks: input.openTasks.length,
    nearestDeadline: soon?.title ?? null,
  };
}
