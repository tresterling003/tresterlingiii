import { NewClassForm } from "./NewClassForm";

export default function NewClassPage() {
  return (
    <div className="mx-auto max-w-xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Add a class</h1>
      <p className="mt-1 text-sm text-muted">
        Give it a name and pick a color — you can fill in the rest (pacing, past lessons) from the Import tab once it&rsquo;s created.
      </p>
      <div className="mt-6">
        <NewClassForm />
      </div>
    </div>
  );
}
