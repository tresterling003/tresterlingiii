import { ImportForm } from "./ImportForm";

export default function ImportPage({ params }: { params: { classId: string } }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-lg font-bold text-ink">Import your planning notes</h2>
      <p className="mt-1 text-sm text-muted">
        Paste the export from your chat conversation for this class — the full year&rsquo;s pacing plan and what
        you&rsquo;ve done so far. We&rsquo;ll read through it and build out your curriculum (units) and timeline (daily log)
        automatically. This only adds — it never deletes anything already here, so it&rsquo;s safe to paste more than once
        (e.g. one chunk per unit) if the dump is long.
      </p>
      <div className="mt-6">
        <ImportForm classId={params.classId} />
      </div>
    </div>
  );
}
