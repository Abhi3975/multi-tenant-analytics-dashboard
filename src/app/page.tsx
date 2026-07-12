import { redirect } from "next/navigation";

export default function Home() {
  // Everything lives under /org; that route redirects to /login if signed out.
  redirect("/org");
}
