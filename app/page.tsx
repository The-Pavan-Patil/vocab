import { connection } from "next/server";
import Home from "@/components/Home";
import { loadInitialWords } from "@/lib/supabase/initial-words";

// The app is one client screen (components/Home.tsx). Its word list starts
// loading here, on the server, as the request arrives: the promise streams to
// the browser inside this same response, so the list doesn't wait for the
// app's JavaScript to download, start, and ask for it. Rendered per request
// (connection) — the list is the signed-in user's.
export default async function Page() {
  await connection();
  return <Home initialWords={loadInitialWords()} />;
}
