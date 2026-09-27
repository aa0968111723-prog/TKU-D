import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { db } from "@/lib/db";
import { readSid } from "@/lib/http";
import * as repo from "@/lib/repo";
import { briefingFor } from "@/lib/services/engine";
import { Gate } from "@/components/gate";

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const sid = await readSid(`edupsy_session=${jar.get("edupsy_session")?.value ?? ""}`);
  const user = sid ? repo.userFromSession(db(), sid) : null;
  if (!user) redirect("/login");
  const settings = repo.getSettings(db(), String(user.id));
  const profile = repo.getProfile(db(), String(user.id));
  const briefing = briefingFor(db(), String(user.id), String(user.name));
  return (
    <Shell user={{ name: String(user.name) }} settings={settings} briefing={briefing}>
      <Gate onboarded={Boolean(profile?.onboarded_at)}>{children}</Gate>
    </Shell>
  );
}
