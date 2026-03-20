"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoteForm } from "./note-form";
import { NoteCard } from "./note-card";
import type { Note } from "./types";

interface NotesClientProps {
  initialNotes: Note[];
}

export function NotesClient({ initialNotes }: NotesClientProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const resetCreate = () => {
    setCreateTitle("");
    setCreateContent("");
    setIsCreating(false);
    setError(null);
  };

  const resetEdit = () => {
    setEditTitle("");
    setEditContent("");
    setEditingId(null);
    setError(null);
  };

  const handleCreate = async () => {
    if (!createTitle.trim()) {
      setError("Title is required");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Not authenticated");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("notes")
      .insert({ title: createTitle, content: createContent || undefined, user_id: userData.user.id })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotes([data as Note, ...notes]);
    resetCreate();
  };

  const handleUpdate = async () => {
    if (!editingId || !editTitle.trim()) {
      setError("Title is required");
      return;
    }

    const { data, error: updateError } = await supabase
      .from("notes")
      .update({ title: editTitle, content: editContent || undefined, updated_at: new Date().toISOString() })
      .eq("id", editingId)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotes(notes.map((n) => (n.id === editingId ? (data as Note) : n)));
    resetEdit();
  };

  const handleDelete = async (id: number) => {
    const { error: deleteError } = await supabase.from("notes").delete().eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setNotes(notes.filter((n) => n.id !== id));
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content ?? "");
    setIsCreating(false);
    setError(null);
  };

  const startCreate = () => {
    setIsCreating(true);
    resetEdit();
    setCreateTitle("");
    setCreateContent("");
    setError(null);
  };

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Notes</h1>
        {!isCreating && !editingId && (
          <Button onClick={startCreate}>New Note</Button>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {isCreating && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New Note</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteForm
              title={createTitle}
              content={createContent}
              onTitleChange={setCreateTitle}
              onContentChange={setCreateContent}
              onSubmit={handleCreate}
              onCancel={resetCreate}
              submitLabel="Create"
              idPrefix="create"
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {notes.length === 0 && !isCreating ? (
          <p className="text-gray-500 text-center py-8">
            No notes yet. Create your first note!
          </p>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isEditing={editingId === note.id}
              editTitle={editTitle}
              editContent={editContent}
              onEditTitleChange={setEditTitle}
              onEditContentChange={setEditContent}
              onSave={handleUpdate}
              onCancel={resetEdit}
              onEdit={() => startEdit(note)}
              onDelete={() => handleDelete(note.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
