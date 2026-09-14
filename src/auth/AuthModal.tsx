import { useState } from "react";
import { useEditor } from "../editor/store";
import { Modal } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { supabase, cloudConfigured } from "./client";
import { Field } from "../editor/controls";
export function AuthModal() {
  const s = useEditor();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const login = async () => {
    if (!supabase) return;
    setError("");
    setBusy(true);
    const { error } = signup
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else if (signup) setError("Check your email to confirm your account.");
    else {
      s.notify("Signed in");
      s.set({ modal: null });
    }
  };
  return (
    <Modal
      open={s.modal === "auth"}
      onClose={() => s.set({ modal: null })}
      title="Your creative workspace"
      description="An account is optional. Local editing is always available."
    >
      <div className="modal-body">
        {cloudConfigured ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <Field label="Email">
                <input
                  aria-label="Email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Password">
                <input
                  aria-label="Password"
                  type="password"
                  value={password}
                  minLength={8}
                  autoComplete={signup ? "new-password" : "current-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Button
                type="submit"
                className="full"
                variant="default"
                disabled={busy}
              >
                {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              </Button>
            </form>
            <div className="button-row">
              {(["google", "github"] as const).map((provider) => (
                <Button
                  key={provider}
                  onClick={() =>
                    void supabase!.auth
                      .signInWithOAuth({
                        provider,
                        options: { redirectTo: location.origin },
                      })
                      .then(({ error }) => {
                        if (error) setError(error.message);
                      })
                  }
                >
                  Continue with {provider === "google" ? "Google" : "GitHub"}
                </Button>
              ))}
            </div>
            <button className="text-link" onClick={() => setSignup(!signup)}>
              {signup
                ? "Already have an account? Sign in"
                : "Create an account"}
            </button>
            {error && <p className="error-message">{error}</p>}
          </>
        ) : (
          <p className="dependency-note">
            Cloud accounts are not configured for this installation. You can
            edit, save locally, and export without signing in. The source
            package includes Supabase email, Google, and GitHub authentication
            setup.
          </p>
        )}
        <Button className="full" onClick={() => s.set({ modal: null })}>
          Continue locally
        </Button>
      </div>
    </Modal>
  );
}
