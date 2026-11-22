import { redirect } from "next/navigation";
import { getCtx } from "@/lib/session";

export default async function Home() {
  redirect((await getCtx()) ? "/my-work" : "/login");
}
