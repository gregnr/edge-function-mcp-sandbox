import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NotesClient } from "./notes-client";
import type { Note } from "./types";

export default async function NotesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: notes, error } = await supabase
    .from("notes")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-red-500">Error loading notes: {error.message}</p>
      </div>
    );
  }

  return <NotesClient initialNotes={notes as Note[]} />;
}
