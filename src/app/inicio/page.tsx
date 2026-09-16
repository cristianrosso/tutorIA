import { redirect } from "next/navigation";

export default async function StudentHome() {
  redirect("/dashboard");
}
