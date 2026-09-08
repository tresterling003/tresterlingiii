import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-rose-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-xl text-white">
            🎒
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Classroom HQ</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your teaching dashboard</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
