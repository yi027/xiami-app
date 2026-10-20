"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PeopleField({ defaultPeople }: { defaultPeople: string[] }) {
  const [people, setPeople] = useState(defaultPeople);
  const [draft, setDraft] = useState("");

  function addPerson() {
    const name = draft.trim();
    if (!name || people.includes(name) || people.length >= 20) return;
    setPeople((current) => [...current, name]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="people" value={people.join("\n")} />
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addPerson();
            }
          }}
          placeholder="輸入姓名後按加入"
          aria-label="相關人員"
          maxLength={40}
        />
        <Button type="button" variant="outline" onClick={addPerson}>
          加入
        </Button>
      </div>
      {people.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {people.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm shadow-sm"
                onClick={() => setPeople((current) => current.filter((item) => item !== name))}
              >
                {name}
                <X className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">移除{name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">還沒有相關人員。可以留空。</p>
      )}
    </div>
  );
}
