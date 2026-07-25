"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { AdminGiftDTO } from "@/types/gift";

function SortableGiftRow({
  gift,
  onDelete,
}: {
  gift: AdminGiftDTO;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: gift.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab text-white/30 hover:text-white/70"
      >
        ⠿
      </button>
      {gift.imageUrl ? (
        <img
          src={gift.imageUrl}
          alt=""
          className="h-14 w-14 rounded-lg object-cover"
        />
      ) : (
        <div className="h-14 w-14 rounded-lg bg-white/10" />
      )}
      <div className="flex-1">
        <p className="font-medium">{gift.title}</p>
        <p className="text-xs text-white/50">
          {gift.occasion}
          {gift.price ? ` · ${gift.price}` : ""}
        </p>
      </div>
      <Link href={`/admin/gifts/${gift.id}/edit`}>
        <Button variant="secondary" type="button">
          Edit
        </Button>
      </Link>
      <Button variant="danger" type="button" onClick={() => onDelete(gift.id)}>
        Delete
      </Button>
    </div>
  );
}

export function GiftList({ initialGifts }: { initialGifts: AdminGiftDTO[] }) {
  const router = useRouter();
  const [gifts, setGifts] = useState(initialGifts);
  const sensors = useSensors(useSensor(PointerSensor));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = gifts.findIndex((g) => g.id === active.id);
    const newIndex = gifts.findIndex((g) => g.id === over.id);
    const reordered = arrayMove(gifts, oldIndex, newIndex);
    setGifts(reordered);

    await fetch("/api/admin/gifts/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((g) => g.id) }),
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this gift? This cannot be undone.")) return;
    setGifts((prev) => prev.filter((g) => g.id !== id));
    await fetch(`/api/admin/gifts/${id}`, { method: "DELETE" });
    router.refresh();
  }

  if (gifts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/20 p-8 text-center text-white/50">
        No gifts yet. Add your first one above.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={gifts.map((g) => g.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {gifts.map((gift) => (
            <SortableGiftRow key={gift.id} gift={gift} onDelete={handleDelete} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
