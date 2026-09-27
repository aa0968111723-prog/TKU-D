import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSid } from "@/lib/http";
import { db } from "@/lib/db";
import * as repo from "@/lib/repo";

export default async function Home() {
  const jar = await cookies();
  const sid = await readSid(`edupsy_session=${jar.get("edupsy_session")?.value ?? ""}`);
  const user = sid ? repo.userFromSession(db(), sid) : null;
  redirect(user ? "/today" : "/login");
}
